import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  CongestionWeights,
  NetworkLink,
  NetworkNode,
  NodeId,
  PacketTrace,
  SimulationState,
  TimeSeriesMetric,
} from './types';
import { INITIAL_LINKS, INITIAL_NODES, INITIAL_WEIGHTS } from './services/networkData';
import {
  calculateCongestionScore,
  computeDynamicLinkCost,
  generateSimulatedPacket,
} from './services/simulationCalculations';
import { computeShortestPathDijkstra } from './services/dijkstra';
import { NetworkTopologyView } from './components/NetworkTopologyView';
import { MetricsDashboard } from './components/MetricsDashboard';
import { ControlDeck } from './components/ControlDeck';
import { ComparativeBenchmarks } from './components/ComparativeBenchmarks';
import { WiresharkInspector } from './components/WiresharkInspector';
import { AlgorithmVisualizer } from './components/AlgorithmVisualizer';
import { CodeArtifactsViewer } from './components/CodeArtifactsViewer';
import {
  ShieldAlert,
  Radio,
  Cpu,
  Terminal,
  Activity,
  BarChart2,
  FileCode2,
  Layers,
  Sparkles,
  Info,
  CheckCircle2,
  X,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';

export default function App() {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'topology' | 'benchmarks' | 'wireshark' | 'dijkstra' | 'artifacts'>('topology');
  const [showVercelModal, setShowVercelModal] = useState(false);

  // Simulation Data States
  const [nodes, setNodes] = useState<NetworkNode[]>(INITIAL_NODES);
  const [links, setLinks] = useState<NetworkLink[]>(INITIAL_LINKS);
  const [weights, setWeights] = useState<CongestionWeights>(INITIAL_WEIGHTS);
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(2); // Default inspect R2
  const [packets, setPackets] = useState<PacketTrace[]>([]);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesMetric[]>([]);
  const [dijkstraLogs, setDijkstraLogs] = useState<string[]>([]);

  // Core Simulation State
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
    overallLatencyMs: 30.0,
    overallThroughputMbps: 2.0,
    overallJitterMs: 1.2,
    lastFailureTime: null,
    lastRecoveryTimeMs: 1200,
    isRecovering: false,
    generatedTrafficMbps: 2.0,
    manualR2Congestion: false,
    manualR2Failure: false,
    manualR3Failure: false,
    logEvents: [
      {
        id: 'init-1',
        timestamp: '14:00:00.000',
        type: 'info',
        message: 'System booted: NS-3 Point-to-Point Virtual Topology configured with 6 subnets.',
      },
      {
        id: 'init-2',
        timestamp: '14:00:00.500',
        type: 'success',
        message: 'Baseline converged on Route A (PC -> R1 -> R2 -> R4 -> Server), Delay: 30ms.',
      },
    ],
  });

  const packetSeqRef = useRef<number>(100);

  // Active path node IDs helper
  const getActivePathNodeIds = useCallback((): NodeId[] => {
    if (simState.activeRoute.includes('Route A')) {
      return [0, 1, 2, 4, 5];
    } else if (simState.activeRoute.includes('Route B')) {
      return [0, 1, 3, 4, 5];
    }
    return [0, 1]; // Disconnected
  }, [simState.activeRoute]);

  // Main Simulation Step Tick
  useEffect(() => {
    if (!simState.isRunning) return;

    const interval = setInterval(() => {
      setSimState((prev) => {
        const nextTime = Math.round((prev.simTimeSeconds + 0.5) * 10) / 10;
        packetSeqRef.current += 1;
        const currentSeq = packetSeqRef.current;

        // Determine R2 condition
        const isR2Failed = prev.manualR2Failure;
        const isR2Congested = prev.manualR2Congestion || (prev.generatedTrafficMbps > 10 && prev.activeRoute.includes('Route A'));

        // Calculate R2 Metrics
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
          r2Queue = 46; // Close to maxQueue 50
          r2Loss = 32.5; // Dropping packets
          r2Delay = 82; // High queue buffer delay
          r2BwUtil = 98;
        } else if (prev.generatedTrafficMbps === 6) {
          r2Queue = 24;
          r2Loss = 0.5;
          r2Delay = 35;
          r2BwUtil = 60;
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

        // Update Nodes State
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
                bandwidthUtilization: isRouteBActive ? Math.round((prev.generatedTrafficMbps / 10) * 100) : 5,
                congestionScore: isRouteBActive ? 16 : 4,
              };
            }
            return node;
          })
        );

        // Update Dynamic Links
        setLinks((currentLinks) =>
          currentLinks.map((link) => {
            if (link.id === 'R1-R2' || link.id === 'R2-R4') {
              if (isR2Failed) {
                return { ...link, dynamicCost: Infinity, status: 'down' };
              }
              const penalty = r2Score > 30 ? (r2Score - 30) * 1.5 : 0;
              return {
                ...link,
                dynamicCost: Math.round((link.baseDelayMs + penalty) * 10) / 10,
                status: r2Score > 60 ? 'congested' : r2Score > 30 ? 'warning' : 'active',
                currentLoadMbps: prev.activeRoute.includes('Route A') ? prev.generatedTrafficMbps : 0.1,
              };
            }
            if (link.id === 'R1-R3' || link.id === 'R3-R4') {
              return {
                ...link,
                currentLoadMbps: prev.activeRoute.includes('Route B') ? prev.generatedTrafficMbps : 0.1,
              };
            }
            return link;
          })
        );

        // Route Selection Logic
        let nextRoute: 'Route A (R1-R2-R4)' | 'Route B (R1-R3-R4)' | 'Disconnected' = prev.activeRoute;
        let switches = prev.routeSwitchesCount;
        let recoveryTime = prev.lastRecoveryTimeMs;

        if (prev.routingMode === 'conventional') {
          // Conventional Static Routing stays on Route A regardless
          nextRoute = isR2Failed ? 'Disconnected' : 'Route A (R1-R2-R4)';
        } else {
          // Proposed Adaptive Routing with Hysteresis
          if (isR2Failed) {
            // Instant Failover to Route B
            if (!prev.activeRoute.includes('Route B')) {
              nextRoute = 'Route B (R1-R3-R4)';
              switches += 1;
              recoveryTime = 1200; // 1.2 seconds measured convergence
            }
          } else if (prev.activeRoute.includes('Route A')) {
            // Check upper threshold (> 70)
            if (r2Score > prev.hysteresisThresholdUp) {
              nextRoute = 'Route B (R1-R3-R4)';
              switches += 1;
            }
          } else if (prev.activeRoute.includes('Route B')) {
            // Check return threshold (< 40)
            if (prev.hysteresisEnabled) {
              if (r2Score < prev.hysteresisThresholdDown) {
                nextRoute = 'Route A (R1-R2-R4)';
                switches += 1;
              }
            } else {
              // Without hysteresis: flaps if score drops below 60
              if (r2Score < 60) {
                nextRoute = 'Route A (R1-R2-R4)';
                switches += 1;
              }
            }
          }
        }

        // Overall Performance Metrics
        let currentLatency = 30.0;
        let currentLoss = 0.0;
        let currentThroughput = prev.generatedTrafficMbps;

        if (prev.routingMode === 'conventional') {
          if (isR2Failed) {
            currentLoss = 100.0;
            currentThroughput = 0.0;
            currentLatency = 0.0;
          } else if (isR2Congested) {
            currentLatency = 112.4;
            currentLoss = 38.5;
            currentThroughput = Math.min(prev.generatedTrafficMbps, 7.2);
          } else {
            currentLatency = 30.2;
            currentLoss = 0.0;
            currentThroughput = prev.generatedTrafficMbps;
          }
        } else {
          // Proposed
          if (nextRoute.includes('Route B')) {
            currentLatency = 50.8 + (Math.random() * 2 - 1);
            currentLoss = 0.0;
            currentThroughput = Math.min(prev.generatedTrafficMbps, 9.8);
          } else if (isR2Failed) {
            currentLoss = 100.0;
            currentThroughput = 0.0;
          } else {
            currentLatency = 30.1 + (Math.random() * 1.5 - 0.75);
            currentLoss = 0.0;
            currentThroughput = prev.generatedTrafficMbps;
          }
        }

        // Health Score (0 - 100)
        const health = Math.round(
          Math.max(
            0,
            100 -
              currentLoss * 0.8 -
              (currentLatency > 40 ? (currentLatency - 40) * 0.5 : 0) -
              (isR2Failed ? 15 : 0)
          )
        );

        // Generate packet
        const newPacket = generateSimulatedPacket(
          currentSeq,
          nextTime,
          nextRoute,
          isR2Congested,
          isR2Failed,
          prev.routingMode === 'conventional'
        );

        setPackets((oldPackets) => [newPacket, ...oldPackets.slice(0, 75)]);

        // Push TimeSeries Chart Data
        const timeLabel = `T+${nextTime.toFixed(1)}s`;
        setTimeSeriesData((oldData) => {
          const newPoint: TimeSeriesMetric = {
            time: timeLabel,
            rawTime: nextTime,
            latencyProposed: nextRoute.includes('Route B') ? 51.2 : 30.1,
            latencyConventional: isR2Failed ? 0 : isR2Congested ? 112.4 : 30.2,
            lossProposed: nextRoute.includes('Route B') ? 0 : isR2Failed ? 100 : isR2Congested ? 25 : 0,
            lossConventional: isR2Failed ? 100 : isR2Congested ? 38.5 : 0,
            throughputProposed: currentThroughput,
            throughputConventional: prev.routingMode === 'conventional' ? currentThroughput : (isR2Failed ? 0 : 7.2),
            congestionScoreR2: r2Score,
            congestionScoreR3: nextRoute.includes('Route B') ? 16 : 4,
          };
          return [...oldData.slice(-35), newPoint];
        });

        // Run Dijkstra to update step logs
        const dResult = computeShortestPathDijkstra(
          nodes,
          links,
          0,
          5,
          prev.routingMode === 'conventional'
        );
        setDijkstraLogs(dResult.stepLogs);

        return {
          ...prev,
          simTimeSeconds: nextTime,
          activeRoute: nextRoute,
          previousRoute: prev.activeRoute,
          routeSwitchesCount: switches,
          currentCongestionScore: r2Score,
          systemHealthScore: health,
          overallLatencyMs: currentLatency,
          overallLossPct: currentLoss,
          overallThroughputMbps: currentThroughput,
          overallJitterMs: Math.round((Math.random() * 2.2 + 0.4) * 10) / 10,
          lastRecoveryTimeMs: recoveryTime,
        };
      });
    }, 800);

    return () => clearInterval(interval);
  }, [simState.isRunning, weights]);

  // Scenario Handlers (PART 20 & 21)
  const handleApplyScenario = (type: 'normal' | 'moderate' | 'congested' | 'fail_r2' | 'flapping_test' | 'reset') => {
    setSimState((prev) => {
      if (type === 'normal') {
        return {
          ...prev,
          generatedTrafficMbps: 2.0,
          manualR2Congestion: false,
          manualR2Failure: false,
          activeRoute: 'Route A (R1-R2-R4)',
        };
      }
      if (type === 'moderate') {
        return {
          ...prev,
          generatedTrafficMbps: 6.0,
          manualR2Congestion: false,
          manualR2Failure: false,
        };
      }
      if (type === 'congested') {
        return {
          ...prev,
          generatedTrafficMbps: 12.0,
          manualR2Congestion: true,
          manualR2Failure: false,
        };
      }
      if (type === 'fail_r2') {
        return {
          ...prev,
          manualR2Failure: true,
          manualR2Congestion: false,
          lastFailureTime: prev.simTimeSeconds,
        };
      }
      if (type === 'flapping_test') {
        return {
          ...prev,
          hysteresisEnabled: !prev.hysteresisEnabled,
          generatedTrafficMbps: 8.5,
          manualR2Congestion: false,
          manualR2Failure: false,
        };
      }
      if (type === 'reset') {
        return {
          ...prev,
          generatedTrafficMbps: 2.0,
          manualR2Congestion: false,
          manualR2Failure: false,
          activeRoute: 'Route A (R1-R2-R4)',
          routeSwitchesCount: 0,
        };
      }
      return prev;
    });
  };

  const handleToggleNodeFail = (nodeId: NodeId) => {
    if (nodeId === 2) {
      setSimState((prev) => ({
        ...prev,
        manualR2Failure: !prev.manualR2Failure,
        lastFailureTime: !prev.manualR2Failure ? prev.simTimeSeconds : prev.lastFailureTime,
      }));
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-sky-500 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-slate-950/90 border-b border-slate-800 backdrop-blur-md px-4 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 shadow-md shadow-sky-500/20 text-white">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black tracking-tight text-white">
                  Self-Healing Adaptive Network
                </h1>
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  NS-3 Virtual Laboratory + Python Intelligence
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Design and Implementation of an Adaptive Routing Mechanism for Dynamic Networks
              </p>
            </div>
          </div>

          {/* Nav Tabs */}
          <nav className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab('topology')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'topology'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              Live Topology & Controls
            </button>

            <button
              onClick={() => setActiveTab('benchmarks')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'benchmarks'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              Benchmarks & Graphs
            </button>

            <button
              onClick={() => setActiveTab('wireshark')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'wireshark'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              Wireshark Inspector
            </button>

            <button
              onClick={() => setActiveTab('dijkstra')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'dijkstra'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              Dijkstra & Scoring
            </button>

            <button
              onClick={() => setActiveTab('artifacts')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'artifacts'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileCode2 className="w-3.5 h-3.5" />
              NS-3 C++ & Viva Suite
            </button>

            <button
              onClick={() => setShowVercelModal(true)}
              className="ml-1 px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-900/30 text-xs"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse"></span>
              Deploy to Vercel
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-8 space-y-6">
        {/* KPI Metrics Dashboard Always Visible at the Top */}
        <MetricsDashboard state={simState} nodes={nodes} />

        {/* Tab 1: Live Interactive Topology & Control Deck */}
        {activeTab === 'topology' && (
          <div className="space-y-6">
            <NetworkTopologyView
              nodes={nodes}
              links={links}
              activeRoute={simState.activeRoute}
              activePathNodeIds={getActivePathNodeIds()}
              isSimulating={simState.isRunning}
              onToggleNodeFail={handleToggleNodeFail}
              onSelectNode={(n) => setSelectedNodeId(n.id)}
              selectedNodeId={selectedNodeId}
            />

            <ControlDeck
              state={simState}
              onApplyScenario={handleApplyScenario}
              onUpdateTrafficRate={(rate) =>
                setSimState((p) => ({ ...p, generatedTrafficMbps: rate }))
              }
              onToggleRoutingMode={() =>
                setSimState((p) => ({
                  ...p,
                  routingMode: p.routingMode === 'adaptive' ? 'conventional' : 'adaptive',
                }))
              }
              onToggleHysteresis={() =>
                setSimState((p) => ({ ...p, hysteresisEnabled: !p.hysteresisEnabled }))
              }
              onToggleSimulation={() =>
                setSimState((p) => ({ ...p, isRunning: !p.isRunning }))
              }
            />
          </div>
        )}

        {/* Tab 2: Comparative Benchmarks & Graphs */}
        {activeTab === 'benchmarks' && (
          <ComparativeBenchmarks timeSeriesData={timeSeriesData} />
        )}

        {/* Tab 3: Wireshark Packet-Level Inspector */}
        {activeTab === 'wireshark' && (
          <WiresharkInspector
            packets={packets}
            activeRoute={simState.activeRoute}
          />
        )}

        {/* Tab 4: Dijkstra & Congestion Formula Visualizer */}
        {activeTab === 'dijkstra' && (
          <AlgorithmVisualizer
            nodes={nodes}
            links={links}
            weights={weights}
            onUpdateWeights={setWeights}
            activeRoute={simState.activeRoute}
            dijkstraLogs={dijkstraLogs}
            hysteresisThresholdUp={simState.hysteresisThresholdUp}
            hysteresisThresholdDown={simState.hysteresisThresholdDown}
          />
        )}

        {/* Tab 5: Code Artifacts, NS-3 C++, WSL2 guide & Viva Defense */}
        {activeTab === 'artifacts' && <CodeArtifactsViewer />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-4 px-4 lg:px-8 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>
              Design and Implementation of a Self-Healing Adaptive Routing Mechanism for Dynamic Computer Networks
            </span>
          </div>
          <div className="font-mono text-[11px] text-slate-400">
            Topology: PC (0) ─ R1 (1) ─ R2 (2)/R3 (3) ─ R4 (4) ─ Server (5)
          </div>
        </div>
      </footer>
      {/* Deploy to Vercel Modal */}
      {showVercelModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center border border-slate-700">
                  <svg viewBox="0 0 116 100" fill="#fff" className="w-4 h-4">
                    <path d="M57.5 0L115 100H0L57.5 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Deploy to Vercel</h3>
                  <p className="text-xs text-slate-400">
                    Configuration is pre-built with <code className="text-sky-300">vercel.json</code> and static SPA rewrites.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowVercelModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-300">
              {/* Method 1: Git / GitHub (Recommended) */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Method 1: Direct GitHub / Vercel Web Import (Zero CLI Required)
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-400 leading-relaxed">
                  <li>
                    Click the <strong>Settings</strong> menu in the top right of Google AI Studio and choose <strong>"Export to GitHub"</strong> or <strong>"Download ZIP"</strong>.
                  </li>
                  <li>
                    Push the repository to your GitHub account (e.g., <code className="text-slate-200">github.com/your-username/self-healing-network</code>).
                  </li>
                  <li>
                    Go to{' '}
                    <a
                      href="https://vercel.com/new"
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-400 hover:underline inline-flex items-center gap-0.5 font-bold"
                    >
                      vercel.com/new <ExternalLink className="w-3 h-3" />
                    </a>{' '}
                    and click <strong>Import</strong> next to your repository.
                  </li>
                  <li>
                    Vercel automatically detects the framework preset as <strong>Vite</strong> with output directory <code className="text-slate-200">dist</code> and routes via <code className="text-slate-200">vercel.json</code>.
                  </li>
                  <li>
                    Click <strong>Deploy</strong>. Your site will be live on a global <code className="text-emerald-300">*.vercel.app</code> domain!
                  </li>
                </ol>
              </div>

              {/* Method 2: Vercel CLI */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="font-bold text-sky-400 flex items-center gap-1.5">
                  <Terminal className="w-4 h-4" />
                  Method 2: Command Line (Vercel CLI)
                </div>
                <p className="text-slate-400">
                  If running locally or inside terminal, deploy in seconds:
                </p>
                <pre className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-sky-300 font-mono text-[11px] overflow-x-auto">
{`# 1. Install & Login
npm i -g vercel

# 2. Deploy directly from project folder
vercel

# 3. Deploy to production domain
vercel --prod`}
                </pre>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                <span>
                  ✓ <code className="text-slate-200">vercel.json</code> is pre-configured with SPA route rewriting.
                </span>
                <span className="font-mono text-emerald-400">Build: vite build (Ready)</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowVercelModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs"
              >
                Close
              </button>
              <a
                href="https://vercel.com/new"
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-900/30"
              >
                Open Vercel Dashboard <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
