# Innovative Approach to a Self-Healing Adaptive Network

This repository now contains the original React dashboard, an NS-3 experiment
runner for WSL2, a validating FastAPI service, a Dijkstra route recommender, and
a run-isolated scikit-learn training/evaluation pipeline.

## What is and is not simulated

The interactive controls and animated network at the top of the dashboard remain
a **browser-only demonstration**. Their displayed values are illustrative; they
do not run NS-3 and do not verify packet forwarding. The **Recorded NS-3 results**
panel loads the actual JSON files from the backend and displays route application
and packet-counter evidence independently.

The current adaptive NS-3 scenario applies a `/32` static host route at R1 and
observes the R1-R3 and R3-R4 transmit counters after the switch. A recorded switch
decision, an attempted route installation, and verified packet forwarding are
separate fields. The backend never turns a recommendation into forwarding proof.

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

## Run NS-3 in WSL2

NS-3 runs locally in WSL, not in Vercel. With the repo mounted under `/mnt/c` and
NS-3 installed at `$HOME/ns-3-dev`:

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

The route-application experiment was built and run against the available WSL NS-3
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

The controller endpoint returns a route recommendation and computed costs. It
does not change an already completed NS-3 run; `route_application_attempted` and
`forwarding_verified` reflect recorded evidence only.

## Validation

```powershell
npm run build
npm run lint
python -m unittest discover -s backend\tests -v
```

See [`docs/methodology.md`](./docs/methodology.md) for metric definitions,
controlled labels, and current limitations. Experiment inputs are described by
[`simulation/schema.json`](./simulation/schema.json).
