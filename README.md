# Self-Healing Adaptive Network

The primary classroom demonstration is a live, container-based network lab built
with Containerlab and FRRouting (FRR). The lab runs Linux router containers,
exchanges OSPF routes, forwards real IP traffic, and exposes measured route and
traffic evidence in the dashboard. The repository also retains the earlier NS-3
experiments as historical simulation results; they are not the live lab.

## What is and is not live

- **Live Containerlab panel:** buttons deploy the lab, introduce a measured
  congestion condition, fail and restore the primary link, and report the
  selected route, ping/iperf3 measurements, and router interface counters.
- **Browser demonstration:** the older animated topology and its controls are
  illustrative UI state. They do not change the Containerlab routes or prove
  packet forwarding.
- **Recorded NS-3 results:** the experiment panel is retained for inspecting
  older JSON measurements. Those files are not live Containerlab telemetry.

The congestion action applies Linux `netem` delay to the primary link, measures
the resulting delay, and then raises the OSPF cost when the configured threshold
is crossed. The failure action disables the primary interfaces and lets OSPF
reconverge over the alternate path. In both cases, the live panel checks the
actual route installed in R1 and verifies end-to-end traffic with ping; throughput
is measured with iperf3.

## Windows setup

From the repository root, in PowerShell:

```powershell
npm install
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements-dev.txt
Copy-Item .env.example .env
npm run backend:dev
```

In a second terminal:

```powershell
cd "C:\path\to\CN"
npm run dev
```

Open <http://localhost:3000>. The API runs at <http://127.0.0.1:8000>; its
interactive documentation is at <http://127.0.0.1:8000/docs>. The backend reads
`simulation/results/` by default. Set `NETWORK_RESULTS_DIR` and `NETWORK_MODEL_PATH`
in the backend environment to override those paths.

Frontend API configuration is in `.env` as `VITE_API_BASE_URL`. A public Vercel
deployment cannot reach a backend running on a student's laptop at `localhost`;
deploy the API at a reachable HTTPS origin and set its allowed CORS origin before
using it from Vercel.

## Run the live Containerlab demo on Windows

The local demo uses Docker Desktop with its WSL2 integration enabled, plus
Containerlab installed in the Ubuntu WSL distribution. Containerlab requires
Linux and Docker; follow the current installation instructions at
<https://containerlab.dev/install/>. The FRR image used by the topology is the
Containerlab-native `quay.io/frrouting/frr:containerlab-10.7.1`.

1. Install Docker Desktop and enable WSL integration for the Ubuntu distribution.
   Start Docker Desktop before the demo.
2. In Ubuntu WSL, install Containerlab using its official instructions, then
   verify `docker version` and `containerlab version` work in that distribution.
3. In PowerShell, start the existing FastAPI backend and Vite frontend as
   described above. The live backend calls the default WSL distribution named
   `Ubuntu`; set `NETWORK_WSL_DISTRO` to the actual distribution name if yours
   differs.
4. Open <http://localhost:3000>, then click **Deploy live network** in the
   Containerlab panel. The first deployment builds the traffic-host image and
   downloads the FRR image, so do this once before presentation day while
   internet access is available.
5. Run a short ping or iperf check by using the panel status. Click **Inject
   congestion** to see the measured delay trigger an OSPF cost change and traffic
   move to R1-R3-R4. Click **Restore primary** to clear impairments.
6. Click **Fail primary link** to disable the R1-R2 link. OSPF withdraws that
   path, R1 selects R1-R3-R4, and the panel checks that ping still reaches the
   server. Click **Restore primary** to recover.
7. Click **Stop lab** when finished.

The API starts the WSL demo runner as root so Containerlab can manage the
container lab. Keep the backend bound to localhost as configured; do not expose
the live-control API to a public network. The running routers are Linux containers
with FRR, not physical routers. This is a live network emulation, not a physical
hardware deployment.

## Historical NS-3 experiments (optional)

The earlier NS-3 runner and results remain available for reproducibility, but
they are not required for the live classroom demo. NS-3 runs locally in WSL, not
in Vercel. With the repo mounted under `/mnt/c` and NS-3 installed at
`$HOME/ns-3-dev`:

```bash
cd /mnt/c/path/to/CN
bash simulation/run_ns3.sh
```

The runner stages `scratch/self-healing-verified.cc` into a unique filename in the
NS-3 scratch tree. It refuses to overwrite a conflicting staged source or an
existing result. Supported parameters:

```bash
SIMULATION_SCENARIO=adaptive \
EXPERIMENT_ID=adaptive-run-01 \
SIMULATION_TIME_SEC=20 \
TRAFFIC_RATE_MBPS=8 \
PRIMARY_CAPACITY_MBPS=2 \
ALTERNATE_CAPACITY_MBPS=10 \
bash simulation/run_ns3.sh
```

`SIMULATION_SCENARIO` accepts `normal`, `congestion`, `failure`, `recovery`, and
`adaptive`. For a normal-load run, set the offered traffic below primary capacity
(for example `TRAFFIC_RATE_MBPS=1`). `failure` takes the primary interface down
at `FAILURE_AT_SEC` and applies the alternate host route. `recovery` additionally
restores the primary interface at `RESTORE_AT_SEC`. Results are separate JSON files
in `simulation/results/`; choose a new `EXPERIMENT_ID` for every run.

The earlier route-application experiment was built and run against a WSL NS-3
tree. One recorded adaptive run used 8 Mbps offered load, 2 Mbps primary links,
10 Mbps alternate links, and 20 seconds of simulation. Its result file reports
17,096 packets on each alternate link after the route was applied, with the first
alternate-link transmission at 1.5004 simulation seconds. See
[`simulation/results/adaptive-validation-current-20261018.json`](./simulation/results/adaptive-validation-current-20261018.json)
for all measured counters. This is evidence for that run only, not a generalized
performance claim. A recovery run also recorded alternate-path traffic following
an 8-second failure and primary-path traffic returning at 14.0038 seconds after
the 14-second restoration:
[`simulation/results/recovery-validation-20261018.json`](./simulation/results/recovery-validation-20261018.json).

## Build the ML dataset and model

Run the reproducible batch in WSL to create 12 varied runs (three runs for each
controlled scenario label):

```bash
bash simulation/run_training_batch.sh
```

This writes measured NS-3 JSON results and a run-ID-to-label manifest/CSV under
`ml/datasets/`. The generated dataset files are ignored by Git. The labels identify
the controlled scenario configuration; they are not independent ground truth.

On Windows, use the CSV path printed by the script:

```powershell
python ml\train_model.py --dataset ml\datasets\network-runs-<timestamp>.csv
```

The Random Forest and metrics report are saved under `ml/models/` and intentionally
ignored by Git. The splitter keeps each `run_id` entirely in train or test. At
least two independent runs per class are required. Existing local evaluation used
8 training runs and 4 held-out runs; the Random Forest scored 1.00 accuracy and the
threshold baseline scored 0.75 on that four-run test set. This small controlled
sample is only a pipeline smoke test and is not evidence of generalization. Retrain
with more varied runs before making accuracy claims.

## API

- `GET /api/health`
- `GET /api/topology`
- `GET /api/metrics/latest`
- `GET /api/experiments`
- `GET /api/experiments/{id}`
- `POST /api/controller/analyze` with `{"experiment_id":"..."}`
- `GET /api/routes/current`
- `GET /api/events`

The recorded-experiment controller endpoint returns a route recommendation and
computed costs; it does not change an already completed run. The live lab is
controlled by separate endpoints:

- `GET /api/live/status`
- `POST /api/live/action` with one action, for example `{"action":"congestion"}`.
  Supported actions are `deploy`, `congestion`, `failure`, `reset`, and `destroy`.

The live endpoint runs real Containerlab/FRR commands through WSL and reports
observed route and traffic measurements. It is available only on the local demo
machine with Docker Desktop and Containerlab installed.

## Validation

```powershell
npm run build
npm run lint
python -m unittest discover -s backend\tests -v
```

See [`docs/methodology.md`](./docs/methodology.md) for metric definitions,
controlled labels, and current limitations. Experiment inputs are described by
[`simulation/schema.json`](./simulation/schema.json).
