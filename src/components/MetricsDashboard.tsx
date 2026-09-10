import React from 'react';
import { NetworkNode, SimulationState } from '../types';
import {
  Activity,
  Zap,
  Gauge,
  Clock,
  ArrowRightLeft,
  ShieldCheck,
  Flame,
  Radio,
  BarChart2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

interface MetricsDashboardProps {
  state: SimulationState;
  nodes: NetworkNode[];
}

export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({ state, nodes }) => {
  const r2Node = nodes.find((n) => n.id === 2);
  const r3Node = nodes.find((n) => n.id === 3);

  return (
    <div className="space-y-4">
      {/* Top 4 Primary KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Metric 1: Active Route & Path */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-medium uppercase tracking-wider">Current Route</span>
            <ArrowRightLeft className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-base sm:text-lg font-bold text-slate-100 truncate">
            {state.activeRoute}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-1.5">
            <span>Switches: <strong className="text-sky-300 font-mono">{state.routeSwitchesCount}</strong></span>
            <span>Prev: <span className="font-mono text-slate-300">{state.previousRoute.includes('Route B') ? 'Route B' : 'Route A'}</span></span>
          </div>
        </div>

        {/* Metric 2: Latency */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-medium uppercase tracking-wider">End-to-End Latency</span>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-100 font-mono">
              {state.overallLatencyMs.toFixed(1)}
            </span>
            <span className="text-xs font-semibold text-slate-400">ms</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-1.5">
            <span>Jitter: <strong className="text-emerald-300 font-mono">{state.overallJitterMs.toFixed(1)} ms</strong></span>
            <span className="text-[10px] text-slate-400">Target: 30ms (A) / 50ms (B)</span>
          </div>
        </div>

        {/* Metric 3: Packet Loss Rate */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-medium uppercase tracking-wider">Packet Loss</span>
            <Activity className={`w-4 h-4 ${state.overallLossPct > 5 ? 'text-rose-400' : 'text-emerald-400'}`} />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-2xl font-black font-mono ${
                state.overallLossPct > 10
                  ? 'text-rose-400'
                  : state.overallLossPct > 0
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {state.overallLossPct.toFixed(1)}%
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-1.5">
            <span>Throughput: <strong className="text-slate-200 font-mono">{state.overallThroughputMbps.toFixed(1)} Mbps</strong></span>
            <span className={state.overallLossPct === 0 ? 'text-emerald-400' : 'text-rose-400 font-semibold'}>
              {state.overallLossPct === 0 ? 'Zero Loss' : 'Drops Present'}
            </span>
          </div>
        </div>

        {/* Metric 4: Self-Healing Recovery Time Stopwatch */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-medium uppercase tracking-wider">Self-Healing Recovery</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-amber-300 font-mono">
              {state.lastRecoveryTimeMs ? `${(state.lastRecoveryTimeMs / 1000).toFixed(2)}s` : '1.20s'}
            </span>
            <span className="text-xs font-medium text-slate-400">convergence</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-1.5">
            <span>Detection: <strong className="text-slate-300 font-mono">~400ms</strong></span>
            <span>Status: <strong className="text-emerald-400">Autonomous</strong></span>
          </div>
        </div>
      </div>

      {/* Network Health & Router Telemetry Table (PART 19) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Congestion Score Gauge for R2 (Primary Bottleneck) */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-rose-400" />
                R2 Congestion Intelligence Score
              </h3>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-bold font-mono ${
                  !r2Node?.isOnline
                    ? 'bg-red-950 text-red-400 border border-red-800'
                    : state.currentCongestionScore > 60
                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                    : state.currentCongestionScore > 30
                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                    : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                }`}
              >
                {!r2Node?.isOnline
                  ? 'CRASHED / OFFLINE'
                  : state.currentCongestionScore > 60
                  ? '🔴 CONGESTED (>60)'
                  : state.currentCongestionScore > 30
                  ? '🟡 WARNING (31-60)'
                  : '🟢 HEALTHY (0-30)'}
              </span>
            </div>

            {/* Visual Gauge Bar */}
            <div className="mt-3">
              <div className="flex justify-between text-xs font-mono text-slate-400 mb-1">
                <span>Congestion (C): <strong className="text-slate-100 text-sm">{state.currentCongestionScore}</strong>/100</span>
                <span>Threshold: <strong className="text-amber-400 font-bold">{state.hysteresisThresholdUp}</strong></span>
              </div>
              <div className="w-full h-3.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5 flex">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    state.currentCongestionScore > 60
                      ? 'bg-gradient-to-r from-amber-500 to-rose-500'
                      : state.currentCongestionScore > 30
                      ? 'bg-gradient-to-r from-emerald-500 to-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(5, state.currentCongestionScore))}%` }}
                />
              </div>
            </div>

            {/* Formula Breakdown */}
            <div className="mt-3 p-2.5 rounded-lg bg-slate-950/90 border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1">
              <div className="text-slate-300 font-semibold flex items-center justify-between">
                <span>C = 0.30·L + 0.25·D + 0.20·Q + 0.25·U</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span>Loss L: {r2Node?.lossRate}%</span>
                <span>Delay D: {r2Node?.currentDelayMs}ms</span>
                <span>Queue Q: {r2Node?.queueUtilization}%</span>
                <span>Util U: {r2Node?.bandwidthUtilization}%</span>
              </div>
            </div>
          </div>

          {/* Hysteresis status callout */}
          <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
              Hysteresis Damping:
            </span>
            <span className="font-semibold text-slate-200">
              {state.hysteresisEnabled ? 'Active (>70 switch, <40 return)' : 'Disabled (Prone to Flapping)'}
            </span>
          </div>
        </div>

        {/* Right 2 cols: Router Table from PART 19 */}
        <div className="lg:col-span-2 p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Gauge className="w-4 h-4 text-sky-400" />
              Live Router Node Telemetry (PART 19 Dashboard)
            </h3>
            <span className="text-xs text-slate-400">
              System Health Index: <strong className="text-emerald-400 font-mono">{state.systemHealthScore}/100</strong>
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2 font-semibold">Router</th>
                  <th className="pb-2 font-semibold">Role / Subnet</th>
                  <th className="pb-2 font-semibold">Status</th>
                  <th className="pb-2 font-semibold">Queue Length</th>
                  <th className="pb-2 font-semibold">Loss</th>
                  <th className="pb-2 font-semibold text-right">Congestion Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {nodes
                  .filter((n) => n.type === 'router')
                  .map((router) => {
                    const isDown = !router.isOnline;
                    const isCongested = router.status === 'congested';
                    const isWarning = router.status === 'warning';

                    return (
                      <tr key={router.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2.5 font-bold flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isDown
                                ? 'bg-red-500'
                                : isCongested
                                ? 'bg-rose-500 animate-pulse'
                                : isWarning
                                ? 'bg-amber-400'
                                : 'bg-emerald-400'
                            }`}
                          />
                          {router.label}
                        </td>
                        <td className="py-2.5 text-slate-400 text-[11px]">
                          {router.id === 1 && 'Ingress (PC Aggregator)'}
                          {router.id === 2 && 'Primary Upper (Route A)'}
                          {router.id === 3 && 'Secondary Lower (Route B)'}
                          {router.id === 4 && 'Egress (Server Sink)'}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isDown
                                ? 'bg-red-950 text-red-400 border border-red-800'
                                : isCongested
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : isWarning
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            }`}
                          >
                            {isDown ? '💥 OFFLINE' : isCongested ? '🔴 CONGESTED' : isWarning ? '🟡 WARNING' : '🟢 HEALTHY'}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-300">
                          {isDown ? '—' : `${router.queueCount} / ${router.maxQueue} pkts`}
                        </td>
                        <td className="py-2.5">
                          <span className={router.lossRate > 0 ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                            {isDown ? '100%' : `${router.lossRate}%`}
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-bold">
                          <span
                            className={`text-sm ${
                              isDown
                                ? 'text-red-400'
                                : router.congestionScore > 60
                                ? 'text-rose-400'
                                : router.congestionScore > 30
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {isDown ? 'ERR (∞)' : router.congestionScore}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
