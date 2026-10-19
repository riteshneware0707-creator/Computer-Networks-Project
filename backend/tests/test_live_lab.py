import os
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from backend.app.services.live_lab import _stage_wsl_lab
from emulation.demo import LabError, lab_container_states, parse_ping, run


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

    @patch("backend.app.services.live_lab.subprocess.run")
    def test_wsl_lab_staging_copies_sources_to_linux_native_storage(self, subprocess_run):
        subprocess_run.return_value = SimpleNamespace(returncode=0, stdout="", stderr="")
        _stage_wsl_lab("Ubuntu", "/mnt/c/project/emulation", "/opt/demo/emulation")
        commands = [call.args[0] for call in subprocess_run.call_args_list]
        self.assertEqual(len(commands), 5)
        self.assertIn("/opt/demo/emulation/demo.py", commands[1])
        self.assertIn("/opt/demo/emulation/topology.clab.yml", commands[2])
        self.assertIn("/opt/demo/emulation/hosts/", commands[4])


if __name__ == "__main__":
    unittest.main()
