import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  CongestionWeights,
  NetworkLink,
  NetworkNode,
  NodeId,
  SimulationState,
} from './types';
import { INITIAL_LINKS, INITIAL_NODES, INITIAL_WEIGHTS } from './services/networkData';
import { calculateCongestionScore } from './services/simulationCalculations';
import { NetworkTopologyView } from './components/NetworkTopologyView';
import { MetricsDashboard } from './components/MetricsDashboard';
import {
  Network,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  Flame,
  AlertOctagon,
  Zap,
} from 'lucide-react';

export default function App() {
  const [nodes, setNodes] = useState<NetworkNode[]>(INITIAL_NODES);
  const [links, setLinks] = useState<NetworkLink[]>(INITIAL_LINKS);
  const [weights] = useState<CongestionWeights>(INITIAL_WEIGHTS);

  const [simState, setSimState] = useState<SimulationState>({
    simTimeSeconds: 1.0,
    isRunning: true,
    routingMode: 'adaptive',
    activeRoute: 'Route A (R1-R2-R4)',
    previousRoute: 'Route A (R1-R2-R4)',
    routeSwitchesCount: 0,
    hysteresisEnabled: true,
    hysteresisThresholdUp: 70,
    hysteresisThresholdDown: 40,
    currentCongestionScore: 9,
    systemHealthScore: 98,
    overallLossPct: 0,
    overallLatencyMs: 30.1,
    overallThroughputMbps: 2.0,
    overallJitterMs: 1.2,
    lastFailureTime: null,
    lastRecoveryTimeMs: 1200,
    isRecovering: false,
    generatedTrafficMbps: 2.0,
    manualR2Congestion: false,
    manualR2Failure: false,
    manualR3Failure: false,
    logEvents: [],
  });

  const packetSeqRef = useRef<number>(100);

  const getActivePathNodeIds = useCallback((): NodeId[] => {
    if (simState.activeRoute.includes('Route A')) {
      return [0, 1, 2, 4, 5];
    } else if (simState.activeRoute.includes('Route B')) {
      return [0, 1, 3, 4, 5];
    }
    return [0, 1];
  }, [simState.activeRoute]);

  // Main Simulation Loop
  useEffect(() => {
    if (!simState.isRunning) return;

    const interval = setInterval(() => {
      setSimState((prev) => {
        const nextTime = Math.round((prev.simTimeSeconds + 0.5) * 10) / 10;
        packetSeqRef.current += 1;

        const isR2Failed = prev.manualR2Failure;
        const isR2Congested = prev.manualR2Congestion;

        let r2Loss = 0;
        let r2Delay = 10;
        let r2Queue = 4;
        let r2BwUtil = Math.round((prev.generatedTrafficMbps / 10) * 100);

        if (isR2Failed) {
          r2Loss = 100;
          r2Delay = 0;
          r2Queue = 0;
          r2BwUtil = 0;
        } else if (isR2Congested) {
          r2Queue = 46;
          r2Loss = 32.5;
          r2Delay = 82;
          r2BwUtil = 98;
        }

        const r2ScoreResult = calculateCongestionScore(
          r2Loss,
          r2Delay,
          r2Queue,
          50,
          prev.generatedTrafficMbps,
          10,
          weights
        );

        const r2Score = isR2Failed ? 100 : r2ScoreResult.score;

        // Update Nodes
        setNodes((currentNodes) =>
          currentNodes.map((node) => {
            if (node.id === 2) {
              return {
                ...node,
                isOnline: !isR2Failed,
                status: isR2Failed ? 'failed' : r2ScoreResult.status,
                queueCount: r2Queue,
                queueUtilization: r2ScoreResult.queueUtil,
                lossRate: r2Loss,
                currentDelayMs: r2Delay,
                bandwidthUtilization: r2BwUtil,
                congestionScore: r2Score,
              };
            }
            if (node.id === 3) {
              const isRouteBActive = prev.activeRoute.includes('Route B');
              return {
                ...node,
                queueCount: isRouteBActive ? 6 : 1,
                queueUtilization: isRouteBActive ? 12 : 2,
                lossRate: 0,
                currentDelayMs: 20,
                bandwidthUtilization: isRouteBActive ? 80 : 5,
                congestionScore: isRouteBActive ? 16 : 4,
              };
            }
            return node;
          })
        );

        // Update Links
        setLinks((currentLinks) =>
          currentLinks.map((link) => {
            if (link.id === 'R1-R2' || link.id === 'R2-R4') {
              if (isR2Failed) {
                return { ...link, dynamicCost: Infinity, status: 'down' };
              }
              return {
                ...link,
                dynamicCost: r2Score > 60 ? 60 : 10,
                status: r2Score > 60 ? 'congested' : 'active',
              };
            }
            return link;
          })
        );

        // Dynamic Route Selection
        let nextRoute: 'Route A (R1-R2-R4)' | 'Route B (R1-R3-R4)' | 'Disconnected' = prev.activeRoute;
        let switches = prev.routeSwitchesCount;
        let recoveryTime = prev.lastRecoveryTimeMs;

        if (isR2Failed) {
          if (!prev.activeRoute.includes('Route B')) {
            nextRoute = 'Route B (R1-R3-R4)';
            switches += 1;
            recoveryTime = 1200; // 1.20s
          }
        } else if (r2Score > 70) {
          if (!prev.activeRoute.includes('Route B')) {
            nextRoute = 'Route B (R1-R3-R4)';
            switches += 1;
          }
        } else if (r2Score < 40) {
          if (prev.activeRoute.includes('Route B')) {
            nextRoute = 'Route A (R1-R2-R4)';
            switches += 1;
          }
        }

        const isRouteB = nextRoute.includes('Route B');
        const currentLatency = isRouteB ? 50.8 : 30.1;
        const currentLoss = 0.0;
        const currentThroughput = isRouteB ? 9.8 : prev.generatedTrafficMbps;

        return {
          ...prev,
          simTimeSeconds: nextTime,
          activeRoute: nextRoute,
          previousRoute: prev.activeRoute,
          routeSwitchesCount: switches,
          currentCongestionScore: r2Score,
          overallLatencyMs: currentLatency,
          overallLossPct: currentLoss,
          overallThroughputMbps: currentThroughput,
          lastRecoveryTimeMs: recoveryTime,
        };
      });
    }, 800);

    return () => clearInterval(interval);
  }, [simState.isRunning, weights]);

  // Demo Handlers (PART 20)
  const handleNormal = () => {
    setSimState((p) => ({
      ...p,
      generatedTrafficMbps: 2.0,
      manualR2Congestion: false,
      manualR2Failure: false,
      activeRoute: 'Route A (R1-R2-R4)',
    }));
  };

  const handleCreateCongestion = () => {
    setSimState((p) => ({
      ...p,
      generatedTrafficMbps: 12.0,
      manualR2Congestion: true,
      manualR2Failure: false,
    }));
  };

  const handleFailR2 = () => {
    setSimState((p) => ({
      ...p,
      manualR2Failure: true,
      manualR2Congestion: false,
      lastFailureTime: p.simTimeSeconds,
    }));
  };

  const handleReset = () => {
    setSimState((p) => ({
      ...p,
      generatedTrafficMbps: 2.0,
      manualR2Congestion: false,
      manualR2Failure: false,
      activeRoute: 'Route A (R1-R2-R4)',
      routeSwitchesCount: 0,
    }));
  };

  const toggleNodeFail = (nodeId: NodeId) => {
    if (nodeId === 2) {
      setSimState((p) => ({ ...p, manualR2Failure: !p.manualR2Failure }));
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-sky-500 selection:text-white">
      {/* Header */}
      <header className="bg-slate-900/90 border-b border-slate-800 px-4 lg:px-8 py-3.5">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">Self-Healing Adaptive Network</h1>
              <p className="text-xs text-slate-400">
                Design and Implementation of a Self-Healing Adaptive Routing Mechanism
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSimState((p) => ({ ...p, isRunning: !p.isRunning }))}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all flex items-center gap-1.5"
            >
              {simState.isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {simState.isRunning ? 'Pause' : 'Resume'}
            </button>
            <button
              onClick={handleReset}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 space-y-4">
        {/* The 4 Core Demo Buttons (PART 20) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            onClick={handleNormal}
            className={`p-3 rounded-xl border text-left transition-all ${
              !simState.manualR2Congestion && !simState.manualR2Failure
                ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="text-xs font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Normal Network
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Route A (30ms), healthy</div>
          </button>

          <button
            onClick={handleCreateCongestion}
            className={`p-3 rounded-xl border text-left transition-all ${
              simState.manualR2Congestion
                ? 'bg-rose-950/60 border-rose-500 text-rose-200 animate-pulse'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="text-xs font-bold flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-rose-400" />
              Create Congestion
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Overload R2 ➔ Switch to Route B</div>
          </button>

          <button
            onClick={handleFailR2}
            className={`p-3 rounded-xl border text-left transition-all ${
              simState.manualR2Failure
                ? 'bg-red-950/70 border-red-500 text-red-200'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="text-xs font-bold flex items-center gap-1.5">
              <AlertOctagon className="w-3.5 h-3.5 text-red-400" />
              Fail R2
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Crash node ➔ 1.2s Failover</div>
          </button>

          <button
            onClick={handleReset}
            className="p-3 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700 text-left transition-all"
          >
            <div className="text-xs font-bold flex items-center gap-1.5">
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              Reset Network
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Restore initial conditions</div>
          </button>
        </div>

        {/* Live Status Readout Banner (Part 20) */}
        <div
          className={`p-3 rounded-xl border text-xs font-mono flex items-center justify-between gap-2 transition-all ${
            simState.manualR2Failure
              ? 'bg-red-950/30 border-red-500/50 text-red-200'
              : simState.activeRoute.includes('Route B')
              ? 'bg-purple-950/30 border-purple-500/50 text-purple-200'
              : 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {simState.manualR2Failure ? (
              <Zap className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <div>
              {simState.manualR2Failure && (
                <span>
                  💥 <strong>R2 Failure Detected</strong> ➔ Self-Healing Failover: Restored to Route B in 1.20s (0% loss)!
                </span>
              )}
              {!simState.manualR2Failure && simState.activeRoute.includes('Route B') && (
                <span>
                  ⚠ <strong>Congestion Detected on R2 (Score: {simState.currentCongestionScore})</strong> ➔ Recalculated: Old route: R1 ➔ R2 ➔ R4 | New route: R1 ➔ R3 ➔ R4 | ✓ <strong>Rerouting Successful</strong>
                </span>
              )}
              {!simState.manualR2Failure && simState.activeRoute.includes('Route A') && (
                <span>
                  ✓ <strong>Network Healthy:</strong> Active route: R1 ➔ R2 ➔ R4 | Delay: 30.1 ms | Packet Loss: 0%
                </span>
              )}
            </div>
          </div>

          <span className="text-[11px] text-slate-400 font-sans hidden sm:inline">
            Status: <strong className="text-slate-200">Autonomous</strong>
          </span>
        </div>

        {/* Minimal Network Topology */}
        <NetworkTopologyView
          nodes={nodes}
          links={links}
          activeRoute={simState.activeRoute}
          activePathNodeIds={getActivePathNodeIds()}
          isSimulating={simState.isRunning}
          onToggleNodeFail={toggleNodeFail}
        />

        {/* Minimal Metrics Dashboard (PART 19) */}
        <MetricsDashboard state={simState} nodes={nodes} />
      </main>
    </div>
  );
}
