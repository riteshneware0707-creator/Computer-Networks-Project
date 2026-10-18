import React, { useCallback, useEffect, useState } from 'react';
import {
  CongestionWeights,
  NetworkLink,
  NetworkNode,
  NodeId,
  SimulationState,
} from './types';
import { INITIAL_LINKS, INITIAL_NODES, INITIAL_WEIGHTS } from './services/networkData';
import { calculateCongestionScore } from './services/simulationCalculations';
import { ExperimentPanel } from './components/ExperimentPanel';
import { NetworkTopologyView } from './components/NetworkTopologyView';
import { MetricsDashboard } from './components/MetricsDashboard';
import {
  AlertOctagon,
  CheckCircle2,
  Flame,
  Network,
  Pause,
  Play,
  RotateCcw,
  Zap,
} from 'lucide-react';

type RouteName = 'Route A (R1-R2-R4)' | 'Route B (R1-R3-R4)';
type RouteState = RouteName | 'Disconnected';

const ROUTE_A: RouteName = 'Route A (R1-R2-R4)';
const ROUTE_B: RouteName = 'Route B (R1-R3-R4)';

function getRouteNodeIds(route: RouteState): NodeId[] {
  switch (route) {
    case ROUTE_A:
      return [0, 1, 2, 4, 5];
    case ROUTE_B:
      return [0, 1, 3, 4, 5];
    default:
      return [0, 1];
  }
}

function resolveRouteDecision(
  prevState: SimulationState,
  r2Score: number,
  isR2Failed: boolean
): {
  nextRoute: RouteState;
  switches: number;
  recoveryTime: number | null;
} {
  let nextRoute: RouteState = prevState.activeRoute;
  let switches = prevState.routeSwitchesCount;
  let recoveryTime = prevState.lastRecoveryTimeMs;

  if (isR2Failed) {
    if (prevState.activeRoute !== ROUTE_B) {
      nextRoute = ROUTE_B;
      switches += 1;
      recoveryTime = 1200;
    }
  } else if (r2Score > 70) {
    if (prevState.activeRoute !== ROUTE_B) {
      nextRoute = ROUTE_B;
      switches += 1;
    }
  } else if (r2Score < 40) {
    if (prevState.activeRoute !== ROUTE_A) {
      nextRoute = ROUTE_A;
      switches += 1;
    }
  }

  return { nextRoute, switches, recoveryTime };
}

export default function App() {
  const [nodes, setNodes] = useState<NetworkNode[]>(INITIAL_NODES);
  const [links, setLinks] = useState<NetworkLink[]>(INITIAL_LINKS);
  const [weights] = useState<CongestionWeights>(INITIAL_WEIGHTS);

  const [simState, setSimState] = useState<SimulationState>({
    simTimeSeconds: 1.0,
    isRunning: true,
    routingMode: 'adaptive',
    activeRoute: ROUTE_A,
    previousRoute: ROUTE_A,
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

  const getActivePathNodeIds = useCallback(() => getRouteNodeIds(simState.activeRoute), [simState.activeRoute]);

  useEffect(() => {
    if (!simState.isRunning) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setSimState((prev) => {
        const nextTime = Number((prev.simTimeSeconds + 0.5).toFixed(1));
        const isR2Failed = prev.manualR2Failure;
        const isR2Congested = prev.manualR2Congestion;

        let r2Loss = 0;
        let r2Delay = 10;
        let r2Queue = 4;
        let r2BwUtil = Math.min(100, Math.round((prev.generatedTrafficMbps / 2) * 100));

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
          2,
          weights
        );

        const r2Score = isR2Failed ? 100 : r2ScoreResult.score;
        const routeDecision = resolveRouteDecision(prev, r2Score, isR2Failed);
        const isRouteBActive = routeDecision.nextRoute === ROUTE_B;

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

        const currentLatency = isRouteBActive ? 50.8 : 30.1;
        const currentThroughput = isRouteBActive ? 9.8 : prev.generatedTrafficMbps;

        return {
          ...prev,
          simTimeSeconds: nextTime,
          activeRoute: routeDecision.nextRoute,
          previousRoute: prev.activeRoute,
          routeSwitchesCount: routeDecision.switches,
          currentCongestionScore: r2Score,
          overallLatencyMs: currentLatency,
          overallLossPct: 0,
          overallThroughputMbps: currentThroughput,
          lastRecoveryTimeMs: routeDecision.recoveryTime,
        };
      });
    }, 800);

    return () => window.clearInterval(interval);
  }, [simState.isRunning, weights]);

  const handleNormal = () => {
    setSimState((prev) => ({
      ...prev,
      generatedTrafficMbps: 2.0,
      manualR2Congestion: false,
      manualR2Failure: false,
      activeRoute: ROUTE_A,
    }));
  };

  const handleCreateCongestion = () => {
    setSimState((prev) => ({
      ...prev,
      generatedTrafficMbps: 12.0,
      manualR2Congestion: true,
      manualR2Failure: false,
    }));
  };

  const handleFailR2 = () => {
    setSimState((prev) => ({
      ...prev,
      manualR2Failure: true,
      manualR2Congestion: false,
      lastFailureTime: prev.simTimeSeconds,
    }));
  };

  const handleReset = () => {
    setSimState((prev) => ({
      ...prev,
      generatedTrafficMbps: 2.0,
      manualR2Congestion: false,
      manualR2Failure: false,
      activeRoute: ROUTE_A,
      routeSwitchesCount: 0,
    }));
  };

  const toggleNodeFail = (nodeId: NodeId) => {
    if (nodeId === 2) {
      setSimState((prev) => ({
        ...prev,
        manualR2Failure: !prev.manualR2Failure,
      }));
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-sky-500 selection:text-white">
      <header className="bg-slate-900/90 border-b border-slate-800 px-4 lg:px-8 py-3.5">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">Self-Healing Adaptive Network</h1>
              <p className="text-xs text-slate-400">
                Browser demonstration with a separate local experiment API
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSimState((prev) => ({ ...prev, isRunning: !prev.isRunning }))}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all flex items-center gap-1.5"
            >
              {simState.isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {simState.isRunning ? 'Pause' : 'Resume'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 space-y-4">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <strong>Browser demo only:</strong> interactive controls and the animated topology are illustrative;
          they do not execute NS-3 or prove packets were redirected. Use recorded experiment data below for
          measured values and forwarding evidence.
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            type="button"
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
            type="button"
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
            type="button"
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
            type="button"
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
                  💥 <strong>Demo failure flag on R2.</strong> The browser selected Route B; packet forwarding is not verified.
                </span>
              )}
              {!simState.manualR2Failure && simState.activeRoute.includes('Route B') && (
                <span>
                  ⚠ <strong>Demo congestion state on R2 (score: {simState.currentCongestionScore}).</strong> Route B is selected in browser state only; forwarding is not verified.
                </span>
              )}
              {!simState.manualR2Failure && simState.activeRoute.includes('Route A') && (
                <span>
                  <strong>Browser demo state:</strong> Route A selected. Values below are illustrative, not NS-3 measurements.
                </span>
              )}
            </div>
          </div>

          <span className="text-[11px] text-slate-400 font-sans hidden sm:inline">
            Status: <strong className="text-slate-200">Demo only</strong>
          </span>
        </div>

        <ExperimentPanel />

        <NetworkTopologyView
          nodes={nodes}
          links={links}
          activeRoute={simState.activeRoute}
          activePathNodeIds={getActivePathNodeIds()}
          isSimulating={simState.isRunning}
          onToggleNodeFail={toggleNodeFail}
        />

        <MetricsDashboard state={simState} nodes={nodes} />
      </main>
    </div>
  );
}
