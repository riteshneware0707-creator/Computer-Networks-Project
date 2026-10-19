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


def _wsl_script_path() -> tuple[str, str]:
    distro = os.environ.get("NETWORK_WSL_DISTRO", "Ubuntu")
    drive, path = ntpath.splitdrive(str(DEMO_SCRIPT.resolve()))
    if not drive or not path.startswith("\\"):
        raise OSError(f"Cannot map the live lab path into WSL: {DEMO_SCRIPT}")
    wsl_path = f"/mnt/{drive[0].lower()}{path.replace(chr(92), '/')}"
    return distro, wsl_path


def run_live_action(action: str) -> dict[str, Any]:
    if action not in SUPPORTED_ACTIONS:
        raise HTTPException(status_code=422, detail="Unsupported live network action")

    try:
        if os.name == "nt":
            distro, script_path = _wsl_script_path()
            command = [
                "wsl.exe",
                "-d",
                distro,
                "-u",
                "root",
                "--",
                "python3",
                script_path,
                action,
            ]
        else:
            command = ["python3", str(DEMO_SCRIPT), action]
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=240 if action in {"deploy", "destroy"} else 90,
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
