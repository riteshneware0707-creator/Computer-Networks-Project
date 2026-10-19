import json
import ntpath
import os
import subprocess
from pathlib import Path
from typing import Any

from fastapi import HTTPException

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEMO_SCRIPT = PROJECT_ROOT / "emulation" / "demo.py"
SUPPORTED_ACTIONS = {"status", "deploy", "congestion", "failure", "reset", "destroy"}
WSL_RUNTIME_DIR = os.environ.get("NETWORK_WSL_RUNTIME_DIR", "/opt/self-healing-network")


def _wsl_paths() -> tuple[str, str, str]:
    distro = os.environ.get("NETWORK_WSL_DISTRO", "Ubuntu")
    drive, path = ntpath.splitdrive(str(DEMO_SCRIPT.parent.resolve()))
    if not drive or not path.startswith("\\"):
        raise OSError(f"Cannot map the live lab path into WSL: {DEMO_SCRIPT}")
    source_dir = f"/mnt/{drive[0].lower()}{path.replace(chr(92), '/')}"
    return distro, source_dir, f"{WSL_RUNTIME_DIR}/emulation"


def _stage_wsl_lab(distro: str, source_dir: str, runtime_dir: str) -> None:
    wsl = ["wsl.exe", "-d", distro, "-u", "root", "--"]

    def stage(command: list[str]) -> None:
        result = subprocess.run(
            wsl + command,
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        if result.returncode:
            detail = result.stderr.strip() or result.stdout.strip()
            raise OSError(detail or f"WSL staging command failed: {' '.join(command)}")

    stage(["mkdir", "-p", f"{runtime_dir}/configs", f"{runtime_dir}/hosts"])
    for source, destination in (
        (f"{source_dir}/demo.py", f"{runtime_dir}/demo.py"),
        (f"{source_dir}/topology.clab.yml", f"{runtime_dir}/topology.clab.yml"),
    ):
        stage(["cp", "-f", source, destination])
    for directory in ("configs", "hosts"):
        stage(["cp", "-a", f"{source_dir}/{directory}/.", f"{runtime_dir}/{directory}/"])


def run_live_action(action: str) -> dict[str, Any]:
    if action not in SUPPORTED_ACTIONS:
        raise HTTPException(status_code=422, detail="Unsupported live network action")

    try:
        if os.name == "nt":
            distro, source_dir, runtime_dir = _wsl_paths()
            _stage_wsl_lab(distro, source_dir, runtime_dir)
            command = [
                "wsl.exe",
                "-d",
                distro,
                "-u",
                "root",
                "--",
                "env",
                f"NETWORK_DOCKER_HOST={os.environ.get('NETWORK_WSL_DOCKER_HOST', 'unix:///run/docker-native.sock')}",
                "python3",
                f"{runtime_dir}/demo.py",
                action,
            ]
        else:
            command = ["python3", str(DEMO_SCRIPT), action]
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=600 if action == "deploy" else 180,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as error:
        if action == "status":
            return {
                "available": False,
                "running": False,
                "network_state": "unavailable",
                "selected_route": None,
                "primary_link_delay_ms": None,
                "packet_loss_pct": None,
                "average_delay_ms": None,
                "throughput_mbps": None,
                "primary_tx_packets": None,
                "alternate_tx_packets": None,
                "forwarding_verified": False,
                "event": str(error),
            }
        raise HTTPException(status_code=503, detail=f"Live lab command failed: {error}") from error

    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "Live lab command failed."
        if action == "status":
            try:
                payload = json.loads(detail)
                if isinstance(payload, dict) and isinstance(payload.get("error"), str):
                    detail = payload["error"]
            except json.JSONDecodeError:
                pass
            return {
                "available": False,
                "running": False,
                "network_state": "unavailable",
                "selected_route": None,
                "primary_link_delay_ms": None,
                "packet_loss_pct": None,
                "average_delay_ms": None,
                "throughput_mbps": None,
                "primary_tx_packets": None,
                "alternate_tx_packets": None,
                "forwarding_verified": False,
                "event": detail,
            }
        raise HTTPException(status_code=503, detail=detail)

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=502, detail="Live lab returned invalid JSON.") from error
    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="Live lab returned an invalid response.")
    return payload
