import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from jsonschema import Draft202012Validator, ValidationError

from backend.app.schemas import ExperimentSummary, MetricValues, RoutingEvidence

EXPERIMENT_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_RESULTS_DIR = PROJECT_ROOT / "simulation" / "results"
SCHEMA_PATH = PROJECT_ROOT / "simulation" / "schema.json"
SCHEMA = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
VALIDATOR = Draft202012Validator(SCHEMA)


def get_results_dir() -> Path:
    import os

    configured = os.environ.get("NETWORK_RESULTS_DIR")
    return Path(configured).expanduser().resolve() if configured else DEFAULT_RESULTS_DIR


def _number(data: dict[str, Any], *names: str) -> float | None:
    for name in names:
        value = data.get(name)
        if isinstance(value, bool):
            continue
        if isinstance(value, (int, float)):
            parsed = float(value)
            if not math.isfinite(parsed):
                raise HTTPException(status_code=422, detail=f"Experiment metric {name} must be finite")
            return parsed
    return None


def _count(data: dict[str, Any], *names: str) -> int | None:
    value = _number(data, *names)
    if value is None:
        return None
    if value < 0 or not value.is_integer():
        raise HTTPException(status_code=422, detail=f"Experiment counter {names[0]} must be a non-negative integer")
    return int(value)


def _normalise(experiment_id: str, file_path: Path) -> ExperimentSummary:
    try:
        raw = json.loads(file_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=422, detail=f"Invalid experiment JSON: {file_path.name}") from error
    if not isinstance(raw, dict):
        raise HTTPException(status_code=422, detail=f"Experiment JSON must be an object: {file_path.name}")
    try:
        VALIDATOR.validate(raw)
    except ValidationError as error:
        location = ".".join(str(part) for part in error.absolute_path) or "root"
        raise HTTPException(
            status_code=422,
            detail=f"Experiment schema error in {file_path.name} at {location}: {error.message}",
        ) from error

    tx = _count(raw, "totalTxPackets", "txPackets")
    rx = _count(raw, "totalRxPackets", "rxPackets")
    lost = _count(raw, "totalLostPackets", "lostPackets")
    if lost is None and tx is not None and rx is not None:
        lost = max(0, tx - rx)
    loss_pct = _number(raw, "packetLossPct")
    if loss_pct is None and tx and lost is not None:
        loss_pct = lost * 100.0 / tx

    queues = [
        value
        for value in (
            _count(raw, "r1R2MaxQueuePackets", "maxR1R2QueuePackets", "maxR1R2Queue"),
            _count(raw, "r2R4MaxQueuePackets", "maxR2R4QueuePackets", "maxR2R4Queue"),
        )
        if value is not None
    ]
    queue_bytes = [
        value
        for value in (
            _count(raw, "r1R2MaxQueueBytes", "maxR1R2QueueBytes"),
            _count(raw, "r2R4MaxQueueBytes", "maxR2R4QueueBytes"),
        )
        if value is not None
    ]
    primary_packets = _count(raw, "r1R2Packets")
    alternate_packets = _count(raw, "r1R3Packets")
    alternate_out = _count(raw, "r3R4Packets")
    explicit_alternate = raw.get("alternateTrafficDetected")
    if not isinstance(explicit_alternate, bool):
        explicit_alternate = raw.get("alternatePathTraffic")
    if not isinstance(explicit_alternate, bool) and alternate_packets is not None and alternate_out is not None:
        explicit_alternate = alternate_packets > 0 and alternate_out > 0
    route_switch_time = _number(raw, "routeSwitchTimeSec")
    if route_switch_time is not None and route_switch_time < 0:
        route_switch_time = None

    if explicit_alternate is True and alternate_packets and alternate_out:
        observed_path = "PC → R1 → R3 → R4 → Server"
    elif primary_packets:
        observed_path = "PC → R1 → R2 → R4 → Server"
    else:
        observed_path = None

    # A positive alternate-path counter proves traversal, but a verified switch also
    # requires a recorded switch time. Explicit false evidence always takes precedence.
    forwarding_verified = (
        explicit_alternate and bool(alternate_packets) and bool(alternate_out) and route_switch_time is not None
    )
    if explicit_alternate is False:
        forwarding_verified = False

    route = raw.get("finalRoute")
    if not isinstance(route, str):
        route = raw.get("selectedRoute")
    if not isinstance(route, str):
        route = None

    metrics = MetricValues(
        transmitted_packets=tx,
        received_packets=rx,
        lost_packets=lost,
        packet_loss_pct=loss_pct,
        average_delay_ms=_number(raw, "averageDelayMs"),
        throughput_mbps=_number(raw, "throughputMbps"),
        queue_packets_max=max(queues) if queues else None,
        queue_bytes_max=max(queue_bytes) if queue_bytes else None,
        link_utilization_pct=_number(raw, "r1R2UtilizationPct", "linkUtilizationPct"),
        r1_r2_packets=primary_packets,
        r2_r4_packets=_count(raw, "r2R4Packets"),
        r1_r3_packets=alternate_packets,
        r3_r4_packets=alternate_out,
    )

    updated = datetime.fromtimestamp(file_path.stat().st_mtime, timezone.utc).isoformat()
    return ExperimentSummary(
        id=experiment_id,
        scenario=str(raw.get("scenario", experiment_id)),
        simulation_duration_sec=_number(raw, "simulationTimeSec"),
        metrics=metrics,
        routing=RoutingEvidence(
            selected_route=route,
            route_application_attempted=(
                raw.get("routeApplicationAttempted")
                if isinstance(raw.get("routeApplicationAttempted"), bool)
                else None
            ),
            forwarding_verified=forwarding_verified,
            observed_path=observed_path,
            route_switch_time_sec=route_switch_time,
            alternate_traffic_detected=explicit_alternate,
        ),
        source_file=file_path.name,
        updated_at=updated,
        raw=raw,
    )


def list_experiments() -> list[ExperimentSummary]:
    root = get_results_dir()
    if not root.exists():
        return []
    files = sorted(
        (path for path in root.glob("*.json") if path.is_file()),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    experiments = []
    for path in files:
        if not EXPERIMENT_ID.fullmatch(path.stem):
            continue
        experiments.append(_normalise(path.stem, path))
    return experiments


def get_experiment(experiment_id: str) -> ExperimentSummary:
    if not EXPERIMENT_ID.fullmatch(experiment_id):
        raise HTTPException(status_code=400, detail="Invalid experiment identifier")
    path = get_results_dir() / f"{experiment_id}.json"
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"Experiment not found: {experiment_id}")
    return _normalise(experiment_id, path)
