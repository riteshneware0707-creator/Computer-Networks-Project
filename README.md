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

## Install the application dependencies

From the repository root, in PowerShell:

```powershell
npm install
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements-dev.txt
Copy-Item .env.example .env
```

The backend reads `simulation/results/` by default. Set `NETWORK_RESULTS_DIR`
and `NETWORK_MODEL_PATH` in the backend environment to override those paths.

Frontend API configuration is in `.env` as `VITE_API_BASE_URL`. A public Vercel
deployment cannot reach a backend running on a student's laptop at `localhost`;
deploy the API at a reachable HTTPS origin and set its allowed CORS origin before
using it from Vercel.

## Run the live Containerlab demo from Windows with WSL2

Containerlab must use a **native Docker Engine on the same Linux system** where
Containerlab runs. Docker Desktop's WSL-integrated daemon is remote from Ubuntu;
Containerlab cannot join its router network namespaces. Use Ubuntu under WSL2
with systemd and its own native Docker Engine. A separate VM is not required.

### Install Ubuntu WSL2, Docker Engine, and Containerlab

In an elevated Windows PowerShell, install/update WSL2 and Ubuntu if needed:

```powershell
wsl --update
wsl --install -d Ubuntu
```

In Ubuntu, enable systemd by creating `/etc/wsl.conf` with:

```bash
sudo tee /etc/wsl.conf >/dev/null <<'EOF'
[boot]
systemd=true
EOF
```

Then, in Windows PowerShell, restart WSL:

```powershell
wsl --shutdown
```

Reopen Ubuntu and install Docker Engine and Containerlab. This configuration
gives native Docker its own socket so it does not collide with Docker Desktop:

```bash
sudo apt update
sudo apt install -y docker.io iptables curl
sudo mkdir -p /etc/systemd/system/docker.service.d
sudo tee /etc/systemd/system/docker.service.d/override.conf >/dev/null <<'EOF'
[Unit]
Requires=

[Service]
ExecStart=
ExecStart=/usr/bin/dockerd --host=unix:///run/docker-native.sock --group=docker --containerd=/run/containerd/containerd.sock
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now docker
sudo systemctl restart docker
sudo docker -H unix:///run/docker-native.sock run --rm hello-world
sudo docker -H unix:///run/docker-native.sock info --format '{{.OperatingSystem}}'
curl -sL https://containerlab.dev/setup | sudo -E bash -s "install-containerlab"
containerlab version
```

Confirm Docker reports Ubuntu, not Docker Desktop. The backend calls WSL as root
and selects `/run/docker-native.sock` explicitly. On the first deploy it copies
the current `emulation` files from the Windows checkout to Linux-native storage
at `/opt/self-healing-network/emulation`; this avoids Containerlab output-file
problems on OneDrive/`/mnt/c`. Override the runtime directory, WSL distro, or
Docker socket with `NETWORK_WSL_RUNTIME_DIR`, `NETWORK_WSL_DISTRO`, or
`NETWORK_WSL_DOCKER_HOST` in the backend environment if needed.

### Start the backend and dashboard

In PowerShell, from the Windows repository root, start the backend:

```powershell
.\.venv\Scripts\Activate.ps1
npm run backend:dev
```

Open a second PowerShell in the repository root and run:

```powershell
npm run dev
```

Open <http://localhost:3000>. In the live panel, click **Deploy live network**.
Then click **Inject congestion** to see measured delay trigger an OSPF cost
change and traffic move to R1-R3-R4. Use **Restore primary**, then **Fail primary
link** to disable the primary interfaces and observe OSPF reconvergence. Restore
the primary and click **Stop lab** when finished. Deploy once before presentation
day to pull images and rehearse the complete sequence. Check
<http://127.0.0.1:8000/api/health> from Windows before the demo.

The routers are Linux containers with FRR, not physical routers. This is live
network emulation, not a physical hardware deployment. Keep the live-control API
on a trusted local/private network; do not expose it publicly.

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

The live endpoint runs real Containerlab/FRR commands on the backend host and
reports observed route and traffic measurements. On Windows, the backend
requires WSL2 Ubuntu with a native Docker Engine; Docker Desktop's remote daemon
is unsupported.

## Validation

```powershell
npm run build
npm run lint
python -m unittest discover -s backend\tests -v
```

See [`docs/methodology.md`](./docs/methodology.md) for metric definitions,
controlled labels, and current limitations. Experiment inputs are described by
[`simulation/schema.json`](./simulation/schema.json).
