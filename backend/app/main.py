import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import HTTPException

from backend.app.schemas import (
    AnalyzeRequest,
    ControllerAnalysis,
    CurrentRouteState,
    EventsResponse,
    ExperimentList,
    ExperimentSummary,
    LiveLabActionRequest,
    NetworkEvent,
    TopologyResponse,
)
from backend.app.services.controller import analyze
from backend.app.services.experiments import get_experiment, get_results_dir, list_experiments
from backend.app.services.live_lab import run_live_action

app = FastAPI(
    title="Self-Healing Adaptive Network API",
    version="0.1.0",
    description="Live Containerlab/FRR controls and validated access to historical NS-3 experiments.",
)
origins = [
    origin.strip()
    for origin in os.environ.get(
        "NETWORK_ALLOWED_ORIGINS",
        "http://localhost:3000,http://localhost:5173",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

TOPOLOGY = TopologyResponse(
    nodes=[
        {"id": "PC", "type": "host", "label": "PC"},
        {"id": "R1", "type": "router", "label": "R1"},
        {"id": "R2", "type": "router", "label": "R2"},
        {"id": "R3", "type": "router", "label": "R3"},
        {"id": "R4", "type": "router", "label": "R4"},
        {"id": "Server", "type": "host", "label": "Server"},
    ],
    links=[
        {"id": "PC-R1", "source": "PC", "target": "R1", "bandwidth_mbps": 10, "delay_ms": 5, "path": "shared"},
        {"id": "R1-R2", "source": "R1", "target": "R2", "bandwidth_mbps": 2, "delay_ms": 10, "path": "primary"},
        {"id": "R2-R4", "source": "R2", "target": "R4", "bandwidth_mbps": 2, "delay_ms": 10, "path": "primary"},
        {"id": "R1-R3", "source": "R1", "target": "R3", "bandwidth_mbps": 10, "delay_ms": 20, "path": "alternate"},
        {"id": "R3-R4", "source": "R3", "target": "R4", "bandwidth_mbps": 10, "delay_ms": 20, "path": "alternate"},
        {"id": "R4-Server", "source": "R4", "target": "Server", "bandwidth_mbps": 10, "delay_ms": 5, "path": "shared"},
    ],
    route_verification="Per-experiment packet counters; recommendations are not verification.",
)


@app.get("/api/health")
def health() -> dict[str, str | int]:
    return {"status": "ok", "service": app.title, "experiments_available": len(list_experiments())}


@app.get("/api/topology", response_model=TopologyResponse)
def topology() -> TopologyResponse:
    return TOPOLOGY


@app.get("/api/experiments", response_model=ExperimentList)
def experiments() -> ExperimentList:
    return ExperimentList(experiments=list_experiments())


@app.get("/api/experiments/{experiment_id}", response_model=ExperimentSummary)
def experiment(experiment_id: str) -> ExperimentSummary:
    return get_experiment(experiment_id)


@app.get("/api/routes/current", response_model=CurrentRouteState)
def current_route() -> CurrentRouteState:
    experiments_found = list_experiments()
    if not experiments_found:
        raise HTTPException(status_code=404, detail=f"No experiment JSON files found in {get_results_dir()}")
    latest = experiments_found[0]
    return CurrentRouteState(
        experiment_id=latest.id,
        reported_route_selection=latest.routing.selected_route,
        observed_forwarding_path=latest.routing.observed_path,
        route_application_attempted=latest.routing.route_application_attempted,
        forwarding_verified=latest.routing.forwarding_verified,
        route_switch_time_sec=latest.routing.route_switch_time_sec,
    )


@app.get("/api/events", response_model=EventsResponse)
def events(limit: int = 50) -> EventsResponse:
    if not 1 <= limit <= 100:
        raise HTTPException(status_code=422, detail="limit must be between 1 and 100")
    entries: list[NetworkEvent] = []
    for recorded in list_experiments():
        entries.append(
            NetworkEvent(
                id=f"{recorded.id}-imported",
                experiment_id=recorded.id,
                simulation_time_sec=recorded.simulation_duration_sec,
                kind="experiment_imported",
                message=f"Recorded experiment {recorded.scenario} is available.",
                severity="info",
            )
        )
        if recorded.routing.route_switch_time_sec is not None:
            entries.append(
                NetworkEvent(
                    id=f"{recorded.id}-route-decision",
                    experiment_id=recorded.id,
                    simulation_time_sec=recorded.routing.route_switch_time_sec,
                    kind="route_switch_decision_recorded",
                    message="A route-switch decision time is present in the result file.",
                    severity="warning",
                )
            )
        if recorded.routing.route_application_attempted is True:
            entries.append(
                NetworkEvent(
                    id=f"{recorded.id}-route-application",
                    experiment_id=recorded.id,
                    simulation_time_sec=recorded.routing.route_switch_time_sec,
                    kind="route_application_attempted",
                    message="The result file records that route application was attempted.",
                    severity="info",
                )
            )
        if recorded.routing.forwarding_verified is not None:
            verified = recorded.routing.forwarding_verified
            entries.append(
                NetworkEvent(
                    id=f"{recorded.id}-forwarding",
                    experiment_id=recorded.id,
                    simulation_time_sec=recorded.raw.get("firstAlternateTrafficTimeSec"),
                    kind="alternate_forwarding_verified" if verified else "alternate_forwarding_not_verified",
                    message=(
                        "Alternate-link packet counters verified forwarding."
                        if verified
                        else "Available evidence does not verify alternate-path forwarding."
                    ),
                    severity="success" if verified else "warning",
                )
            )
    return EventsResponse(events=entries[:limit])


@app.get("/api/metrics/latest", response_model=ExperimentSummary)
def latest_metrics() -> ExperimentSummary:
    experiments_found = list_experiments()
    if not experiments_found:
        raise HTTPException(status_code=404, detail=f"No experiment JSON files found in {get_results_dir()}")
    return experiments_found[0]


@app.post("/api/controller/analyze", response_model=ControllerAnalysis)
def analyze_experiment(request: AnalyzeRequest) -> ControllerAnalysis:
    return analyze(get_experiment(request.experiment_id))


@app.get("/api/live/status")
def live_status() -> dict:
    return run_live_action("status")


@app.post("/api/live/action")
def live_action(request: LiveLabActionRequest) -> dict:
    return run_live_action(request.action)
