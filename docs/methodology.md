# Architecture, methodology, and viva notes

## Live Containerlab/FRR demo

The classroom demonstration runs six Linux containers under Containerlab:
`PC—R1—R2—R4—Server`, with `R1—R3—R4` as the alternate path. R1–R4 run FRRouting
and OSPF; the PC and server use Linux networking, ping, and iperf3. The FastAPI
service invokes the local WSL2 lab runner, and the React live panel shows current
measurements and route evidence.

The congestion action adds `netem` delay to both ends of the primary R1-R2 link,
measures the delay with a ping probe, and raises OSPF interface costs when the
measurement exceeds 50 ms. OSPF then selects the lower-cost alternate path. The
failure action administratively disables the primary interfaces and relies on
OSPF to withdraw the route and reconverge. Recovery removes the impairment,
restores the interfaces, and returns their configured OSPF costs to baseline.

The panel reads R1's actual kernel route to the server, runs end-to-end ping and
iperf3, and reads R1's primary/alternate interface transmit counters. A route
lookup by itself is not forwarding proof; the panel only marks forwarding verified
when the route is known and host-to-server ping succeeds.

For each route-changing action, the runner starts continuous host-to-server ping
probes before applying the change, times until R1's kernel route uses the expected
interface, and then reports packet loss from the probe summary. Deploy records
baseline ping loss, average RTT, and iperf3 throughput. Action measurements are
appended as timestamped JSON Lines in the Linux-native runtime directory at
`emulation/results/live-demo-evidence.jsonl`. Convergence timing is the observed
route-change interval, not a claim of universal OSPF convergence performance;
packet loss is based on the finite probes during that transition. Repeated trials
are required for comparisons. Router-to-router interfaces use OSPF point-to-point
network type, since each emulated link has exactly two endpoints; this avoids the
default broadcast DR/BDR election wait when restoring a link. A redeploy cleans
Containerlab's generated lab directory first so old generated router configs
cannot silently override the current source configuration. The emulated
point-to-point links use 1-second Hello and 4-second Dead intervals to make
recovery observable promptly; these lab-specific timers should not be generalized
to production networks.

Containerlab and FRR require Linux and a Docker Engine running on that same Linux
host. Docker Desktop's WSL integration exposes a remote daemon whose container
network namespaces are not joinable from Ubuntu WSL; the live runner detects and
rejects that runtime. On Windows, the backend uses Ubuntu WSL2 with systemd and
a native Docker Engine on a dedicated socket. Before each action it stages the
current lab files into Linux-native WSL storage, because Containerlab cannot
reliably write its topology inventory under a Windows-mounted OneDrive path.
This is live container-based network emulation, not physical router hardware.

## Historical NS-3 data path

1. NS-3 previously executed a predefined topology and wrote one result JSON per run.
2. The FastAPI service validates files against `simulation/schema.json`, then
   normalizes fields from both the older experiment output and the current schema.
   Missing measurements remain `null`; the service does not fill them with demo
   values.
3. The Python controller extracts measured features. If a compatible trained
   model and all required features are present, it returns Random Forest prediction
   probabilities. Otherwise it reports why no prediction is available and uses
   transparent thresholds for a separate route recommendation.
4. Dijkstra computes a least-cost route over the configured graph. Configured link
   delays provide base costs; measured loss, delay, queue, utilization, and the
   state penalty adjust primary-path cost. A confirmed unavailable primary path is
   removed from the feasible graph. Weights are environment-configurable.
5. The recorded-experiment UI reads those historical API results. The separate
   browser controls remain an illustrative demo and are not used as measured data.

The classifier predicts a network state; Dijkstra selects a path. Neither
prediction nor route selection means that a route was installed or that packets
used it.

## Topology and forwarding proof

The NS-3 topology is `PC—R1—R2—R4—Server` with the alternate `R1—R3—R4` path.
The congestion experiment configures each primary link at 2 Mbps, each alternate
link at 10 Mbps, 8 Mbps offered traffic, and 20 seconds by default.

The adaptive scenario installs a destination-specific static host route at R1 when
the observed R1-R2 queue reaches the threshold. The explicit next hop and outgoing
interface change at run time; a routing decision message alone is not used as
proof. R1-R3 and R3-R4 `MacTx` counters increment only for traffic observed after
the route switch. `alternateTrafficDetected` is true only when route application
was attempted and both post-switch counters are positive.

The older `verified.json` and `static_switch.json` files are intentionally retained
as historical diagnostics: both show an attempted/claimed switch with zero
alternate-path packets. They must be treated as failed forwarding experiments.

## Metric definitions

- **Packet loss**: FlowMonitor lost packet count divided by transmitted packet
  count, in percent. Older outputs sometimes report a conflicting percentage; the
  backend preserves that reported value rather than silently reconciling it.
- **Average delay**: FlowMonitor sum of received-packet delays divided by received
  packet count.
- **Throughput**: received FlowMonitor bytes multiplied by eight, divided by the
  full simulation duration. This is a simulation-wide delivery rate.
- **Queue occupancy**: maximum packets observed in the traced R1-R2/R2-R4 device
  queues; the result is a maximum, not an average.
- **Link utilization**: traced R1-R2 transmit bytes times eight divided by its
  configured capacity and full simulation duration, capped at 100%.
- **Route switch time**: NS-3 simulation time when the route change is applied.
- **First alternate traffic time**: first post-application R1-R3 `MacTx` time.
  The same run also checks post-switch R1-R3 and R3-R4 counters. It is not a
  measured server receive timestamp.
- **Failure-to-alternate interval**: injected primary-link failure time to first
  alternate-link transmission. This is not failure-detection latency.
- **Restore-to-primary interval**: scheduled interface restoration time to the
  first R1-R2 transmission afterward.

Simulation timestamps are not wall-clock times. API file update timestamps refer
to when a JSON file was last written/copied, not simulation time.

## ML labels and evaluation

The training batch varies traffic and link capacities across 12 unique run IDs,
with controlled labels for normal, congestion, severe congestion, and primary-link
failure. The label manifest is explicit; labels are not derived from the classifier
thresholds. The current application traffic generator uses constant on/off random
variables, so changing NS-3 run number alone does not create stochastic variation;
the batch also varies offered load and link capacities.

The training tool requires at least two distinct run IDs per class, isolates
groups between train and test, and searches for a split containing every label in
both partitions. It reports accuracy, weighted precision/recall/F1, confusion
matrix, and sample/run counts for both Random Forest and a documented threshold
baseline. Current test data has only four held-out runs. More independent and
varied experiments are required for scientific performance claims.

## Current limitations

- The web dashboard's top-level interactive simulation remains illustrative
  browser state. Only the experiment panel displays recorded backend data.
- The current checked-in C++ scenario includes normal, fixed-congestion,
  primary-failure, failure/recovery, and adaptive modes, but the comparative
  baseline/adaptive repeated-run evaluation and plots are not yet automated.
- Model files and dataset CSVs are intentionally not versioned. On a fresh clone,
  train a model locally before expecting ML inference; the API reports unavailable
  or incomplete features rather than faking a prediction.
- The API analyzes recorded runs and does not execute NS-3 or apply a recommendation
  to an already-completed simulation.
- Vercel cannot access NS-3 or a local laptop backend. A deployed frontend needs a
  separately reachable backend and production CORS configuration.
