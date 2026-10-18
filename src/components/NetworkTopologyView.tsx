import React from 'react';
import { NetworkLink, NetworkNode, NodeId } from '../types';
import { Server, Monitor, Network } from 'lucide-react';

interface NetworkTopologyViewProps {
  nodes: NetworkNode[];
  links: NetworkLink[];
  activeRoute: string;
  activePathNodeIds: NodeId[];
  isSimulating: boolean;
  onToggleNodeFail: (nodeId: NodeId) => void;
}

export const NetworkTopologyView: React.FC<NetworkTopologyViewProps> = ({
  nodes,
  links,
  activeRoute,
  activePathNodeIds,
  isSimulating,
  onToggleNodeFail,
}) => {
  const getNode = (id: NodeId) => nodes.find((n) => n.id === id);

  return (
    <div className="relative w-full rounded-2xl bg-slate-900/90 border border-slate-800 p-4 sm:p-6 shadow-xl">
      {/* Header with Route and Status */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-sky-400" />
          <span className="text-sm font-bold text-slate-200">Network Topology Map</span>
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold ${
              activeRoute.includes('Route A')
                ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                : activeRoute.includes('Route B')
                ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                : 'bg-red-500/15 text-red-300 border border-red-500/30'
            }`}
          >
            Active: {activeRoute}
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-xs text-slate-400 font-medium">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span> Normal
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Congested
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-800"></span> Offline
          </span>
        </div>
      </div>

      {/* SVG Canvas for Links & Nodes */}
      <div className="relative w-full aspect-[2.2/1] min-h-[300px] max-h-[420px]">
        <svg viewBox="0 0 960 420" className="w-full h-full select-none">
          <defs>
            <filter id="activeGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Links */}
          {links.map((link) => {
            const from = getNode(link.fromNode);
            const to = getNode(link.toNode);
            if (!from || !to) return null;

            const isLinkActive =
              activePathNodeIds.includes(link.fromNode) &&
              activePathNodeIds.includes(link.toNode) &&
              Math.abs(
                activePathNodeIds.indexOf(link.fromNode) - activePathNodeIds.indexOf(link.toNode)
              ) === 1;

            const isDown = !from.isOnline || !to.isOnline || link.status === 'down';
            const isCongested = link.status === 'congested';

            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;

            return (
              <g key={link.id}>
                {/* Base Link */}
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={
                    isDown
                      ? '#ef4444'
                      : isCongested
                      ? '#f43f5e'
                      : isLinkActive
                      ? '#38bdf8'
                      : '#334155'
                  }
                  strokeWidth={isLinkActive ? 3.5 : 2}
                  strokeDasharray={isDown ? '5,5' : 'none'}
                  strokeOpacity={isDown ? 0.5 : isLinkActive ? 1 : 0.4}
                  filter={isLinkActive ? 'url(#activeGlow)' : undefined}
                />

                {/* Animated Packet along Active Link */}
                {isLinkActive && !isDown && isSimulating && (
                  <circle r="4.5" fill="#38bdf8">
                    <animateMotion
                      path={`M ${from.x} ${from.y} L ${to.x} ${to.y}`}
                      dur="1.0s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}

                {/* Link Delay Label */}
                <g transform={`translate(${midX}, ${midY})`}>
                  <rect
                    x={-28}
                    y={-10}
                    width={56}
                    height={20}
                    rx={5}
                    fill="#090d16"
                    stroke="#1e293b"
                    strokeWidth={1}
                  />
                  <text
                    x={0}
                    y={4}
                    textAnchor="middle"
                    fill={isLinkActive ? '#38bdf8' : '#94a3b8'}
                    fontSize="10"
                    fontFamily="monospace"
                    fontWeight="600"
                  >
                    {link.baseDelayMs}ms
                  </text>
                </g>
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const isRouter = node.type === 'router';
            const isActivePath = activePathNodeIds.includes(node.id);
            const isDown = !node.isOnline;
            const isCongested = node.status === 'congested';

            const statusColor = isDown
              ? '#ef4444'
              : isCongested
              ? '#f43f5e'
              : node.status === 'warning'
              ? '#f59e0b'
              : '#10b981';

            return (
              <g key={node.id} className="cursor-pointer" onClick={() => onToggleNodeFail(node.id)}>
                {/* Outer halo */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={isRouter ? 26 : 28}
                  fill="#0b1329"
                  stroke={statusColor}
                  strokeWidth={isActivePath ? 2.5 : 1.5}
                />

                {/* Node Icon */}
                <g transform={`translate(${node.x - 10}, ${node.y - 10})`}>
                  {node.type === 'host' && node.id === 0 ? (
                    <Monitor className="w-5 h-5 text-sky-400" />
                  ) : node.type === 'host' && node.id === 5 ? (
                    <Server className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Network className="w-5 h-5 text-slate-300" />
                  )}
                </g>

                {/* Node Label */}
                <g transform={`translate(${node.x}, ${node.y + 36})`}>
                  <rect
                    x={-30}
                    y={-2}
                    width={60}
                    height={18}
                    rx={5}
                    fill="#0f172a"
                    stroke="#1e293b"
                    strokeWidth={1}
                  />
                  <text
                    x={0}
                    y={11}
                    textAnchor="middle"
                    fill={node.isOnline ? '#f1f5f9' : '#f87171'}
                    fontSize="11"
                    fontWeight="700"
                  >
                    {node.label} {isDown && '💥'}
                  </text>
                </g>

                {/* Congestion Score Pill for Routers */}
                {isRouter && node.isOnline && (
                  <g transform={`translate(${node.x}, ${node.y - 34})`}>
                    <rect
                      x={-24}
                      y={-8}
                      width={48}
                      height={16}
                      rx={4}
                      fill="#090d16"
                      stroke={statusColor}
                      strokeWidth={1}
                    />
                    <text
                      x={0}
                      y={4}
                      textAnchor="middle"
                      fill={statusColor}
                      fontSize="9"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      {node.congestionScore}/100
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-2 font-mono">
        <span>Route A: PC ➔ R1 ➔ R2 ➔ R4 ➔ Server (Cost: 30ms)</span>
        <span>Route B: PC ➔ R1 ➔ R3 ➔ R4 ➔ Server (Cost: 50ms)</span>
      </div>
    </div>
  );
};
