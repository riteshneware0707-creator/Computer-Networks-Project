import React from 'react';
import { CongestionWeights, NetworkLink, NetworkNode } from '../types';
import {
  Cpu,
  Calculator,
  GitCommit,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

interface AlgorithmVisualizerProps {
  nodes: NetworkNode[];
  links: NetworkLink[];
  weights: CongestionWeights;
  onUpdateWeights: (newWeights: CongestionWeights) => void;
  activeRoute: string;
  dijkstraLogs: string[];
  hysteresisThresholdUp: number;
  hysteresisThresholdDown: number;
}

export const AlgorithmVisualizer: React.FC<AlgorithmVisualizerProps> = ({
  nodes,
  links,
  weights,
  onUpdateWeights,
  activeRoute,
  dijkstraLogs,
  hysteresisThresholdUp,
  hysteresisThresholdDown,
}) => {
  const r2 = nodes.find((n) => n.id === 2);
  const r3 = nodes.find((n) => n.id === 3);

  // Links for Route A vs Route B
  const linkR1R2 = links.find((l) => l.id === 'R1-R2');
  const linkR2R4 = links.find((l) => l.id === 'R2-R4');
  const linkR1R3 = links.find((l) => l.id === 'R1-R3');
  const linkR3R4 = links.find((l) => l.id === 'R3-R4');

  const costRouteA =
    !r2?.isOnline
      ? Infinity
      : (linkR1R2?.dynamicCost ?? 10) + (linkR2R4?.dynamicCost ?? 10);

  const costRouteB =
    !r3?.isOnline
      ? Infinity
      : (linkR1R3?.dynamicCost ?? 20) + (linkR3R4?.dynamicCost ?? 20);

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-purple-400" />
            Routing Intelligence & Dynamic Dijkstra Engine (PART 12–15, 18)
          </h3>
          <p className="text-xs text-slate-400">
            Mathematical cost calculation, weight tuning, and Dijkstra graph relaxation trace.
          </p>
        </div>

        <button
          onClick={() =>
            onUpdateWeights({ loss: 0.3, delay: 0.25, queue: 0.2, utilization: 0.25 })
          }
          className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 bg-slate-950 px-2.5 py-1 rounded border border-slate-800"
        >
          <RotateCcw className="w-3 h-3" />
          Reset Weights
        </button>
      </div>

      {/* Grid: 3 Analytical Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Column 1: Congestion Score Equation & Sliders */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Calculator className="w-3.5 h-3.5 text-sky-400" />
              Weight Tuning ($W_l, W_d, W_q, W_u$)
            </h4>
            <span className="text-[10px] font-mono text-emerald-400">
              Sum = {(weights.loss + weights.delay + weights.queue + weights.utilization).toFixed(2)}
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs text-slate-200">
            <div className="text-sky-300 font-bold mb-1">
              C = (W_l · L) + (W_d · D) + (W_q · Q) + (W_u · U)
            </div>
            <div className="text-[11px] text-slate-400">
              Normalized components: 0 to 100
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Loss Weight ($W_l$):</span>
                <span className="font-mono text-sky-400">{weights.loss.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.6"
                step="0.05"
                value={weights.loss}
                onChange={(e) => onUpdateWeights({ ...weights, loss: parseFloat(e.target.value) })}
                className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Delay Weight ($W_d$):</span>
                <span className="font-mono text-sky-400">{weights.delay.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.6"
                step="0.05"
                value={weights.delay}
                onChange={(e) => onUpdateWeights({ ...weights, delay: parseFloat(e.target.value) })}
                className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Queue Weight ($W_q$):</span>
                <span className="font-mono text-sky-400">{weights.queue.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.6"
                step="0.05"
                value={weights.queue}
                onChange={(e) => onUpdateWeights({ ...weights, queue: parseFloat(e.target.value) })}
                className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Utilization Weight ($W_u$):</span>
                <span className="font-mono text-sky-400">{weights.utilization.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.6"
                step="0.05"
                value={weights.utilization}
                onChange={(e) => onUpdateWeights({ ...weights, utilization: parseFloat(e.target.value) })}
                className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Column 2: Dynamic Cost Evaluation (PART 14) */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <GitCommit className="w-3.5 h-3.5 text-emerald-400" />
            Route Comparison & Cost Penalties
          </h4>

          {/* Route A Card */}
          <div
            className={`p-3 rounded-lg border text-xs font-mono transition-all ${
              activeRoute.includes('Route A')
                ? 'bg-sky-950/40 border-sky-500 text-sky-200'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            <div className="flex items-center justify-between font-bold text-sm mb-1 text-slate-200">
              <span>Route A (via R2)</span>
              {activeRoute.includes('Route A') && (
                <span className="text-[10px] bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded">
                  WINNER
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400">PC ➔ R1 ➔ R2 ➔ R4 ➔ Server</div>
            <div className="mt-2 text-xs">
              Formula: R1-R2 ({linkR1R2?.dynamicCost.toFixed(0)}) + R2-R4 ({linkR2R4?.dynamicCost.toFixed(0)})
            </div>
            <div className="text-sm font-bold text-slate-100 mt-1">
              Dynamic Cost: {costRouteA === Infinity ? '∞ (Offline)' : costRouteA.toFixed(1)}
            </div>
          </div>

          {/* Route B Card */}
          <div
            className={`p-3 rounded-lg border text-xs font-mono transition-all ${
              activeRoute.includes('Route B')
                ? 'bg-purple-950/40 border-purple-500 text-purple-200'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            <div className="flex items-center justify-between font-bold text-sm mb-1 text-slate-200">
              <span>Route B (via R3)</span>
              {activeRoute.includes('Route B') && (
                <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded">
                  WINNER
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400">PC ➔ R1 ➔ R3 ➔ R4 ➔ Server</div>
            <div className="mt-2 text-xs">
              Formula: R1-R3 ({linkR1R3?.dynamicCost.toFixed(0)}) + R3-R4 ({linkR3R4?.dynamicCost.toFixed(0)})
            </div>
            <div className="text-sm font-bold text-slate-100 mt-1">
              Dynamic Cost: {costRouteB === Infinity ? '∞ (Offline)' : costRouteB.toFixed(1)}
            </div>
          </div>

          {/* Hysteresis rule explanation */}
          <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400">
            <span className="font-semibold text-slate-300">Hysteresis Logic:</span>
            <br />
            • Switch away when <strong className="text-amber-400">C &gt; {hysteresisThresholdUp}</strong>
            <br />
            • Return back only when <strong className="text-emerald-400">C &lt; {hysteresisThresholdDown}</strong>
          </div>
        </div>

        {/* Column 3: Real-Time Dijkstra Step Logs */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-2 font-mono text-xs">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-purple-400" />
              Dijkstra Convergence Trace
            </h4>

            <div className="max-h-48 overflow-y-auto space-y-1 text-[11px] text-slate-400 p-2 rounded bg-slate-900 border border-slate-800">
              {dijkstraLogs.slice(-6).map((log, index) => (
                <div key={index} className="leading-snug">
                  {log.includes('Target') || log.includes('WINNER') ? (
                    <span className="text-emerald-400 font-semibold">{log}</span>
                  ) : log.includes('Relax') ? (
                    <span className="text-sky-300">{log}</span>
                  ) : (
                    <span>{log}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="p-2.5 rounded bg-emerald-950/20 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>Optimal loop-free path confirmed via Dijkstra graph relaxation.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
