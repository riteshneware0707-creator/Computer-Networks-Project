export interface ExperimentMetrics {
  transmitted_packets: number | null;
  received_packets: number | null;
  lost_packets: number | null;
  packet_loss_pct: number | null;
  average_delay_ms: number | null;
  throughput_mbps: number | null;
  queue_packets_max: number | null;
  queue_bytes_max: number | null;
  link_utilization_pct: number | null;
  r1_r2_packets: number | null;
  r2_r4_packets: number | null;
  r1_r3_packets: number | null;
  r3_r4_packets: number | null;
}

export interface ExperimentRouting {
  selected_route: string | null;
  route_application_attempted: boolean | null;
  forwarding_verified: boolean | null;
  observed_path: string | null;
  route_switch_time_sec: number | null;
  alternate_traffic_detected: boolean | null;
}

export interface Experiment {
  id: string;
  scenario: string;
  simulation_duration_sec: number | null;
  metrics: ExperimentMetrics;
  routing: ExperimentRouting;
  source_file: string;
  updated_at: string;
  raw: Record<string, unknown>;
}

export interface RouteCost {
  route: string;
  path: string[];
  cost: number | null;
  feasible: boolean;
}

export interface ControllerAnalysis {
  experiment_id: string;
  network_state_prediction: string | null;
  prediction_confidence: number | null;
  class_probabilities: Record<string, number> | null;
  model_status: string;
  features: Record<string, number | boolean | null>;
  available_routes: RouteCost[];
  selected_route: string | null;
  reason: string;
  route_application_attempted: boolean;
  forwarding_verified: boolean;
  warnings: string[];
}

export interface NetworkEvent {
  id: string;
  experiment_id: string;
  simulation_time_sec: number | null;
  kind: string;
  message: string;
  severity: string;
}

export type LiveLabAction = 'deploy' | 'congestion' | 'failure' | 'reset' | 'destroy';

export interface LiveLabStatus {
  available: boolean;
  running: boolean;
  network_state: string;
  selected_route: 'primary' | 'alternate' | null;
  primary_link_delay_ms: number | null;
  packet_loss_pct: number | null;
  average_delay_ms: number | null;
  throughput_mbps: number | null;
  primary_tx_packets: number | null;
  alternate_tx_packets: number | null;
  forwarding_verified: boolean;
  event: string | null;
}

const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');

async function request<T>(path: string, signal?: AbortSignal, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new Error(`Backend is unreachable at ${baseUrl}. Start the local FastAPI service.`);
  }

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const payload = (await response.json()) as { detail?: unknown };
      if (typeof payload.detail === 'string') detail = payload.detail;
    } catch {
      // Keep the HTTP status message when an error response is not JSON.
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

export function getHealth(signal?: AbortSignal) {
  return request<{ status: string; experiments_available: number }>('/api/health', signal);
}

export function getExperiments(signal?: AbortSignal) {
  return request<{ experiments: Experiment[] }>('/api/experiments', signal);
}

export function getEvents(signal?: AbortSignal) {
  return request<{ events: NetworkEvent[] }>('/api/events', signal);
}

export function analyzeExperiment(experimentId: string, signal?: AbortSignal) {
  return request<ControllerAnalysis>(
    '/api/controller/analyze',
    signal,
    { experiment_id: experimentId }
  );
}

export function getLiveLabStatus(signal?: AbortSignal) {
  return request<LiveLabStatus>('/api/live/status', signal);
}

export function runLiveLabAction(action: LiveLabAction, signal?: AbortSignal) {
  return request<LiveLabStatus>('/api/live/action', signal, { action });
}
