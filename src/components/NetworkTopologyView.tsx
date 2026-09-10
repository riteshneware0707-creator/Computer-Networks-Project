import React, { useState } from 'react';
import { NetworkLink, NetworkNode, NodeId } from '../types';
import {
  Server,
  Monitor,
  Network,
  AlertTriangle,
  Flame,
  CheckCircle2,
  XCircle,
  Activity,
  Zap,
  Radio,
  ArrowRight,
} from 'lucide-react';

interface NetworkTopologyViewProps {
  nodes: NetworkNode[];
  links: NetworkLink[];
  activeRoute: string;
  activePathNodeIds: NodeId[];
  isSimulating: boolean;
  onToggleNodeFail: (nodeId: NodeId) => void;
  onSelectNode: (node: NetworkNode) => void;
  selectedNodeId: NodeId | null;
}

export const NetworkTopologyView: React.FC<NetworkTopologyViewProps> = ({
  nodes,
  links,
  activeRoute,
  activePathNodeIds,
  isSimulating,
  onToggleNodeFail,
  onSelectNode,
  selectedNodeId,
}) => {
  const [hoveredLink, setHoveredLink] = useState<NetworkLink | null>(null);

  // Helper to determine link coords
  const getNode = (id: NodeId) => nodes.find((n) => n.id === id);

  return (
    <div className="relative w-full rounded-2xl bg-slate-900/90 border border-slate-800 p-4 lg:p-6 shadow-2xl overflow-hidden backdrop-blur-md">
      {/* Background Subtle Grid */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(#60a5fa 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
      />

      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              Physical Topology & Dynamic Cost Overlay
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Radio className="w-3 h-3 animate-pulse text-blue-400" />
                NS-3 Discrete Simulation Map
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              6 Nodes • 6 Point-to-Point Interfaces • Subnets 10.0.1.0/24 - 10.0.6.0/24
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 sm:gap-4 text-xs">
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"></span>
            <span>Healthy (≤30)</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]"></span>
            <span>Warning (31-60)</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"></span>
            <span>Congested (61-100)</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-red-800"></span>
            <span>Failed / Down</span>
          </div>
        </div>
      </div>

      {/* SVG Canvas for Links and Animated Flowing Packets */}
      <div className="relative w-full aspect-[2/1] min-h-[360px] sm:min-h-[420px] max-h-[500px]">
        <svg
          viewBox="0 0 960 450"
          className="w-full h-full select-none"
          style={{ overflow: 'visible' }}
        >
          <defs>
            {/* Active flow gradient */}
            <linearGradient id="activePathGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="50%" stopColor="#818cf8" />
              <stop offset="100%" stopColor="#34d399" />
            </linearGradient>

            <linearGradient id="congestedGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f43f5e" />
              <stop offset="100%" stopColor="#fb7185" />
            </linearGradient>

            {/* Glowing filter */}
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Render All Links */}
          {links.map((link) => {
            const from = getNode(link.fromNode);
            const to = getNode(link.toNode);
            if (!from || !to) return null;

            const isLinkInActive =
              activePathNodeIds.includes(link.fromNode) &&
              activePathNodeIds.includes(link.toNode) &&
              Math.abs(
                activePathNodeIds.indexOf(link.fromNode) - activePathNodeIds.indexOf(link.toNode)
              ) === 1;

            const isDown = !from.isOnline || !to.isOnline || link.status === 'down';
            const isCongested = link.status === 'congested';

            // Midpoint coordinates for labels
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;

            // Compute offset for labels to avoid overlapping lines
            const angle = Math.atan2(to.y - from.y, to.x - from.x);
            const offsetX = -Math.sin(angle) * 16;
            const offsetY = Math.cos(angle) * 16;

            return (
              <g
                key={link.id}
                className="cursor-pointer group"
                onMouseEnter={() => setHoveredLink(link)}
                onMouseLeave={() => setHoveredLink(null)}
              >
                {/* Background thicker hit-area */}
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="transparent"
                  strokeWidth={20}
                />

                {/* Base Link Line */}
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
                      : isLinkInActive
                      ? '#38bdf8'
                      : '#334155'
                  }
                  strokeWidth={isLinkInActive ? 4 : 2.5}
                  strokeDasharray={isDown ? '6,6' : 'none'}
                  strokeOpacity={isDown ? 0.6 : isLinkInActive ? 0.9 : 0.4}
                  filter={isLinkInActive ? 'url(#glow)' : undefined}
                  className="transition-all duration-300"
                />

                {/* Animated Packet Stream Particles along Active Link */}
                {isLinkInActive && !isDown && isSimulating && (
                  <>
                    <circle r="4" fill="#38bdf8">
                      <animateMotion
                        path={`M ${from.x} ${from.y} L ${to.x} ${to.y}`}
                        dur={`${Math.max(0.4, link.baseDelayMs / 12)}s`}
                        repeatCount="indefinite"
                      />
                    </circle>
                    <circle r="3" fill="#a7f3d0">
                      <animateMotion
                        path={`M ${from.x} ${from.y} L ${to.x} ${to.y}`}
                        dur={`${Math.max(0.4, link.baseDelayMs / 12)}s`}
                        begin="0.25s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  </>
                )}

                {/* Link Cost & Subnet Badge */}
                <g transform={`translate(${midX + offsetX}, ${midY + offsetY})`}>
                  <rect
                    x={-42}
                    y={-12}
                    width={84}
                    height={24}
                    rx={6}
                    fill={isDown ? '#450a0a' : isLinkInActive ? '#0f172a' : '#1e293b'}
                    stroke={
                      isDown
                        ? '#dc2626'
                        : isCongested
                        ? '#e11d48'
                        : isLinkInActive
                        ? '#38bdf8'
                        : '#475569'
                    }
                    strokeWidth={isLinkInActive ? 1.5 : 1}
                    className="transition-all duration-200"
                  />
                  <text
                    x={0}
                    y={3.5}
                    textAnchor="middle"
                    fill={isDown ? '#f87171' : isLinkInActive ? '#e2e8f0' : '#94a3b8'}
                    fontSize="9.5"
                    fontFamily="Fira Code, monospace"
                    fontWeight="600"
                  >
                    {isDown
                      ? 'COST: ∞'
                      : `Cost: ${link.dynamicCost.toFixed(0)} (${link.baseDelayMs}ms)`}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Render Nodes */}
          {nodes.map((node) => {
            const isSelected = selectedNodeId === node.id;
            const isInPath = activePathNodeIds.includes(node.id);

            // Node Color Logic
            let ringColor = '#10b981'; // green
            let bgColor = '#064e3b';
            let badgeBg = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';

            if (!node.isOnline) {
              ringColor = '#ef4444';
              bgColor = '#450a0a';
              badgeBg = 'bg-red-500/20 text-red-400 border-red-500/40';
            } else if (node.status === 'congested') {
              ringColor = '#f43f5e';
              bgColor = '#881337';
              badgeBg = 'bg-rose-500/20 text-rose-400 border-rose-500/40';
            } else if (node.status === 'warning') {
              ringColor = '#f59e0b';
              bgColor = '#78350f';
              badgeBg = 'bg-amber-500/20 text-amber-400 border-amber-500/40';
            }

            return (
              <g
                key={node.id}
                className="cursor-pointer select-none"
                onClick={() => onSelectNode(node)}
              >
                {/* Selection Halo */}
                {isSelected && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={36}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth={2.5}
                    strokeDasharray="4,3"
                    className="animate-spin"
                    style={{ transformOrigin: `${node.x}px ${node.y}px` }}
                  />
                )}

                {/* Node Outer Circle */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={28}
                  fill={node.isOnline ? '#0f172a' : '#1e1b1b'}
                  stroke={ringColor}
                  strokeWidth={isInPath ? 3 : 2}
                  filter={isInPath ? 'url(#glow)' : undefined}
                  className="transition-all duration-300"
                />

                {/* Inner Pulse if congested */}
                {node.status === 'congested' && node.isOnline && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={24}
                    fill="#f43f5e"
                    opacity="0.25"
                    className="animate-ping"
                    style={{ transformOrigin: `${node.x}px ${node.y}px` }}
                  />
                )}

                {/* Node Center Icon / Text representation */}
                <foreignObject
                  x={node.x - 20}
                  y={node.y - 20}
                  width={40}
                  height={40}
                  className="pointer-events-none"
                >
                  <div className="w-full h-full flex items-center justify-center text-slate-100">
                    {!node.isOnline ? (
                      <XCircle className="w-6 h-6 text-red-400" />
                    ) : node.type === 'host' ? (
                      node.id === 0 ? (
                        <Monitor className="w-5 h-5 text-sky-400" />
                      ) : (
                        <Server className="w-5 h-5 text-purple-400" />
                      )
                    ) : node.status === 'congested' ? (
                      <Flame className="w-5 h-5 text-rose-400 animate-pulse" />
                    ) : node.status === 'warning' ? (
                      <AlertTriangle className="w-5 h-5 text-amber-400" />
                    ) : (
                      <Activity className="w-5 h-5 text-emerald-400" />
                    )}
                  </div>
                </foreignObject>

                {/* Node Label & IP */}
                <g transform={`translate(${node.x}, ${node.y + 38})`}>
                  <rect
                    x={-48}
                    y={-2}
                    width={96}
                    height={38}
                    rx={6}
                    fill="#090d16"
                    stroke="#1e293b"
                    strokeWidth={1}
                  />
                  <text
                    x={0}
                    y={12}
                    textAnchor="middle"
                    fill={node.isOnline ? '#f1f5f9' : '#f87171'}
                    fontSize="11"
                    fontWeight="700"
                  >
                    {node.label} {!node.isOnline && '💥'}
                  </text>
                  <text
                    x={0}
                    y={26}
                    textAnchor="middle"
                    fill="#64748b"
                    fontSize="9"
                    fontFamily="Fira Code, monospace"
                  >
                    {node.primaryIp}
                  </text>
                </g>

                {/* Congestion Meter Pill for Routers */}
                {node.type === 'router' && node.isOnline && (
                  <g transform={`translate(${node.x}, ${node.y - 36})`}>
                    <rect
                      x={-28}
                      y={-10}
                      width={56}
                      height={18}
                      rx={5}
                      fill="#0f172a"
                      stroke={ringColor}
                      strokeWidth={1}
                    />
                    <text
                      x={0}
                      y={3}
                      textAnchor="middle"
                      fill={ringColor}
                      fontSize="9"
                      fontFamily="Fira Code, monospace"
                      fontWeight="700"
                    >
                      C: {node.congestionScore}/100
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* Floating Active Route Path banner */}
        <div className="absolute top-2 left-2 right-2 sm:right-auto flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-700/80 backdrop-blur-md shadow-lg text-xs">
          <span className="text-slate-400 font-medium">Active Path:</span>
          <span
            className={`font-semibold px-2 py-0.5 rounded ${
              activeRoute.includes('Route A')
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                : activeRoute.includes('Route B')
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                : 'bg-red-500/20 text-red-300 border border-red-500/30'
            }`}
          >
            {activeRoute}
          </span>
          {activeRoute.includes('Route A') && (
            <span className="text-[11px] text-slate-400 hidden md:inline">
              (Preferred: 5+10+10+5 = 30ms)
            </span>
          )}
          {activeRoute.includes('Route B') && (
            <span className="text-[11px] text-purple-400 hidden md:inline">
              (Alternate: 5+20+20+5 = 50ms)
            </span>
          )}
        </div>
      </div>

      {/* Node Quick Inspector Footer Bar */}
      {selectedNodeId !== null && (
        <div className="mt-4 p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          {(() => {
            const n = getNode(selectedNodeId);
            if (!n) return null;
            return (
              <>
                <div className="flex items-center gap-3">
                  <div className="font-bold text-slate-200 text-sm flex items-center gap-1.5">
                    {n.label} ({n.sublabel})
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-mono uppercase ${
                        !n.isOnline
                          ? 'bg-red-950 text-red-400 border border-red-800'
                          : n.status === 'congested'
                          ? 'bg-rose-950 text-rose-400 border border-rose-800'
                          : n.status === 'warning'
                          ? 'bg-amber-950 text-amber-400 border border-amber-800'
                          : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      }`}
                    >
                      {n.isOnline ? n.status : 'OFFLINE'}
                    </span>
                  </div>
                  <div className="text-slate-400 hidden sm:block">
                    IPs: <span className="font-mono text-slate-300">{n.ipList.join(', ')}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {n.type === 'router' && (
                    <div className="flex items-center gap-3 text-slate-300 font-mono">
                      <span>Queue: {n.queueCount}/{n.maxQueue} ({n.queueUtilization}%)</span>
                      <span>Loss: {n.lossRate}%</span>
                      <span>Score: {n.congestionScore}/100</span>
                    </div>
                  )}

                  {n.type === 'router' && (
                    <button
                      onClick={() => onToggleNodeFail(n.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        n.isOnline
                          ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40'
                          : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                      }`}
                    >
                      {n.isOnline ? '💥 Simulate Crash / Fail' : '✅ Restore Router'}
                    </button>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
};
