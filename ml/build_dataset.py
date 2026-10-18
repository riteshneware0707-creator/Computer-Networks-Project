import argparse
import csv
import json
import math
import re
import sys
from pathlib import Path

FEATURE_NAMES = [
    "packet_loss_pct",
    "average_delay_ms",
    "queue_packets_max",
    "link_utilization_pct",
    "throughput_mbps",
    "primary_link_available",
]
LABELS = {"normal", "congested", "severely_congested", "link_failure"}
ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")


def required_number(data: dict, name: str, *alternates: str) -> float:
    value = next((data[key] for key in (name, *alternates) if key in data), None)
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(float(value))
        or value < 0
    ):
        raise ValueError(f"Missing or invalid numeric feature {name}")
    return float(value)


def build_dataset(results_dir: Path, labels_file: Path, output: Path) -> int:
    labels = json.loads(labels_file.read_text(encoding="utf-8"))
    if not isinstance(labels, dict) or not labels:
        raise ValueError("Labels file must be a non-empty JSON object mapping run IDs to controlled labels")

    rows = []
    for run_id, label in labels.items():
        if not isinstance(run_id, str) or not ID_PATTERN.fullmatch(run_id):
            raise ValueError(f"Invalid run ID: {run_id!r}")
        if not isinstance(label, str) or label not in LABELS:
            raise ValueError(f"Unsupported controlled label for run {run_id!r}: {label!r}")
        result_path = results_dir / f"{run_id}.json"
        if not result_path.is_file():
            raise ValueError(f"Missing result for labeled run {run_id!r}: {result_path}")
        result = json.loads(result_path.read_text(encoding="utf-8"))
        if not isinstance(result, dict):
            raise ValueError(f"Experiment JSON must be an object: {result_path}")

        tx = required_number(result, "totalTxPackets", "txPackets")
        lost = required_number(result, "totalLostPackets", "lostPackets")
        if tx == 0:
            raise ValueError(f"Experiment {run_id!r} has no transmitted packets and cannot provide loss rate")
        loss = required_number(result, "packetLossPct") if "packetLossPct" in result else lost * 100 / tx
        queue_packets = max(
            required_number(result, "r1R2MaxQueuePackets", "maxR1R2QueuePackets", "maxR1R2Queue"),
            required_number(result, "r2R4MaxQueuePackets", "maxR2R4QueuePackets", "maxR2R4Queue"),
        )
        primary_available = result.get("primaryPathAvailable")
        if not isinstance(primary_available, bool):
            raise ValueError(f"Experiment {run_id!r} must record primaryPathAvailable as a boolean")
        if label == "link_failure" and primary_available:
            raise ValueError(f"Run {run_id!r} is labeled link_failure but reports the primary path available")

        row = {
            "run_id": run_id,
            "label": label,
            "packet_loss_pct": loss,
            "average_delay_ms": required_number(result, "averageDelayMs"),
            "queue_packets_max": queue_packets,
            "link_utilization_pct": required_number(
                result, "linkUtilizationPct", "r1R2UtilizationPct", "linkUtilizationPct"
            ),
            "throughput_mbps": required_number(result, "throughputMbps"),
            "primary_link_available": int(primary_available),
        }
        rows.append(row)

    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["run_id", "label", *FEATURE_NAMES])
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create a training CSV from recorded results and explicit controlled scenario labels."
    )
    parser.add_argument("--results", type=Path, default=Path("simulation/results"))
    parser.add_argument("--labels", required=True, type=Path, help="JSON map from unique run ID to scenario label")
    parser.add_argument("--output", type=Path, default=Path("ml/datasets/network-runs.csv"))
    args = parser.parse_args()
    try:
        count = build_dataset(args.results, args.labels, args.output)
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"Dataset generation failed: {error}", file=sys.stderr)
        return 2
    print(f"Wrote {count} labeled NS-3 run(s) to {args.output}")
    print("Labels are controlled scenario labels, not independent diagnosis ground truth.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
