#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dataset_dir="$repo_root/ml/datasets"
labels_file="$dataset_dir/training-labels-$stamp.json"
dataset_file="$dataset_dir/network-runs-$stamp.csv"
mkdir -p "$dataset_dir"
pairs=()

run_one() {
  local run_id="$1"
  local label="$2"
  local scenario="$3"
  local traffic="$4"
  local primary="$5"
  local alternate="$6"
  local replicate="$7"
  local run_log="$dataset_dir/$run_id.log"
  if ! EXPERIMENT_ID="$run_id" \
    SIMULATION_SCENARIO="$scenario" \
    TRAFFIC_RATE_MBPS="$traffic" \
    PRIMARY_CAPACITY_MBPS="$primary" \
    ALTERNATE_CAPACITY_MBPS="$alternate" \
    RNG_RUN="$replicate" \
      bash "$repo_root/simulation/run_ns3.sh" >"$run_log" 2>&1; then
    tail -n 80 "$run_log" >&2
    rm -f "$run_log"
    return 1
  fi
  rm -f "$run_log"
  pairs+=("$run_id:$label")
}

run_one "training-$stamp-normal-1" "normal" "normal" "1.0" "2.0" "10.0" "1"
run_one "training-$stamp-normal-2" "normal" "normal" "1.2" "2.5" "10.0" "2"
run_one "training-$stamp-normal-3" "normal" "normal" "0.8" "1.8" "8.0" "3"
run_one "training-$stamp-congested-1" "congested" "congestion" "3.0" "2.0" "10.0" "1"
run_one "training-$stamp-congested-2" "congested" "congestion" "3.5" "2.5" "8.0" "2"
run_one "training-$stamp-congested-3" "congested" "congestion" "2.8" "1.8" "12.0" "3"
run_one "training-$stamp-severe-1" "severely_congested" "congestion" "8.0" "2.0" "10.0" "1"
run_one "training-$stamp-severe-2" "severely_congested" "congestion" "9.0" "2.5" "8.0" "2"
run_one "training-$stamp-severe-3" "severely_congested" "congestion" "8.0" "1.5" "12.0" "3"
run_one "training-$stamp-failure-1" "link_failure" "failure" "1.8" "2.0" "10.0" "1"
run_one "training-$stamp-failure-2" "link_failure" "failure" "2.2" "2.5" "8.0" "2"
run_one "training-$stamp-failure-3" "link_failure" "failure" "1.5" "1.8" "12.0" "3"

python3 -c 'import json,sys; pairs=sys.argv[2:]; labels={run_id:label for run_id,label in (pair.rsplit(":",1) for pair in pairs)}; open(sys.argv[1],"w",encoding="utf-8").write(json.dumps(labels,indent=2)+"\n")' \
  "$labels_file" "${pairs[@]}"
python3 "$repo_root/ml/build_dataset.py" \
  --results "$repo_root/simulation/results" \
  --labels "$labels_file" \
  --output "$dataset_file"

echo "Run-isolated training data ready: $dataset_file"
echo "Fit/evaluate on Windows with: python ml/train_model.py --dataset ml/datasets/$(basename "$dataset_file")"
