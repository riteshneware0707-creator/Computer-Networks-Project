import React from 'react';
import { NetworkNode, SimulationState } from '../types';
import { ArrowRightLeft, Clock, Activity, Zap } from 'lucide-react';

interface MetricsDashboardProps {
  state: SimulationState;
  nodes: NetworkNode[];
}

export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({ state, nodes }) => {
  const routers = nodes.filter((n) => n.type === 'router');

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-300">
        Browser demo metrics — not measured NS-3 output
      </p>
      {/* 4 Clean Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Metric 1: Current Route */}
        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Current Route</span>
            <ArrowRightLeft className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-base font-bold text-slate-100 truncate">
            {state.activeRoute}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono">
            Reroutes: <strong className="text-sky-300">{state.routeSwitchesCount}</strong>
          </div>
        </div>

        {/* Metric 2: Latency */}
        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>End-to-End Latency</span>
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-100">
            {state.overallLatencyMs.toFixed(1)} <span className="text-xs font-normal text-slate-400">ms</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {state.activeRoute.includes('Route A') ? 'Baseline (30ms)' : 'Alternate (51ms)'}
          </div>
        </div>

        {/* Metric 3: Packet Loss */}
        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Packet Loss</span>
            <Activity className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div
            className={`text-xl font-bold font-mono ${
              state.overallLossPct > 0 ? 'text-rose-400' : 'text-emerald-400'
            }`}
          >
            {state.overallLossPct.toFixed(1)}%
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {state.overallLossPct === 0 ? 'Optimal (0 drops)' : 'Congestion drops'}
          </div>
        </div>

        {/* Metric 4: Recovery Time */}
        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Recovery Time</span>
            <Zap className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-300">
            {state.lastRecoveryTimeMs ? `${(state.lastRecoveryTimeMs / 1000).toFixed(2)}s` : '1.20s'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Autonomous Failover
          </div>
        </div>
      </div>

      {/* Minimal Router Telemetry Table (PART 19) */}
      <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
        <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5">
          Router Telemetry & Congestion Scores (PART 19)
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="pb-2 font-semibold">Router</th>
                <th className="pb-2 font-semibold">Path Role</th>
                <th className="pb-2 font-semibold">Status</th>
                <th className="pb-2 font-semibold">Queue</th>
                <th className="pb-2 font-semibold text-right">Congestion Score (C)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 text-slate-300">
              {routers.map((router) => {
                const isDown = !router.isOnline;
                const isCongested = router.status === 'congested';

                return (
                  <tr key={router.id}>
                    <td className="py-2 font-bold text-slate-100">{router.label}</td>
                    <td className="py-2 text-slate-400">
                      {router.id === 1 && 'Ingress (PC)'}
                      {router.id === 2 && 'Route A (Primary)'}
                      {router.id === 3 && 'Route B (Backup)'}
                      {router.id === 4 && 'Egress (Server)'}
                    </td>
                    <td className="py-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isDown
                            ? 'bg-red-950 text-red-400 border border-red-800'
                            : isCongested
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : router.status === 'warning'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        }`}
                      >
                        {isDown
                          ? 'OFFLINE'
                          : isCongested
                          ? 'CONGESTED'
                          : router.status === 'warning'
                          ? 'WARNING'
                          : 'HEALTHY'}
                      </span>
                    </td>
                    <td className="py-2 text-slate-400">
                      {router.queueCount}/{router.maxQueue}
                    </td>
                    <td className="py-2 text-right font-bold text-slate-200">
                      {isDown ? '100 (Offline)' : `${router.congestionScore}/100`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
