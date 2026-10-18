# ML training input

The classifier consumes CSV rows produced by distinct, controlled NS-3 runs. Use
`python ml/build_dataset.py --labels path/to/labels.json` to combine the measured
JSON results with explicit scenario labels. `labels.json` maps unique result filename
stems to labels, for example `{"normal-run-01":"normal"}`. Do not label results by
applying the same threshold rule used by the baseline. Required
columns are `run_id`, `label`, `packet_loss_pct`, `average_delay_ms`,
`queue_packets_max`, `link_utilization_pct`, `throughput_mbps`, and
`primary_link_available` (0 or 1). Each class must be represented by at least two
different run IDs; the trainer uses a group-isolated split and reports its sample and
run counts. The labels are controlled scenario labels, so the report explicitly
does not present them as independent diagnosis ground truth.

Run `python ml/train_model.py --dataset path/to/runs.csv` after generating the CSV
from measurements. The model and its metrics are written under `ml/models/` and are
ignored by Git. Training fails rather than inventing rows or reporting a score when
the required run-isolated evaluation cannot be made.
