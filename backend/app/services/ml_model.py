import os
from pathlib import Path
from typing import Any

import joblib
from fastapi import HTTPException

from backend.app.schemas import ExperimentSummary

PROJECT_ROOT = Path(__file__).resolve().parents[3]
FEATURE_NAMES = (
    "packet_loss_pct",
    "average_delay_ms",
    "queue_packets_max",
    "link_utilization_pct",
    "throughput_mbps",
    "primary_link_available",
)


def extract_features(experiment: ExperimentSummary) -> dict[str, float | bool | None]:
    return {
        "packet_loss_pct": experiment.metrics.packet_loss_pct,
        "average_delay_ms": experiment.metrics.average_delay_ms,
        "queue_packets_max": experiment.metrics.queue_packets_max,
        "link_utilization_pct": experiment.metrics.link_utilization_pct,
        "throughput_mbps": experiment.metrics.throughput_mbps,
        "primary_link_available": (
            experiment.raw.get("primaryPathAvailable")
            if isinstance(experiment.raw.get("primaryPathAvailable"), bool)
            else (
                experiment.raw.get("primaryLinkAvailable")
                if isinstance(experiment.raw.get("primaryLinkAvailable"), bool)
                else None
            )
        ),
    }


def _model_path() -> Path:
    configured = os.environ.get("NETWORK_MODEL_PATH")
    return Path(configured).expanduser().resolve() if configured else PROJECT_ROOT / "ml" / "models" / "network_state.joblib"


def predict(
    experiment: ExperimentSummary,
) -> tuple[str | None, float | None, dict[str, float] | None, str]:
    path = _model_path()
    if not path.is_file():
        return None, None, None, "unavailable"

    features = extract_features(experiment)
    if any(features[name] is None for name in FEATURE_NAMES):
        return None, None, None, "incomplete_features"

    artifact: dict[str, Any] = joblib.load(path)
    model = artifact.get("model")
    schema = artifact.get("feature_names")
    if model is None or schema != list(FEATURE_NAMES):
        raise HTTPException(status_code=500, detail="ML model artifact has an incompatible feature schema")
    row = [[features[name] for name in FEATURE_NAMES]]
    predicted = str(model.predict(row)[0])
    confidence = None
    class_probabilities = None
    if hasattr(model, "predict_proba"):
        probabilities = model.predict_proba(row)[0]
        confidence = float(max(probabilities))
        class_probabilities = {
            str(label): float(probability)
            for label, probability in zip(model.classes_, probabilities)
        }
    return predicted, confidence, class_probabilities, "ready"


def threshold_state(experiment: ExperimentSummary) -> str:
    features = extract_features(experiment)
    if features["primary_link_available"] is False:
        return "link_failure"
    loss = features["packet_loss_pct"] or 0.0
    delay = features["average_delay_ms"] or 0.0
    queue = features["queue_packets_max"] or 0.0
    if loss >= 50 or delay >= 1000 or queue >= 90:
        return "severely_congested"
    if loss >= 5 or delay >= 100 or queue >= 50:
        return "congested"
    return "normal"
