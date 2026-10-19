from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class MetricValues(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transmitted_packets: int | None = Field(default=None, ge=0)
    received_packets: int | None = Field(default=None, ge=0)
    lost_packets: int | None = Field(default=None, ge=0)
    packet_loss_pct: float | None = Field(default=None, ge=0, le=100)
    average_delay_ms: float | None = Field(default=None, ge=0)
    throughput_mbps: float | None = Field(default=None, ge=0)
    queue_packets_max: int | None = Field(default=None, ge=0)
    queue_bytes_max: int | None = Field(default=None, ge=0)
    link_utilization_pct: float | None = Field(default=None, ge=0, le=100)
    r1_r2_packets: int | None = Field(default=None, ge=0)
    r2_r4_packets: int | None = Field(default=None, ge=0)
    r1_r3_packets: int | None = Field(default=None, ge=0)
    r3_r4_packets: int | None = Field(default=None, ge=0)


class RoutingEvidence(BaseModel):
    selected_route: str | None = None
    route_application_attempted: bool | None = None
    forwarding_verified: bool | None = None
    observed_path: str | None = None
    route_switch_time_sec: float | None = Field(default=None, ge=0)
    alternate_traffic_detected: bool | None = None


class ExperimentSummary(BaseModel):
    id: str
    scenario: str
    simulation_duration_sec: float | None = Field(default=None, ge=0)
    metrics: MetricValues
    routing: RoutingEvidence
    source_file: str
    updated_at: str
    raw: dict[str, Any]


class TopologyNode(BaseModel):
    id: str
    type: str
    label: str


class TopologyLink(BaseModel):
    id: str
    source: str
    target: str
    bandwidth_mbps: float
    delay_ms: float
    path: str


class TopologyResponse(BaseModel):
    nodes: list[TopologyNode]
    links: list[TopologyLink]
    route_verification: str


class CurrentRouteState(BaseModel):
    experiment_id: str
    reported_route_selection: str | None
    observed_forwarding_path: str | None
    route_application_attempted: bool | None
    forwarding_verified: bool | None
    route_switch_time_sec: float | None


class NetworkEvent(BaseModel):
    id: str
    experiment_id: str
    simulation_time_sec: float | None
    kind: str
    message: str
    severity: str


class EventsResponse(BaseModel):
    events: list[NetworkEvent]


class ExperimentList(BaseModel):
    experiments: list[ExperimentSummary]


class AnalyzeRequest(BaseModel):
    experiment_id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")


class LiveLabActionRequest(BaseModel):
    action: str = Field(pattern=r"^(deploy|congestion|failure|reset|destroy)$")


class RouteCost(BaseModel):
    route: str
    path: list[str]
    cost: float | None
    feasible: bool


class ControllerAnalysis(BaseModel):
    experiment_id: str
    network_state_prediction: str | None
    prediction_confidence: float | None
    class_probabilities: dict[str, float] | None
    model_status: str
    features: dict[str, float | bool | None]
    available_routes: list[RouteCost]
    selected_route: str | None
    reason: str
    route_application_attempted: bool
    forwarding_verified: bool
    warnings: list[str]
