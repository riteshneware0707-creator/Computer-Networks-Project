# NS-3 experiments

`results/` contains the existing experiment JSON copied from the project's WSL
NS-3 workspace. They are legacy outputs with different field coverage; the
backend normalizes reported measurements and leaves unreported values empty.
The `verified.json` and `static_switch.json` records both report no alternate
path traffic. Their route decisions are not evidence of forwarding.

## Run an NS-3 scenario in WSL

From the project root in WSL:

```bash
bash simulation/run_ns3.sh
```

The default scenario is `adaptive`. The script uses `$HOME/ns-3-dev` unless
`NS3_HOME` is set. It stages the checked-in scenario under a unique filename and
refuses to overwrite a different source file or existing result. The result is
written under `simulation/results/` in the project. Select one of these scenarios:

| Scenario | Behavior |
| --- | --- |
| `normal` | Baseline traffic over the primary route without an injected event. |
| `congestion` | Primary-route congestion without adaptive route application. |
| `failure` | Fail the primary path and observe alternate-path forwarding. |
| `recovery` | Fail the primary path, then restore it and observe return traffic. |
| `adaptive` | Apply an alternate route when the primary queue crosses its threshold. |

Configurable environment values are:

```bash
SIMULATION_SCENARIO=adaptive \
EXPERIMENT_ID=adaptive-run-01 \
SIMULATION_TIME_SEC=20 \
TRAFFIC_RATE_MBPS=8 \
PRIMARY_CAPACITY_MBPS=2 \
ALTERNATE_CAPACITY_MBPS=10 \
bash simulation/run_ns3.sh
```

In `adaptive`, the scenario applies an explicit `/32` static host route at R1 when
its queue threshold is crossed. Its forwarding-verification flag requires route
application and packet counters after the switch on both R1-R3 and R3-R4. A
successful result must be confirmed from its generated JSON, not inferred from a
route label. For `failure` and `recovery`, `FAILURE_AT_SEC` sets the failure time;
`RESTORE_AT_SEC` sets the recovery time. `RNG_RUN` selects the NS-3 random run.

The legacy `failure.json` contains measured failover-related fields from a
separate experiment; do not combine it with the adaptive-congestion result.

## Generate training runs

From WSL, run `bash simulation/run_training_batch.sh` to generate 12 varied runs
with explicit controlled labels. The script saves a label manifest and CSV under
`ml/datasets/`; those generated datasets are ignored by Git. Train the model from
the project root with `python ml/train_model.py --dataset <generated-csv>`.
The resulting model and evaluation report are local artifacts. This small
controlled batch is a smoke test, not evidence of generalization.
