from backend.app.schemas import ControllerAnalysis, ExperimentSummary
from backend.app.services.ml_model import extract_features, predict, threshold_state
from backend.app.services.routing import available_route_costs


def analyze(experiment: ExperimentSummary) -> ControllerAnalysis:
    prediction, confidence, class_probabilities, model_status = predict(experiment)
    state = prediction or threshold_state(experiment)
    routes, selected, reason = available_route_costs(experiment, state)
    warnings = []
    if prediction is None:
        warnings.append(
            "No ML prediction was produced: train and install the model, and provide all schema features."
        )
    if experiment.routing.forwarding_verified is not True:
        warnings.append("A route recommendation is not evidence of route application or packet forwarding.")

    if state == "link_failure" and selected == "primary":
        reason = (
            "The model/threshold indicates possible link failure, but availability is not explicitly confirmed; "
            "the primary path was not excluded."
        )
    elif state in {"congested", "severely_congested", "link_failure"} and selected == "alternate":
        reason = f"Network state is {state}; {reason}"
    return ControllerAnalysis(
        experiment_id=experiment.id,
        network_state_prediction=prediction,
        prediction_confidence=confidence,
        class_probabilities=class_probabilities,
        model_status=model_status,
        features=extract_features(experiment),
        available_routes=routes,
        selected_route=selected,
        reason=reason,
        route_application_attempted=False,
        forwarding_verified=experiment.routing.forwarding_verified is True,
        warnings=warnings,
    )
