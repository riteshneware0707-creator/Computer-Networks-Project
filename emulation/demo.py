import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent
TOPOLOGY = ROOT / "topology.clab.yml"
HOST_IMAGE = "cn-live-host:1"
CONTAINER_PREFIX = "clab-self-healing-"
PRIMARY_HOP = "10.0.12.2"
ALTERNATE_HOP = "10.0.13.2"
TRANSITION_PING_LOG = "/tmp/clab-transition-ping.log"
TRANSITION_PING_PID = "/tmp/clab-transition-ping.pid"
EVIDENCE_LOG = ROOT / "results" / "live-demo-evidence.jsonl"


class LabError(RuntimeError):
    pass


def run(command, timeout=20, check=True, cwd=None):
    environment = os.environ.copy()
    environment["DOCKER_HOST"] = os.environ.get(
        "NETWORK_DOCKER_HOST",
        environment.get("DOCKER_HOST", "unix:///var/run/docker.sock"),
    )
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
        cwd=cwd,
        env=environment,
    )
    if check and result.returncode:
        detail = result.stderr.strip() or result.stdout.strip()
        raise LabError(detail or f"Command failed: {' '.join(command)}")
    return result


def container(node):
    return f"{CONTAINER_PREFIX}{node}"


def docker_exec(node, *command, timeout=20, check=True):
    return run(["docker", "exec", container(node), *command], timeout=timeout, check=check)


LAB_NODES = ("pc", "r1", "r2", "r3", "r4", "server")


def lab_container_states():
    info = run(["docker", "info", "--format", "{{.OperatingSystem}}"], timeout=10)
    if "Docker Desktop" in info.stdout:
        raise LabError(
            "Containerlab needs a Docker Engine running locally in Linux so it can "
            "join router network namespaces. Docker Desktop's WSL-integrated daemon "
            "does not expose those namespaces to Ubuntu WSL. Use a native Docker "
            "Engine inside Ubuntu WSL or on a Linux host."
        )
    states = {}
    for node in LAB_NODES:
        result = run(
            ["docker", "inspect", "-f", "{{.State.Status}}", container(node)],
            check=False,
        )
        states[node] = result.stdout.strip() if result.returncode == 0 else "missing"
    return states


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


def wait_for_route(expected_interface, timeout=25, started_at=None):
    started_at = time.monotonic() if started_at is None else started_at
    deadline = started_at + timeout
    while time.monotonic() < deadline:
        _, interface = route_to_server()
        if interface == expected_interface:
            return round((time.monotonic() - started_at) * 1000, 1)
        time.sleep(0.25)
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


def ping(node, destination, interface=None, count=3):
    command = ["ping", "-c", str(count), "-W", "2"]
    if interface:
        command.extend(["-I", interface])
    command.append(destination)
    result = docker_exec(node, *command, timeout=12, check=False)
    return parse_ping(result.stdout + result.stderr)


def start_transition_probe():
    result = docker_exec(
        "pc",
        "sh",
        "-c",
        f"(ping -D -i 0.2 10.0.4.2 > {TRANSITION_PING_LOG} 2>&1 "
        f"& echo $! > {TRANSITION_PING_PID})",
        check=False,
    )
    if result.returncode:
        raise LabError(f"Could not start end-to-end recovery probes: {result.stderr.strip()}")
    pid = docker_exec("pc", "cat", TRANSITION_PING_PID, check=False)
    if pid.returncode or not pid.stdout.strip().isdigit():
        raise LabError("The end-to-end recovery probe did not start.")


def stop_transition_probe():
    result = docker_exec(
        "pc",
        "sh",
        "-c",
        f'kill -INT "$(cat {TRANSITION_PING_PID})"; sleep 0.3; '
        f"cat {TRANSITION_PING_LOG}; rm -f {TRANSITION_PING_PID} {TRANSITION_PING_LOG}",
        check=False,
    )
    if result.returncode:
        raise LabError(f"Could not collect end-to-end recovery probes: {result.stderr.strip()}")
    output = result.stdout + result.stderr
    loss, _ = parse_ping(output)
    counts = re.search(r"(\d+) packets transmitted, (\d+) (?:packets )?received", output)
    if loss is None or counts is None:
        raise LabError(f"Recovery probe output did not include packet statistics: {output.strip()}")
    return {
        "transition_packet_loss_pct": loss,
        "transition_packets_transmitted": int(counts.group(1)),
        "transition_packets_received": int(counts.group(2)),
    }


def measure_route_transition(expected_interface, change, timeout=60):
    start_transition_probe()
    started_at = time.monotonic()
    try:
        change()
        convergence_ms = wait_for_route(
            expected_interface,
            timeout=timeout,
            started_at=started_at,
        )
        time.sleep(0.4)
        probe_metrics = stop_transition_probe()
    except (LabError, OSError, subprocess.TimeoutExpired):
        stop_transition_probe()
        raise
    return {
        "route_convergence_ms": convergence_ms,
        **probe_metrics,
    }


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
    states = lab_container_states()
    if not all(state == "running" for state in states.values()):
        existing = {node: state for node, state in states.items() if state != "missing"}
        if existing:
            details = ", ".join(f"{node}: {state}" for node, state in existing.items())
            event = event or f"Lab deployment is incomplete ({details}); deploy again to recreate it."
        return {
            "available": True,
            "running": False,
            "network_state": "error" if existing else "stopped",
            "selected_route": None,
            "primary_link_delay_ms": None,
            "packet_loss_pct": None,
            "average_delay_ms": None,
            "throughput_mbps": None,
            "primary_tx_packets": None,
            "alternate_tx_packets": None,
            "forwarding_verified": False,
            "route_convergence_ms": None,
            "transition_packet_loss_pct": None,
            "transition_packets_transmitted": None,
            "transition_packets_received": None,
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
        "route_convergence_ms": None,
        "transition_packet_loss_pct": None,
        "transition_packets_transmitted": None,
        "transition_packets_received": None,
        "event": event,
    }


def deploy():
    lab_container_states()
    run(
        ["containerlab", "destroy", "--cleanup", "-t", str(TOPOLOGY)],
        timeout=180,
        cwd=ROOT,
    )
    run(
        ["docker", "build", "-t", HOST_IMAGE, str(ROOT / "hosts")],
        timeout=180,
    )
    run(
        ["containerlab", "deploy", "-t", str(TOPOLOGY)],
        timeout=240,
        cwd=ROOT,
    )
    wait_for_route("eth2", timeout=90)
    result = status("Containerlab deployed; live host-to-server traffic is passing.")
    if not result["forwarding_verified"]:
        raise LabError("The lab started, but host-to-server forwarding could not be verified.")
    return result


def reset():
    def restore():
        for node, interface in (("r1", "eth2"), ("r2", "eth1")):
            docker_exec(node, "tc", "qdisc", "del", "dev", interface, "root", check=False)
            docker_exec(node, "ip", "link", "set", "dev", interface, "up", check=False)
        set_ospf_cost("r1", "eth2", 10)
        set_ospf_cost("r2", "eth1", 10)

    transition = measure_route_transition("eth2", restore)
    result = status("Primary route restored; congestion shaping and failure cleared.")
    result.update(transition)
    return result


def induce_congestion():
    docker_exec("r1", "tc", "qdisc", "replace", "dev", "eth2", "root", "netem", "delay", "250ms")
    docker_exec("r2", "tc", "qdisc", "replace", "dev", "eth1", "root", "netem", "delay", "250ms")
    _, measured_delay = ping("r1", "10.0.12.2", "eth2")
    if measured_delay is None:
        raise LabError("Could not measure delay on the primary link.")
    if measured_delay < 50:
        raise LabError(
            f"Injected congestion was not measured above the 50 ms threshold "
            f"(measured {measured_delay:.2f} ms)."
        )

    def raise_cost():
        set_ospf_cost("r1", "eth2", 100)
        set_ospf_cost("r2", "eth1", 100)

    transition = measure_route_transition("eth3", raise_cost)
    result = status(
        f"Controller measured {measured_delay:.1f} ms primary-link delay "
        "and raised its OSPF cost; traffic moved to the alternate route."
    )
    result.update(transition)
    return result


def induce_failure():
    def fail_primary():
        docker_exec("r1", "ip", "link", "set", "dev", "eth2", "down")
        docker_exec("r2", "ip", "link", "set", "dev", "eth1", "down")

    transition = measure_route_transition("eth3", fail_primary)
    result = status("Primary link failed; OSPF withdrew the route and traffic uses the alternate.")
    result.update(transition)
    return result


def record_action(action, result, duration_ms):
    EVIDENCE_LOG.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "duration_ms": round(duration_ms, 1),
        **result,
    }
    with EVIDENCE_LOG.open("a", encoding="utf-8") as output:
        output.write(json.dumps(record) + "\n")


def main():
    if len(sys.argv) != 2:
        raise LabError("Usage: demo.py status|deploy|congestion|failure|reset|destroy")
    action = sys.argv[1]
    action_started_at = time.monotonic()
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
            ["containerlab", "destroy", "--cleanup", "-t", str(TOPOLOGY)],
            timeout=120,
            cwd=ROOT,
        )
        result = status("Containerlab stopped.")
    else:
        raise LabError(f"Unsupported action: {action}")
    if action != "status":
        record_action(action, result, (time.monotonic() - action_started_at) * 1000)
        result["evidence_log"] = str(EVIDENCE_LOG)
    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except (LabError, OSError, subprocess.TimeoutExpired) as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr)
        sys.exit(1)
