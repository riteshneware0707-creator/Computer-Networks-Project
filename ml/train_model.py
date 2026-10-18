import argparse
import csv
import json
import math
import sys
from pathlib import Path

from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
from sklearn.model_selection import GroupShuffleSplit

FEATURE_NAMES = [
    "packet_loss_pct",
    "average_delay_ms",
    "queue_packets_max",
    "link_utilization_pct",
    "throughput_mbps",
    "primary_link_available",
]
LABELS = ["normal", "congested", "severely_congested", "link_failure"]


def load_dataset(path: Path) -> tuple[list[list[float]], list[str], list[str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    required = {"run_id", "label", *FEATURE_NAMES}
    if not rows or not required.issubset(rows[0]):
        raise ValueError(f"Dataset must contain columns: {', '.join(sorted(required))}")
    x, y, groups = [], [], []
    for row in rows:
        label = row["label"].strip()
        if label not in LABELS:
            raise ValueError(f"Unsupported label {label!r} in run {row['run_id']!r}")
        if not row["run_id"].strip():
            raise ValueError("Every row must have a non-empty run_id")
        values = []
        for name in FEATURE_NAMES:
            value = row[name].strip()
            if value not in {"0", "1"} and name == "primary_link_available":
                raise ValueError("primary_link_available must be 0 or 1")
            parsed = float(value)
            if not math.isfinite(parsed) or parsed < 0:
                raise ValueError(f"Feature {name} must be finite and non-negative")
            values.append(parsed)
        x.append(values)
        y.append(label)
        groups.append(row["run_id"].strip())
    return x, y, groups


def split_by_run(x: list[list[float]], y: list[str], groups: list[str]):
    classes = set(y)
    run_count = len(set(groups))
    for label in classes:
        if len({group for group, actual in zip(groups, y) if actual == label}) < 2:
            raise ValueError(f"Need at least two distinct simulation runs for label {label!r}")
    test_size = max(0.25, len(classes) / run_count)
    if test_size > 0.5:
        raise ValueError("Need enough distinct runs to reserve test data while retaining every label for training")
    for seed in range(100):
        splitter = GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=seed)
        train_idx, test_idx = next(splitter.split(x, y, groups))
        if set(y[index] for index in train_idx) == classes and set(y[index] for index in test_idx) == classes:
            return train_idx, test_idx
    raise ValueError("Could not form a run-isolated split containing every label in train and test sets")


def evaluate(y_true: list[str], y_pred: list[str], labels: list[str]) -> dict:
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_true, y_pred, labels=labels, average="weighted", zero_division=0
    )
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision_weighted": float(precision),
        "recall_weighted": float(recall),
        "f1_weighted": float(f1),
        "confusion_matrix": confusion_matrix(y_true, y_pred, labels=labels).tolist(),
        "labels": labels,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Train and evaluate the network-state Random Forest.")
    parser.add_argument("--dataset", required=True, type=Path, help="CSV generated from distinct NS-3 runs")
    parser.add_argument("--output", type=Path, default=Path("ml/models/network_state.joblib"))
    args = parser.parse_args()
    try:
        x, y, groups = load_dataset(args.dataset)
        train_idx, test_idx = split_by_run(x, y, groups)
    except (OSError, ValueError) as error:
        print(f"Training data error: {error}", file=sys.stderr)
        return 2

    x_train = [x[index] for index in train_idx]
    y_train = [y[index] for index in train_idx]
    x_test = [x[index] for index in test_idx]
    y_test = [y[index] for index in test_idx]
    model = RandomForestClassifier(n_estimators=200, random_state=42, class_weight="balanced")
    model.fit(x_train, y_train)
    forest_predictions = model.predict(x_test).tolist()

    # The threshold baseline is a transparent rule, not a learned model.
    baseline = []
    for row in x_test:
        loss, delay, queue, _utilization, _throughput, primary_available = row
        if primary_available == 0:
            baseline.append("link_failure")
        elif loss >= 50 or delay >= 1000 or queue >= 90:
            baseline.append("severely_congested")
        elif loss >= 5 or delay >= 100 or queue >= 50:
            baseline.append("congested")
        else:
            baseline.append("normal")

    labels = sorted(set(y))
    report = {
        "label_source": "controlled scenario label; not independent diagnosis ground truth",
        "split": "GroupShuffleSplit by run_id; no run appears in both partitions",
        "random_seed": 42,
        "feature_names": FEATURE_NAMES,
        "training_samples": len(train_idx),
        "test_samples": len(test_idx),
        "training_runs": len({groups[index] for index in train_idx}),
        "test_runs": len({groups[index] for index in test_idx}),
        "random_forest": evaluate(y_test, forest_predictions, labels),
        "threshold_baseline": evaluate(y_test, baseline, labels),
    }

    import joblib

    args.output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "feature_names": FEATURE_NAMES, "labels": labels}, args.output)
    report_path = args.output.with_suffix(".metrics.json")
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"model": str(args.output), "report": str(report_path), **report}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
