export type NodeId = 0 | 1 | 2 | 3 | 4 | 5;

export type NodeStatus = 'healthy' | 'warning' | 'congested' | 'failed';

export interface NetworkNode {
  id: NodeId;
  label: string;
  sublabel: string;
  type: 'host' | 'router';
  ipList: string[];
  primaryIp: string;
  status: NodeStatus;
  queueCount: number;
  maxQueue: number;
  queueUtilization: number; // 0 - 100
  bandwidthUtilization: number; // 0 - 100
  lossRate: number; // 0 - 100
  currentDelayMs: number;
  congestionScore: number; // 0 - 100
  isOnline: boolean;
  x: number;
  y: number;
}

export interface NetworkLink {
  id: string;
  name: string;
  fromNode: NodeId;
  toNode: NodeId;
  subnet: string;
  bandwidthMbps: number;
  baseDelayMs: number;
  currentDelayMs: number;
  currentLoadMbps: number;
  status: 'active' | 'warning' | 'congested' | 'down';
  dynamicCost: number;
  isInActivePath: boolean;
}

export interface PacketTrace {
  id: number;
  simTime: number;
  formattedTime: string;
  sourceIp: string;
  destIp: string;
  protocol: 'UDP' | 'TCP' | 'ICMP';
  lengthBytes: number;
  ttl: number;
  seq: number;
  routeTaken: string[];
  status: 'DELIVERED' | 'DROPPED_CONGESTION' | 'DROPPED_FAILURE' | 'IN_FLIGHT';
  latencyMs: number;
  jitterMs: number;
}

export interface CongestionWeights {
  loss: number; // default 0.30
  delay: number; // default 0.25
  queue: number; // default 0.20
  utilization: number; // default 0.25
}

export interface SimulationState {
  simTimeSeconds: number;
  isRunning: boolean;
  routingMode: 'adaptive' | 'conventional';
  activeRoute: 'Route A (R1-R2-R4)' | 'Route B (R1-R3-R4)' | 'Disconnected';
  previousRoute: string;
  routeSwitchesCount: number;
  hysteresisEnabled: boolean;
  hysteresisThresholdUp: number; // > 70 to switch away
  hysteresisThresholdDown: number; // < 40 to return
  currentCongestionScore: number;
  systemHealthScore: number; // 0 - 100
  overallLossPct: number;
  overallLatencyMs: number;
  overallThroughputMbps: number;
  overallJitterMs: number;
  lastFailureTime: number | null;
  lastRecoveryTimeMs: number | null;
  isRecovering: boolean;
  generatedTrafficMbps: number;
  manualR2Congestion: boolean;
  manualR2Failure: boolean;
  manualR3Failure: boolean;
  logEvents: Array<{
    id: string;
    timestamp: string;
    type: 'info' | 'warning' | 'danger' | 'success';
    message: string;
  }>;
}

export interface TimeSeriesMetric {
  time: string;
  rawTime: number;
  latencyProposed: number;
  latencyConventional: number;
  lossProposed: number;
  lossConventional: number;
  throughputProposed: number;
  throughputConventional: number;
  congestionScoreR2: number;
  congestionScoreR3: number;
}

export interface BenchmarkRow {
  scenario: string;
  trafficRate: string;
  metric: string;
  conventionalValue: string;
  proposedValue: string;
  improvement: string;
  status: 'better' | 'equal' | 'worse';
}
