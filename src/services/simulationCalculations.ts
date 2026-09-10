import { CongestionWeights, NetworkLink, NetworkNode, NodeStatus, PacketTrace } from '../types';

export function calculateCongestionScore(
  lossPct: number,
  delayMs: number,
  queueCount: number,
  maxQueue: number,
  trafficMbps: number,
  bandwidthMbps: number,
  weights: CongestionWeights
): { score: number; status: NodeStatus; queueUtil: number; bwUtil: number; normDelay: number } {
  // Normalize metrics to 0 - 100 scale
  const L = Math.min(100, Math.max(0, lossPct));

  // Reference max delay for normalization: 100ms
  const normDelay = Math.min(100, Math.max(0, (delayMs / 80) * 100));

  const queueUtil = Math.min(100, Math.max(0, (queueCount / maxQueue) * 100));
  const bwUtil = Math.min(100, Math.max(0, (trafficMbps / bandwidthMbps) * 100));

  // C = Wl*L + Wd*D + Wq*Q + Wu*U
  const scoreRaw =
    weights.loss * L +
    weights.delay * normDelay +
    weights.queue * queueUtil +
    weights.utilization * bwUtil;

  const score = Math.round(Math.min(100, Math.max(0, scoreRaw)));

  let status: NodeStatus = 'healthy';
  if (score > 60) {
    status = 'congested';
  } else if (score > 30) {
    status = 'warning';
  }

  return {
    score,
    status,
    queueUtil: Math.round(queueUtil),
    bwUtil: Math.round(bwUtil),
    normDelay: Math.round(normDelay),
  };
}

export function computeDynamicLinkCost(
  link: NetworkLink,
  sourceNode: NetworkNode,
  targetNode: NetworkNode
): { dynamicCost: number; status: 'active' | 'warning' | 'congested' | 'down' } {
  if (!sourceNode.isOnline || !targetNode.isOnline) {
    return { dynamicCost: Infinity, status: 'down' };
  }

  // Max congestion score between adjacent nodes
  const maxNodeScore = Math.max(sourceNode.congestionScore, targetNode.congestionScore);

  let penalty = 0;
  let status: 'active' | 'warning' | 'congested' | 'down' = 'active';

  if (maxNodeScore > 60) {
    // Severe congestion penalty
    penalty = (maxNodeScore - 30) * 1.5;
    status = 'congested';
  } else if (maxNodeScore > 30) {
    // Moderate warning penalty
    penalty = (maxNodeScore - 30) * 0.8;
    status = 'warning';
  }

  const dynamicCost = Math.round((link.baseDelayMs + penalty) * 10) / 10;
  return { dynamicCost, status };
}

export function generateSimulatedPacket(
  seq: number,
  simTime: number,
  activeRouteLabel: string,
  isCongested: boolean,
  isFailed: boolean,
  isConventional: boolean
): PacketTrace {
  const date = new Date(1726056135000 + simTime * 1000);
  const formattedTime = date.toISOString().substring(11, 23);

  let status: 'DELIVERED' | 'DROPPED_CONGESTION' | 'DROPPED_FAILURE' = 'DELIVERED';
  let latencyMs = 30;
  let routeTaken: string[] = ['PC (10.0.1.1)', 'R1', 'R2', 'R4', 'Server (10.0.6.2)'];

  if (isConventional) {
    // Conventional routing is static to R2
    if (isFailed) {
      status = 'DROPPED_FAILURE';
      latencyMs = 0;
      routeTaken = ['PC (10.0.1.1)', 'R1', 'R2 💥 (Down - Blackhole)'];
    } else if (isCongested) {
      // High probability of drops due to buffer overflow
      const dropRoll = Math.random();
      if (dropRoll < 0.65) {
        status = 'DROPPED_CONGESTION';
        latencyMs = 95 + Math.random() * 30;
        routeTaken = ['PC (10.0.1.1)', 'R1', 'R2 (Queue Overflow Dropped)'];
      } else {
        status = 'DELIVERED';
        latencyMs = 85 + Math.random() * 25;
        routeTaken = ['PC (10.0.1.1)', 'R1', 'R2', 'R4', 'Server (10.0.6.2)'];
      }
    } else {
      status = 'DELIVERED';
      latencyMs = 30 + (Math.random() * 3 - 1.5);
    }
  } else {
    // Proposed Adaptive Routing
    if (activeRouteLabel.includes('Route B')) {
      routeTaken = ['PC (10.0.1.1)', 'R1', 'R3', 'R4', 'Server (10.0.6.2)'];
      latencyMs = 50 + (Math.random() * 4 - 2);
      status = 'DELIVERED';
    } else if (isFailed) {
      // In transition of failover
      status = 'DROPPED_FAILURE';
      latencyMs = 0;
      routeTaken = ['PC (10.0.1.1)', 'R1', 'Failover Recalculation...'];
    } else if (isCongested && !activeRouteLabel.includes('Route B')) {
      // Brief transition before Dijkstra switch
      const dropRoll = Math.random();
      if (dropRoll < 0.3) {
        status = 'DROPPED_CONGESTION';
        latencyMs = 75;
      } else {
        status = 'DELIVERED';
        latencyMs = 70;
      }
    } else {
      status = 'DELIVERED';
      latencyMs = 30 + (Math.random() * 2 - 1);
    }
  }

  const jitterMs = Math.abs(Math.round((Math.random() * 3.2 - 1.6) * 10) / 10);

  return {
    id: seq,
    simTime,
    formattedTime,
    sourceIp: '10.0.1.1',
    destIp: '10.0.6.2',
    protocol: seq % 7 === 0 ? 'ICMP' : seq % 3 === 0 ? 'TCP' : 'UDP',
    lengthBytes: seq % 7 === 0 ? 64 : 1024,
    ttl: 64 - routeTaken.length,
    seq,
    routeTaken,
    status,
    latencyMs: Math.round(latencyMs * 10) / 10,
    jitterMs,
  };
}
