import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parent
TOPOLOGY = ROOT / "topology.clab.yml"
HOST_IMAGE = "cn-live-host:1"
CONTAINER_PREFIX = "clab-self-healing-"
PRIMARY_HOP = "10.0.12.2"
ALTERNATE_HOP = "10.0.13.2"


class LabError(RuntimeError):
    pass


def run(command, timeout=20, check=True, cwd=None):
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
        cwd=cwd,
    )
    if check and result.returncode:
        detail = result.stderr.strip() or result.stdout.strip()
        raise LabError(detail or f"Command failed: {' '.join(command)}")
    return result


def container(node):
    return f"{CONTAINER_PREFIX}{node}"


def docker_exec(node, *command, timeout=20, check=True):
    return run(["docker", "exec", container(node), *command], timeout=timeout, check=check)


def lab_running():
    run(["docker", "info"], timeout=10)
    result = run(
        ["docker", "inspect", "-f", "{{.State.Running}}", container("r1")],
        check=False,
    )
    return result.returncode == 0 and result.stdout.strip() == "true"


def set_ospf_cost(node, interface, cost):
    docker_exec(
        node,
        "vtysh",
        "-c",
        "configure terminal",
        "-c",
        f"interface {interface}",
        "-c",
        f"ip ospf cost {cost}",
        "-c",
        "end",
    )


def route_to_server():
    result = docker_exec("r1", "ip", "route", "get", "10.0.4.2", check=False)
    if result.returncode:
        return None, None
    output = result.stdout.strip()
    next_hop = re.search(r"\bvia\s+(\d+\.\d+\.\d+\.\d+)", output)
    interface = re.search(r"\bdev\s+(\S+)", output)
    return (
        next_hop.group(1) if next_hop else None,
        interface.group(1) if interface else None,
    )


def wait_for_route(expected_interface, timeout=25):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        _, interface = route_to_server()
        if interface == expected_interface:
            return
        time.sleep(1)
    next_hop, interface = route_to_server()
    raise LabError(
        f"Route did not converge to {expected_interface}; "
        f"current interface={interface}, next hop={next_hop}"
    )


def parse_ping(output):
    loss = re.search(r"([\d.]+)% packet loss", output)
    rtt = re.search(r"=\s*[\d.]+/([\d.]+)/", output)
    return (
        float(loss.group(1)) if loss else None,
        float(rtt.group(1)) if rtt else None,
    )


def ping(node, destination, interface=None):
    command = ["ping", "-c", "3", "-W", "2"]
    if interface:
        command.extend(["-I", interface])
    command.append(destination)
    result = docker_exec(node, *command, timeout=12, check=False)
    return parse_ping(result.stdout + result.stderr)


def interface_packets(interface):
    result = docker_exec(
        "r1",
        "cat",
        f"/sys/class/net/{interface}/statistics/tx_packets",
        check=False,
    )
    try:
        return int(result.stdout.strip()) if result.returncode == 0 else None
    except ValueError:
        return None


def status(event=None):
    if not lab_running():
        return {
            "available": True,
            "running": False,
            "network_state": "stopped",
            "selected_route": None,
            "primary_link_delay_ms": None,
            "packet_loss_pct": None,
            "average_delay_ms": None,
            "throughput_mbps": None,
            "primary_tx_packets": None,
            "alternate_tx_packets": None,
            "forwarding_verified": False,
            "event": event,
        }

    next_hop, interface = route_to_server()
    _, link_delay = ping("r1", "10.0.12.2", "eth2")
    primary_before = interface_packets("eth2")
    alternate_before = interface_packets("eth3")
    packet_loss, average_delay = ping("pc", "10.0.4.2")
    iperf = docker_exec(
        "pc", "iperf3", "-c", "10.0.4.2", "-t", "1", "-J", timeout=15, check=False
    )
    throughput = None
    if iperf.returncode == 0:
        try:
            report = json.loads(iperf.stdout)
            throughput = report["end"]["sum_received"]["bits_per_second"] / 1_000_000
        except (KeyError, json.JSONDecodeError, TypeError):
            throughput = None

    selected_route = (
        "primary" if next_hop == PRIMARY_HOP else
        "alternate" if next_hop == ALTERNATE_HOP else None
    )
    primary_state = docker_exec("r1", "cat", "/sys/class/net/eth2/operstate", check=False)
    qdisc = docker_exec("r1", "tc", "qdisc", "show", "dev", "eth2", check=False)
    if "down" in primary_state.stdout:
        network_state = "link_failure"
    elif "netem" in qdisc.stdout and selected_route == "alternate":
        network_state = "congested"
    else:
        network_state = "normal"

    primary_after = interface_packets("eth2")
    alternate_after = interface_packets("eth3")
    return {
        "available": True,
        "running": True,
        "network_state": network_state,
        "selected_route": selected_route,
        "primary_link_delay_ms": link_delay,
        "packet_loss_pct": packet_loss,
        "average_delay_ms": average_delay,
        "throughput_mbps": throughput,
        "primary_tx_packets": (
            max(0, primary_after - primary_before)
            if primary_before is not None and primary_after is not None
            else None
        ),
        "alternate_tx_packets": (
            max(0, alternate_after - alternate_before)
            if alternate_before is not None and alternate_after is not None
            else None
        ),
        "forwarding_verified": (
            selected_route is not None and packet_loss is not None and packet_loss < 100
        ),
        "event": event,
    }


def deploy():
    run(
        ["docker", "build", "-t", HOST_IMAGE, str(ROOT / "hosts")],
        timeout=180,
    )
    run(
        ["containerlab", "deploy", "-t", str(TOPOLOGY)],
        timeout=240,
        cwd=ROOT,
    )
    wait_for_route("eth2", timeout=45)
    return status("Containerlab deployed; live host-to-server traffic is passing.")


def reset():
    for node, interface in (("r1", "eth2"), ("r2", "eth1")):
        docker_exec(node, "tc", "qdisc", "del", "dev", interface, "root", check=False)
        docker_exec(node, "ip", "link", "set", "dev", interface, "up", check=False)
    set_ospf_cost("r1", "eth2", 10)
    set_ospf_cost("r2", "eth1", 10)
    wait_for_route("eth2")
    return status("Primary route restored; congestion shaping and failure cleared.")


def induce_congestion():
    docker_exec("r1", "tc", "qdisc", "replace", "dev", "eth2", "root", "netem", "delay", "250ms")
    docker_exec("r2", "tc", "qdisc", "replace", "dev", "eth1", "root", "netem", "delay", "250ms")
    _, measured_delay = ping("r1", "10.0.12.2", "eth2")
    if measured_delay is None:
        raise LabError("Could not measure delay on the primary link.")
    if measured_delay >= 50:
        set_ospf_cost("r1", "eth2", 100)
        set_ospf_cost("r2", "eth1", 100)
    else:
        raise LabError(
            f"Injected congestion was not measured above the 50 ms threshold "
            f"(measured {measured_delay:.2f} ms)."
        )
    wait_for_route("eth3")
    return status(
        f"Controller measured {measured_delay:.1f} ms primary-link delay "
        "and raised its OSPF cost; traffic moved to the alternate route."
    )


def induce_failure():
    docker_exec("r1", "ip", "link", "set", "dev", "eth2", "down")
    docker_exec("r2", "ip", "link", "set", "dev", "eth1", "down")
    wait_for_route("eth3")
    return status("Primary link failed; OSPF withdrew the route and traffic uses the alternate.")


def main():
    if len(sys.argv) != 2:
        raise LabError("Usage: demo.py status|deploy|congestion|failure|reset|destroy")
    action = sys.argv[1]
    if action == "status":
        result = status()
    elif action == "deploy":
        result = deploy()
    elif action == "congestion":
        result = induce_congestion()
    elif action == "failure":
        result = induce_failure()
    elif action == "reset":
        result = reset()
    elif action == "destroy":
        run(
            ["containerlab", "destroy", "-t", str(TOPOLOGY)],
            timeout=120,
            cwd=ROOT,
        )
        result = status("Containerlab stopped.")
    else:
        raise LabError(f"Unsupported action: {action}")
    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except (LabError, OSError, subprocess.TimeoutExpired) as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr)
        sys.exit(1)
