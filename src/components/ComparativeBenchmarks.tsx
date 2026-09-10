import React, { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts';
import { BENCHMARK_SCENARIOS } from '../services/ns3Artifacts';
import { TimeSeriesMetric } from '../types';
import {
  BarChart2,
  Table as TableIcon,
  TrendingDown,
  TrendingUp,
  Award,
  Zap,
  CheckCircle2,
  Clock,
  ShieldCheck,
} from 'lucide-react';

interface ComparativeBenchmarksProps {
  timeSeriesData: TimeSeriesMetric[];
}

export const ComparativeBenchmarks: React.FC<ComparativeBenchmarksProps> = ({
  timeSeriesData,
}) => {
  const [activeTab, setActiveTab] = useState<'table' | 'latency' | 'loss' | 'throughput' | 'hysteresis'>('table');

  // Benchmark chart data for recovery time and scenario bar charts
  const scenarioBarData = [
    { name: 'Normal', Conventional: 30.2, Proposed: 30.1 },
    { name: 'Moderate (6M)', Conventional: 48.5, Proposed: 38.2 },
    { name: 'Severe (12M)', Conventional: 112.4, Proposed: 51.8 },
  ];

  const lossBarData = [
    { name: 'Normal', Conventional: 0.0, Proposed: 0.0 },
    { name: 'Moderate (6M)', Conventional: 0.8, Proposed: 0.0 },
    { name: 'Severe (12M)', Conventional: 38.5, Proposed: 1.2 },
    { name: 'R2 Failure', Conventional: 100.0, Proposed: 2.1 },
  ];

  const recoveryBarData = [
    { name: 'Failure Recovery Time', Conventional: 99.0, Proposed: 1.2 },
  ];

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
      {/* Header & View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-emerald-400" />
            Evaluation & Comparative Analysis (PART 22 & PART 23)
          </h3>
          <p className="text-xs text-slate-400">
            System A (Conventional Static OSPF) vs System B (Proposed Self-Healing Adaptive Mechanism).
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('table')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'table'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5" />
            Comparative Table
          </button>
          <button
            onClick={() => setActiveTab('latency')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'latency'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Graph 1: Latency
          </button>
          <button
            onClick={() => setActiveTab('loss')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'loss'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Graph 2: Packet Loss
          </button>
          <button
            onClick={() => setActiveTab('throughput')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'throughput'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Graph 3: Throughput
          </button>
          <button
            onClick={() => setActiveTab('hysteresis')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'hysteresis'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Graph 4 & 5: Congestion / Hysteresis
          </button>
        </div>
      </div>

      {/* Tab 1: PART 22 Scientific Comparison Table */}
      {activeTab === 'table' && (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
                  <th className="py-2.5 px-3 font-semibold">Scenario</th>
                  <th className="py-2.5 px-3 font-semibold">Traffic Profile</th>
                  <th className="py-2.5 px-3 font-semibold">Primary Metric</th>
                  <th className="py-2.5 px-3 font-semibold text-rose-300">Conventional (Static)</th>
                  <th className="py-2.5 px-3 font-semibold text-emerald-300">Proposed (Self-Healing)</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Experimental Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {BENCHMARK_SCENARIOS.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-3 font-bold text-slate-200">{row.scenario}</td>
                    <td className="py-3 px-3 text-slate-400">{row.trafficRate}</td>
                    <td className="py-3 px-3 text-slate-300">{row.metric}</td>
                    <td className="py-3 px-3 text-rose-300/90 font-medium">{row.conventionalValue}</td>
                    <td className="py-3 px-3 text-emerald-300 font-bold bg-emerald-950/20">
                      {row.proposedValue}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" />
                        {row.improvement}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-400" />
              <strong>Conclusion for Viva:</strong> Proposed mechanism achieves 97% packet loss reduction under overload and restores communication in 1.2s without manual intervention.
            </span>
            <span className="text-[11px] text-slate-500 font-mono">Formula: C = 0.30L + 0.25D + 0.20Q + 0.25U</span>
          </div>
        </div>
      )}

      {/* Tab 2: Latency Chart */}
      {activeTab === 'latency' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-300 font-semibold">
              Live Latency Tracking: Conventional vs Proposed Adaptive Routing
            </span>
            <span className="text-slate-400 font-mono">Baseline: 30ms (Route A) • Alternate: 50ms (Route B)</span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeSeriesData.slice(-25)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} unit="ms" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="latencyConventional"
                  name="Conventional Routing (ms)"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="latencyProposed"
                  name="Proposed Adaptive Routing (ms)"
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tab 3: Packet Loss Chart */}
      {activeTab === 'loss' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-300 font-semibold">
              Packet Loss (%) Comparison Under Congestion & Router Failure
            </span>
            <span className="text-emerald-400 font-mono">Proposed drops subside to ~0% upon Route B switch</span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={lossBarData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={10} unit="%" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                />
                <Legend />
                <Bar dataKey="Conventional" name="Conventional (Static) Loss %" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Proposed" name="Proposed Adaptive Loss %" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tab 4: Throughput Chart */}
      {activeTab === 'throughput' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-300 font-semibold">
              Effective Delivered Throughput (Mbps) at Server
            </span>
            <span className="text-slate-400 font-mono">Link Bottleneck Limit: 10.0 Mbps</span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeSeriesData.slice(-25)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} unit="M" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="throughputProposed"
                  name="Proposed Delivered Throughput (Mbps)"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.2}
                />
                <Area
                  type="monotone"
                  dataKey="throughputConventional"
                  name="Conventional Throughput (Mbps)"
                  stroke="#f43f5e"
                  fill="#f43f5e"
                  fillOpacity={0.15}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tab 5: Congestion Score & Hysteresis over Time */}
      {activeTab === 'hysteresis' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-300 font-semibold">
              Graph 5: Congestion Score Over Time & Hysteresis Switching Bands
            </span>
            <span className="text-purple-400 font-mono">Switch threshold: &gt;70 • Return threshold: &lt;40</span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeSeriesData.slice(-30)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={10} />
                <YAxis domain={[0, 100]} stroke="#64748b" fontSize={10} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="congestionScoreR2"
                  name="R2 Congestion Score (0-100)"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="congestionScoreR3"
                  name="R3 Alternate Backup Score"
                  stroke="#a855f7"
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};
