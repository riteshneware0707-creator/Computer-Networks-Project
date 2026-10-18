#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ns3_home="${NS3_HOME:-$HOME/ns-3-dev}"
scenario_name="self-healing-project-adaptive"
scenario_source="$repo_root/scratch/self-healing-verified.cc"
staged_source="$ns3_home/scratch/$scenario_name.cc"
experiment_id="${EXPERIMENT_ID:-adaptive-$(date -u +%Y%m%dT%H%M%SZ)}"
output_dir="$repo_root/simulation/results"
output_file="$output_dir/$experiment_id.json"
simulation_time="${SIMULATION_TIME_SEC:-20}"
traffic_rate="${TRAFFIC_RATE_MBPS:-8}"
primary_capacity="${PRIMARY_CAPACITY_MBPS:-2}"
alternate_capacity="${ALTERNATE_CAPACITY_MBPS:-10}"
scenario="${SIMULATION_SCENARIO:-adaptive}"
failure_time="${FAILURE_AT_SEC:-8}"
restore_time="${RESTORE_AT_SEC:-14}"
random_run="${RNG_RUN:-1}"

if [[ ! -x "$ns3_home/ns3" ]]; then
  echo "NS-3 runner not found at $ns3_home/ns3 (set NS3_HOME to your NS-3 tree)." >&2
  exit 2
fi
if [[ ! "$experiment_id" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$ ]]; then
  echo "EXPERIMENT_ID must be 1-64 alphanumeric, underscore, or hyphen characters." >&2
  exit 2
fi
for value in "$simulation_time" "$traffic_rate" "$primary_capacity" "$alternate_capacity"; do
  if [[ ! "$value" =~ ^[0-9]+([.][0-9]+)?$ ]] || ! awk -v value="$value" 'BEGIN { exit !(value > 0) }'; then
    echo "Simulation parameters must be positive numbers." >&2
    exit 2
  fi
done
case "$scenario" in
  normal|congestion|failure|recovery|adaptive) ;;
  *) echo "SIMULATION_SCENARIO must be normal, congestion, failure, recovery, or adaptive." >&2; exit 2 ;;
esac
if awk -v value="$simulation_time" 'BEGIN { exit !(value > 2) }'; then :; else
  echo "SIMULATION_TIME_SEC must be greater than 2 seconds." >&2
  exit 2
fi
if [[ -e "$output_file" ]]; then
  echo "Refusing to overwrite existing experiment result: $output_file" >&2
  exit 2
fi

mkdir -p "$ns3_home/scratch" "$output_dir"
if [[ -e "$staged_source" ]]; then
  if ! cmp -s "$scenario_source" "$staged_source"; then
    echo "Refusing to replace a different NS-3 scratch file: $staged_source" >&2
    exit 2
  fi
else
  cp "$scenario_source" "$staged_source"
fi

cd "$ns3_home"
./ns3 run "scratch/$scenario_name" -- \
  --simulationTime="$simulation_time" \
  --trafficRateMbps="$traffic_rate" \
  --primaryCapacityMbps="$primary_capacity" \
  --alternateCapacityMbps="$alternate_capacity" \
  --scenario="$scenario" \
  --failureAtSec="$failure_time" \
  --restoreAtSec="$restore_time" \
  --randomRun="$random_run" \
  --outputPath="$output_file"

echo "Result: $output_file"
