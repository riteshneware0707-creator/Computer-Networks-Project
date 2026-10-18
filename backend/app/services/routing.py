import heapq
import os
from dataclasses import dataclass

from backend.app.schemas import ExperimentSummary, RouteCost


@dataclass(frozen=True)
class Edge:
    source: str
    target: str
    base_cost: float
    path: str


EDGES = (
    Edge("PC", "R1", 5.0, "shared"),
    Edge("R1", "R2", 10.0, "primary"),
    Edge("R2", "R4", 10.0, "primary"),
    Edge("R1", "R3", 20.0, "alternate"),
    Edge("R3", "R4", 20.0, "alternate"),
    Edge("R4", "Server", 5.0, "shared"),
)
PATHS = {
    "primary": ["PC", "R1", "R2", "R4", "Server"],
    "alternate": ["PC", "R1", "R3", "R4", "Server"],
}


def _penalty(name: str, experiment: ExperimentSummary, network_state: str) -> float:
    metrics = experiment.metrics
    loss_weight = float(os.environ.get("ROUTE_WEIGHT_LOSS", "40"))
    delay_weight = float(os.environ.get("ROUTE_WEIGHT_DELAY", "20"))
    queue_weight = float(os.environ.get("ROUTE_WEIGHT_QUEUE", "20"))
    utilization_weight = float(os.environ.get("ROUTE_WEIGHT_UTILIZATION", "20"))
    state_penalty = float(
        os.environ.get(
            "ROUTE_STATE_PENALTY",
            "40" if network_state == "severely_congested" else "20",
        )
    )

    loss = (metrics.packet_loss_pct or 0.0) / 100
    delay = min((metrics.average_delay_ms or 0.0) / 100, 1.0)
    queue_capacity = float(os.environ.get("ROUTE_QUEUE_CAPACITY_PACKETS", "100"))
    queue = min((metrics.queue_packets_max or 0) / queue_capacity, 1.0)
    utilization = min((metrics.link_utilization_pct or 0.0) / 100, 1.0)
    if name == "primary":
        metric_penalty = loss_weight * loss + delay_weight * delay + queue_weight * queue + utilization_weight * utilization
        if network_state in {"congested", "severely_congested"}:
            metric_penalty += state_penalty
        return metric_penalty
    return 0.0


def _shortest_path(
    experiment: ExperimentSummary,
    disabled: set[str],
    network_state: str,
) -> tuple[list[str] | None, float | None]:
    graph: dict[str, list[tuple[str, float]]] = {}
    for edge in EDGES:
        if edge.path in disabled:
            continue
        graph.setdefault(edge.source, []).append(
            (edge.target, edge.base_cost + _penalty(edge.path, experiment, network_state))
        )
        graph.setdefault(edge.target, []).append(
            (edge.source, edge.base_cost + _penalty(edge.path, experiment, network_state))
        )

    queue: list[tuple[float, str, list[str]]] = [(0.0, "PC", ["PC"])]
    best: dict[str, float] = {}
    while queue:
        cost, node, path = heapq.heappop(queue)
        if node == "Server":
            return path, cost
        if cost >= best.get(node, float("inf")):
            continue
        best[node] = cost
        for neighbor, edge_cost in graph.get(node, []):
            if neighbor not in path:
                heapq.heappush(queue, (cost + edge_cost, neighbor, path + [neighbor]))
    return None, None


def available_route_costs(
    experiment: ExperimentSummary,
    network_state: str = "normal",
) -> tuple[list[RouteCost], str | None, str]:
    primary_available = experiment.raw.get("primaryPathAvailable")
    if not isinstance(primary_available, bool):
        primary_available = experiment.raw.get("primaryLinkAvailable")
    disabled = set()
    if primary_available is False:
        disabled.add("primary")

    alternate_available = experiment.raw.get("alternatePathAvailable")
    if alternate_available is False:
        disabled.add("alternate")

    selected_path, _selected_cost = _shortest_path(experiment, disabled, network_state)
    routes = []
    for route_name, expected_path in PATHS.items():
        route_disabled = route_name in disabled
        feasible = not route_disabled
        if feasible:
            cost = sum(
                edge.base_cost + _penalty(edge.path, experiment, network_state)
                for source, target in zip(expected_path, expected_path[1:])
                for edge in EDGES
                if {edge.source, edge.target} == {source, target}
            )
        else:
            cost = None
        routes.append(
            RouteCost(
                route=route_name,
                path=expected_path,
                cost=round(cost, 3) if cost is not None else None,
                feasible=feasible,
            )
        )

    if selected_path is None:
        return routes, None, "No feasible route is available in the supplied topology evidence."
    chosen = "primary" if "R2" in selected_path else "alternate"
    if chosen == "alternate" and primary_available is False:
        reason = "Primary-path availability is explicitly false; Dijkstra selected the feasible alternate path."
    elif chosen == "alternate":
        reason = (
            f"The {network_state} controller state adds a configurable penalty to the measured primary path, "
            "so Dijkstra selects the alternate route."
        )
    else:
        reason = "The configured primary route has the lower measured-plus-configured cost."
    return routes, chosen, reason
