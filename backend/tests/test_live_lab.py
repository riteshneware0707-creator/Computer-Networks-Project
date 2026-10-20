import os
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from backend.app.services.live_lab import _stage_wsl_lab
from emulation.demo import (
    LabError,
    lab_container_states,
    measure_route_transition,
    parse_ping,
    record_action,
    run,
    stop_transition_probe,
)


class LiveLabTests(unittest.TestCase):
    def test_parse_ping_returns_loss_and_average_rtt(self):
        output = (
            "3 packets transmitted, 3 received, 0% packet loss, time 2002ms\n"
            "rtt min/avg/max/mdev = 0.043/0.081/0.122/0.031 ms\n"
        )
        self.assertEqual(parse_ping(output), (0.0, 0.081))

    def test_parse_ping_handles_failed_probe(self):
        output = "3 packets transmitted, 0 received, 100% packet loss, time 2045ms\n"
        self.assertEqual(parse_ping(output), (100.0, None))

    @patch(
        "emulation.demo.docker_exec",
        return_value=SimpleNamespace(
            returncode=0,
            stdout=(
                "4 packets transmitted, 3 received, 25% packet loss, time 600ms\n"
                "rtt min/avg/max/mdev = 0.043/0.081/0.122/0.031 ms\n"
            ),
            stderr="",
        ),
    )
    def test_transition_probe_reports_measured_loss_and_counts(self, docker_exec):
        from emulation.demo import TRANSITION_PING_LOG, TRANSITION_PING_PID

        result = stop_transition_probe()
        self.assertEqual(result["transition_packet_loss_pct"], 25.0)
        self.assertEqual(result["transition_packets_transmitted"], 4)
        self.assertEqual(result["transition_packets_received"], 3)
        shell_command = docker_exec.call_args.args[3]
        self.assertIn(TRANSITION_PING_LOG, shell_command)
        self.assertIn(TRANSITION_PING_PID, shell_command)

    def test_route_transition_combines_convergence_and_probe_metrics(self):
        from emulation import demo

        change = Mock()
        probe_result = {
            "transition_packet_loss_pct": 10.0,
            "transition_packets_transmitted": 10,
            "transition_packets_received": 9,
        }
        with patch.object(demo, "start_transition_probe") as start_probe, patch.object(
            demo, "wait_for_route", return_value=1250.0
        ) as wait_route, patch.object(
            demo, "stop_transition_probe", return_value=probe_result
        ) as stop_probe, patch.object(demo.time, "sleep") as sleep:
            result = measure_route_transition("eth3", change)
        start_probe.assert_called_once()
        change.assert_called_once()
        wait_route.assert_called_once()
        stop_probe.assert_called_once()
        sleep.assert_called_once_with(0.4)
        self.assertEqual(result["route_convergence_ms"], 1250.0)
        self.assertEqual(result["transition_packet_loss_pct"], 10.0)

    @patch("emulation.demo.status", return_value={"forwarding_verified": True})
    @patch("emulation.demo.wait_for_route")
    @patch("emulation.demo.run")
    @patch("emulation.demo.lab_container_states", return_value={})
    def test_deploy_cleans_generated_lab_state_before_deploying(
        self, lab_states, run_command, wait_route, status
    ):
        from emulation.demo import deploy

        deploy()
        first_command = run_command.call_args_list[0].args[0]
        self.assertEqual(first_command[:3], ["containerlab", "destroy", "--cleanup"])
        self.assertIn("-t", first_command)

    @patch("emulation.demo.run", return_value=SimpleNamespace(stdout="Docker Desktop\n"))
    def test_containerlab_rejects_docker_desktop_daemon(self, run_command):
        with self.assertRaisesRegex(LabError, "network namespaces"):
            lab_container_states()
        run_command.assert_called_once()

    @patch("emulation.demo.subprocess.run")
    def test_lab_commands_use_configured_native_docker_socket(self, subprocess_run):
        subprocess_run.return_value = SimpleNamespace(returncode=0, stdout="", stderr="")
        with patch.dict(os.environ, {"NETWORK_DOCKER_HOST": "unix:///run/docker-native.sock"}):
            run(["docker", "info"])
        self.assertEqual(
            subprocess_run.call_args.kwargs["env"]["DOCKER_HOST"],
            "unix:///run/docker-native.sock",
        )

    def test_host_entrypoint_uses_linux_line_endings(self):
        script = Path(__file__).resolve().parents[2] / "emulation" / "hosts" / "host-init.sh"
        self.assertNotIn(b"\r", script.read_bytes())

    def test_router_links_use_point_to_point_ospf_networks(self):
        config_dir = Path(__file__).resolve().parents[2] / "emulation" / "configs"
        for router in ("r1", "r2", "r3", "r4"):
            config = (config_dir / f"{router}.conf").read_text(encoding="utf-8")
            self.assertIn(" ip ospf network point-to-point\n", config)
            self.assertIn(" ip ospf hello-interval 1\n", config)
            self.assertIn(" ip ospf dead-interval 4\n", config)

    @patch("backend.app.services.live_lab.subprocess.run")
    def test_wsl_lab_staging_copies_sources_to_linux_native_storage(self, subprocess_run):
        subprocess_run.return_value = SimpleNamespace(returncode=0, stdout="", stderr="")
        _stage_wsl_lab("Ubuntu", "/mnt/c/project/emulation", "/opt/demo/emulation")
        commands = [call.args[0] for call in subprocess_run.call_args_list]
        self.assertEqual(len(commands), 5)
        self.assertIn("/opt/demo/emulation/demo.py", commands[1])
        self.assertIn("/opt/demo/emulation/topology.clab.yml", commands[2])
        self.assertIn("/opt/demo/emulation/hosts/", commands[4])

    def test_action_records_append_json_lines_with_timestamp_and_measurements(self):
        import json
        import tempfile

        from emulation import demo

        with tempfile.TemporaryDirectory() as temporary_dir:
            evidence_path = Path(temporary_dir) / "results" / "evidence.jsonl"
            with patch.object(demo, "EVIDENCE_LOG", evidence_path):
                demo.record_action(
                    "failure",
                    {
                        "route_convergence_ms": 1250.0,
                        "transition_packet_loss_pct": 20.0,
                    },
                    1500.0,
                )
            record = json.loads(evidence_path.read_text(encoding="utf-8"))
        self.assertEqual(record["action"], "failure")
        self.assertEqual(record["route_convergence_ms"], 1250.0)
        self.assertEqual(record["transition_packet_loss_pct"], 20.0)
        self.assertTrue(record["timestamp_utc"])


if __name__ == "__main__":
    unittest.main()
