import React from 'react';
import { SimulationState } from '../types';
import {
  Play,
  Pause,
  RotateCcw,
  Flame,
  AlertOctagon,
  CheckCircle2,
  Sliders,
  ShieldAlert,
  GitBranch,
  Radio,
  Zap,
  RefreshCw,
} from 'lucide-react';

interface ControlDeckProps {
  state: SimulationState;
  onApplyScenario: (scenarioType: 'normal' | 'moderate' | 'congested' | 'fail_r2' | 'flapping_test' | 'reset') => void;
  onUpdateTrafficRate: (mbps: number) => void;
  onToggleRoutingMode: () => void;
  onToggleHysteresis: () => void;
  onToggleSimulation: () => void;
}

export const ControlDeck: React.FC<ControlDeckProps> = ({
  state,
  onApplyScenario,
  onUpdateTrafficRate,
  onToggleRoutingMode,
  onToggleHysteresis,
  onToggleSimulation,
}) => {
  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl backdrop-blur-md space-y-4">
      {/* Top action row: Big Presentation Buttons (PART 20 & 21) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-sky-400" />
            Interactive Presentation Control Deck (PART 20 Demo Buttons)
          </h3>
          <p className="text-xs text-slate-400">
            One-click experiment orchestrator for live viva demonstration and performance validation.
          </p>
        </div>

        {/* Global Play/Pause & Reset */}
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleSimulation}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              state.isRunning
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
            }`}
          >
            {state.isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {state.isRunning ? 'Pause Sim' : 'Resume Sim'}
          </button>

          <button
            onClick={() => onApplyScenario('reset')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            Reset
          </button>
        </div>
      </div>

      {/* 5 Quick Scenario Buttons from PART 20 & PART 21 */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Standard Evaluation Scenarios (Professor Demo Triggers):
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {/* Button 1: Normal */}
          <button
            onClick={() => onApplyScenario('normal')}
            className={`p-3 rounded-xl border text-left transition-all group ${
              !state.manualR2Congestion && !state.manualR2Failure && state.generatedTrafficMbps <= 3
                ? 'bg-emerald-950/50 border-emerald-500 text-emerald-200 shadow-md shadow-emerald-950/50'
                : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-emerald-500/50 hover:bg-emerald-950/20'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Normal
              </span>
              <span className="text-[10px] font-mono text-emerald-400">2 Mbps</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-tight">
              Route A active (30ms). 0% loss, healthy buffers.
            </p>
          </button>

          {/* Button 2: Moderate */}
          <button
            onClick={() => onApplyScenario('moderate')}
            className={`p-3 rounded-xl border text-left transition-all group ${
              state.generatedTrafficMbps === 6 && !state.manualR2Failure
                ? 'bg-amber-950/50 border-amber-500 text-amber-200 shadow-md shadow-amber-950/50'
                : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-amber-500/50 hover:bg-amber-950/20'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold flex items-center gap-1">
                <Radio className="w-3.5 h-3.5 text-amber-400" />
                Moderate Load
              </span>
              <span className="text-[10px] font-mono text-amber-400">6 Mbps</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-tight">
              Queue climbs. Warning state on R2 (Score ~45).
            </p>
          </button>

          {/* Button 3: Create Severe Congestion */}
          <button
            onClick={() => onApplyScenario('congested')}
            className={`p-3 rounded-xl border text-left transition-all group ${
              state.manualR2Congestion
                ? 'bg-rose-950/60 border-rose-500 text-rose-200 shadow-md shadow-rose-950/50 animate-pulse'
                : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-rose-500/50 hover:bg-rose-950/20'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-rose-400" />
                Congest R2 🔥
              </span>
              <span className="text-[10px] font-mono text-rose-400">12 Mbps</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-tight">
              Traffic &gt; 10M capacity. Score &gt; 70. Auto-switch to Route B!
            </p>
          </button>

          {/* Button 4: Fail R2 */}
          <button
            onClick={() => onApplyScenario('fail_r2')}
            className={`p-3 rounded-xl border text-left transition-all group ${
              state.manualR2Failure
                ? 'bg-red-950/80 border-red-500 text-red-200 shadow-md shadow-red-950/50'
                : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-red-500/50 hover:bg-red-950/20'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold flex items-center gap-1">
                <AlertOctagon className="w-3.5 h-3.5 text-red-400" />
                Fail R2 💥
              </span>
              <span className="text-[10px] font-mono text-red-400">CRASH</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-tight">
              Simulates router down. Triggers self-healing failover (1.2s).
            </p>
          </button>

          {/* Button 5: Hysteresis / Flapping Test */}
          <button
            onClick={() => onApplyScenario('flapping_test')}
            className="p-3 rounded-xl border border-slate-800 bg-slate-950/60 text-slate-300 hover:border-purple-500/50 hover:bg-purple-950/20 text-left transition-all"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold flex items-center gap-1">
                <GitBranch className="w-3.5 h-3.5 text-purple-400" />
                Flapping Test
              </span>
              <span className="text-[10px] font-mono text-purple-400">Hysteresis</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-tight">
              Validates &gt;70 switch and &lt;40 return prevention loop.
            </p>
          </button>
        </div>
      </div>

      {/* Bottom Fine-Grained Adjustments */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-800/80 items-center">
        {/* Continuous Traffic Slider */}
        <div>
          <div className="flex justify-between items-center text-xs mb-1.5">
            <span className="text-slate-300 font-medium">Traffic Generator (PC ─&gt; Server):</span>
            <span className="font-mono font-bold text-sky-400 text-sm">
              {state.generatedTrafficMbps.toFixed(1)} Mbps
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="15"
            step="0.5"
            value={state.generatedTrafficMbps}
            onChange={(e) => onUpdateTrafficRate(parseFloat(e.target.value))}
            className="w-full accent-sky-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
            <span>1M (Light)</span>
            <span className="text-amber-500 font-semibold">10M (Link Limit)</span>
            <span className="text-rose-400 font-semibold">15M (Overload)</span>
          </div>
        </div>

        {/* Algorithm Mode Toggle: Proposed vs Conventional */}
        <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
          <div className="text-[11px] text-slate-400 mb-1 flex items-center justify-between">
            <span>Routing Intelligence Engine:</span>
            <span className="text-[10px] uppercase font-mono text-sky-400">Mode</span>
          </div>
          <button
            onClick={onToggleRoutingMode}
            className={`w-full py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              state.routingMode === 'adaptive'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            {state.routingMode === 'adaptive'
              ? 'Proposed: Self-Healing Adaptive (Dijkstra + Cost)'
              : 'Conventional: Static OSPF (No Congestion Awareness)'}
          </button>
        </div>

        {/* Hysteresis Toggle */}
        <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-200">Route Flap Prevention</div>
            <div className="text-[10px] text-slate-400">
              Hysteresis (&gt;70 switch / &lt;40 return)
            </div>
          </div>
          <button
            onClick={onToggleHysteresis}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
              state.hysteresisEnabled
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {state.hysteresisEnabled ? 'ON (Damped)' : 'OFF (Raw)'}
          </button>
        </div>
      </div>
    </div>
  );
};
