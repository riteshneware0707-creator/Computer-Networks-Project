import { NetworkLink, NetworkNode, NodeId } from '../types';

export interface PathResult {
  path: NodeId[];
  pathNames: string[];
  totalCost: number;
  totalBaseDelayMs: number;
  routeLabel: 'Route A (R1-R2-R4)' | 'Route B (R1-R3-R4)' | 'Disconnected';
  stepLogs: string[];
}

export function computeShortestPathDijkstra(
  nodes: NetworkNode[],
  links: NetworkLink[],
  sourceId: NodeId = 0,
  destId: NodeId = 5,
  isConventional: boolean = false
): PathResult {
  const stepLogs: string[] = [];
  const nodeMap = new Map<NodeId, NetworkNode>(nodes.map((n) => [n.id, n]));

  // Build adjacency list
  // If conventional routing: static weights (base cost) and doesn't check dynamic congestion
  const adj = new Map<NodeId, Array<{ target: NodeId; link: NetworkLink; weight: number }>>();
  for (const n of nodes) {
    adj.set(n.id, []);
  }

  for (const link of links) {
    const fromNode = nodeMap.get(link.fromNode);
    const toNode = nodeMap.get(link.toNode);

    // If conventional, link cost is strictly based on base delay and ignores failures unless link explicitly cut
    let weight = link.baseDelayMs;

    if (!isConventional) {
      if (!fromNode?.isOnline || !toNode?.isOnline || link.status === 'down') {
        weight = Infinity;
      } else {
        weight = link.dynamicCost;
      }
    } else {
      // Conventional static routing: assumes static link costs
      // If a node is down, static routing does NOT dynamically avoid it!
      weight = link.baseDelayMs;
    }

    adj.get(link.fromNode)?.push({ target: link.toNode, link, weight });
    adj.get(link.toNode)?.push({ target: link.fromNode, link, weight });
  }

  // Dijkstra algorithm
  const dist = new Map<NodeId, number>();
  const prev = new Map<NodeId, NodeId | null>();
  const unvisited = new Set<NodeId>();

  for (const n of nodes) {
    dist.set(n.id, Infinity);
    prev.set(n.id, null);
    unvisited.add(n.id);
  }

  dist.set(sourceId, 0);
  stepLogs.push(`Initialized Dijkstra from Source Node ${sourceId} (${nodeMap.get(sourceId)?.label}).`);

  while (unvisited.size > 0) {
    // Find node with minimum distance
    let curr: NodeId | null = null;
    let minDist = Infinity;

    for (const nid of unvisited) {
      const d = dist.get(nid) ?? Infinity;
      if (d < minDist) {
        minDist = d;
        curr = nid;
      }
    }

    if (curr === null || minDist === Infinity) {
      break; // Remaining nodes are unreachable
    }

    unvisited.delete(curr);
    stepLogs.push(`Visiting Node ${curr} (${nodeMap.get(curr)?.label}) with current min cost = ${minDist.toFixed(1)}`);

    if (curr === destId) {
      stepLogs.push(`Target Destination Node ${destId} (${nodeMap.get(destId)?.label}) reached!`);
      break;
    }

    const neighbors = adj.get(curr) ?? [];
    for (const edge of neighbors) {
      if (!unvisited.has(edge.target)) continue;
      const alt = minDist + edge.weight;
      if (alt < (dist.get(edge.target) ?? Infinity)) {
        dist.set(edge.target, alt);
        prev.set(edge.target, curr);
        stepLogs.push(
          `  Relax edge ${curr} -> ${edge.target}: new distance = ${alt.toFixed(1)} (cost=${edge.weight.toFixed(1)})`
        );
      }
    }
  }

  // Reconstruct path
  const path: NodeId[] = [];
  let currNode: NodeId | null = destId;

  if (dist.get(destId) === Infinity) {
    return {
      path: [],
      pathNames: [],
      totalCost: Infinity,
      totalBaseDelayMs: 0,
      routeLabel: 'Disconnected',
      stepLogs: [...stepLogs, 'No active route found between PC and Server.'],
    };
  }

  while (currNode !== null) {
    path.unshift(currNode);
    currNode = prev.get(currNode) ?? null;
  }

  const pathNames = path.map((id) => nodeMap.get(id)?.label || `Node ${id}`);
  let totalBaseDelay = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const u = path[i];
    const v = path[i + 1];
    const link = links.find(
      (l) => (l.fromNode === u && l.toNode === v) || (l.fromNode === v && l.toNode === u)
    );
    if (link) totalBaseDelay += link.baseDelayMs;
  }

  let routeLabel: 'Route A (R1-R2-R4)' | 'Route B (R1-R3-R4)' | 'Disconnected' = 'Disconnected';
  if (path.includes(2)) {
    routeLabel = 'Route A (R1-R2-R4)';
  } else if (path.includes(3)) {
    routeLabel = 'Route B (R1-R3-R4)';
  }

  return {
    path,
    pathNames,
    totalCost: dist.get(destId) ?? Infinity,
    totalBaseDelayMs: totalBaseDelay,
    routeLabel,
    stepLogs,
  };
}
