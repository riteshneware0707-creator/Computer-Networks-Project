import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, ServerOff } from 'lucide-react';
import {
  analyzeExperiment,
  ControllerAnalysis,
  Experiment,
  getExperiments,
  getEvents,
  getHealth,
  NetworkEvent,
} from '../services/api';

type ConnectionState = 'loading' | 'online' | 'offline';

function show(value: number | null | undefined, suffix = ''): string {
  return value === null || value === undefined ? 'Not reported' : `${value.toFixed(2)}${suffix}`;
}

export function ExperimentPanel() {
  const [connection, setConnection] = useState<ConnectionState>('loading');
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [events, setEvents] = useState<NetworkEvent[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [analysis, setAnalysis] = useState<ControllerAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const selectedExperiment = useMemo(
    () => experiments.find((experiment) => experiment.id === selectedId) ?? null,
    [experiments, selectedId]
  );

  useEffect(() => {
    let activeController: AbortController | null = null;
    const refresh = () => {
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      Promise.all([getHealth(controller.signal), getExperiments(controller.signal), getEvents(controller.signal)])
        .then(([health, response, eventResponse]) => {
          setConnection('online');
          setExperiments(response.experiments);
          setEvents(eventResponse.events);
          setSelectedId((current) => {
            if (current && response.experiments.some((item) => item.id === current)) return current;
            return response.experiments[0]?.id ?? '';
          });
          setError(
            health.experiments_available === response.experiments.length
              ? ''
              : 'The API experiment count does not match its returned experiment list.'
          );
        })
        .catch((requestError: unknown) => {
          if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
          setConnection('offline');
          setError(requestError instanceof Error ? requestError.message : 'Unable to load experiment data.');
        });
    };

    refresh();
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      window.clearInterval(interval);
      activeController?.abort();
    };
  }, []);

  useEffect(() => {
    setAnalysis(null);
  }, [selectedId]);

  const handleAnalyze = async () => {
    if (!selectedId) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    try {
      setAnalysis(await analyzeExperiment(selectedId, controller.signal));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Controller analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Recorded NS-3 results
          </p>
          <h2 className="mt-1 text-lg font-bold text-white">Experiment analysis</h2>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
            connection === 'online'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : connection === 'offline'
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
              : 'border-slate-700 bg-slate-800 text-slate-300'
          }`}
        >
          {connection === 'online' ? <CheckCircle2 size={13} /> : <ServerOff size={13} />}
          {connection === 'online' ? 'API connected' : connection === 'offline' ? 'API offline' : 'Connecting'}
        </span>
      </div>

      {error && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {connection === 'offline' && (
        <p className="mt-3 text-sm text-slate-300">
          Backend metrics and experiment analysis are unavailable. The interactive browser controls and values
          below are demo-only, not NS-3 measurements.
        </p>
      )}

      {connection === 'online' && (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="min-w-[220px] flex-1 text-xs font-medium text-slate-300">
              Imported experiment
              <select
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
              >
                <option value="">Select an experiment</option>
                {experiments.map((experiment) => (
                  <option key={experiment.id} value={experiment.id}>
                    {experiment.scenario} · {experiment.id}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={!selectedId || loading}
              className="inline-flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
              {loading ? 'Analyzing' : 'Analyze'}
            </button>
          </div>

          {!experiments.length && (
            <p className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
              No experiment JSON files are available. Run an NS-3 scenario or set
              {' '}<code>NETWORK_RESULTS_DIR</code> to its results directory.
            </p>
          )}

          {selectedExperiment && (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-300">
                  Measured values
                </h3>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-slate-400">Packet loss</dt>
                  <dd className="text-right text-slate-100">{show(selectedExperiment.metrics.packet_loss_pct, '%')}</dd>
                  <dt className="text-slate-400">Average delay</dt>
                  <dd className="text-right text-slate-100">{show(selectedExperiment.metrics.average_delay_ms, ' ms')}</dd>
                  <dt className="text-slate-400">Throughput</dt>
                  <dd className="text-right text-slate-100">{show(selectedExperiment.metrics.throughput_mbps, ' Mbps')}</dd>
                  <dt className="text-slate-400">Max queue</dt>
                  <dd className="text-right text-slate-100">
                    {selectedExperiment.metrics.queue_packets_max ?? 'Not reported'} packets
                  </dd>
                  <dt className="text-slate-400">Route application attempted</dt>
                  <dd className="text-right text-slate-100">
                    {selectedExperiment.routing.route_application_attempted === null
                      ? 'Not reported'
                      : selectedExperiment.routing.route_application_attempted
                      ? 'Yes'
                      : 'No'}
                  </dd>
                  <dt className="text-slate-400">Alternate forwarding verified</dt>
                  <dd className="text-right text-slate-100">
                    {selectedExperiment.routing.forwarding_verified === null
                      ? 'Not established'
                      : selectedExperiment.routing.forwarding_verified
                      ? 'Yes'
                      : 'No'}
                  </dd>
                </dl>
                <p className="mt-3 text-[11px] text-slate-500">
                  Source: {selectedExperiment.source_file} · Imported file update time:{' '}
                  {new Date(selectedExperiment.updated_at).toLocaleString()}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-300">
                  Controller recommendation
                </h3>
                {analysis ? (
                  <>
                    <p className="mt-3 text-sm text-slate-100">
                      Selected: <strong className="text-sky-300">{analysis.selected_route ?? 'No feasible route'}</strong>
                    </p>
                    <p className="mt-2 text-xs leading-5 text-slate-300">{analysis.reason}</p>
                    <p className="mt-2 text-xs text-slate-400">
                      ML: {analysis.network_state_prediction ?? `not available (${analysis.model_status})`}
                      {analysis.prediction_confidence !== null &&
                        ` · confidence ${(analysis.prediction_confidence * 100).toFixed(1)}%`}
                    </p>
                    {analysis.class_probabilities && (
                      <p className="mt-1 text-xs text-slate-400">
                        Class probabilities:{' '}
                        {Object.entries<number>(analysis.class_probabilities)
                          .map(([label, probability]) => `${label} ${(probability * 100).toFixed(1)}%`)
                          .join(' · ')}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-400">
                      Application attempted: {analysis.route_application_attempted ? 'yes' : 'no'} · Forwarding
                      verified: {analysis.forwarding_verified ? 'yes' : 'no'}
                    </p>
                    <ul className="mt-2 space-y-1 text-xs text-amber-200">
                      {analysis.warnings.map((warning) => <li key={warning}>• {warning}</li>)}
                    </ul>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-slate-400">
                    Analysis produces a recommendation only; it does not modify NS-3 routing.
                  </p>
                )}
              </div>
            </div>
          )}
          {!!events.length && (
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-300">
                Recorded event log
              </h3>
              <ul className="mt-3 space-y-2">
                {events.slice(0, 6).map((event) => (
                  <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs">
                    <span className="text-slate-200">{event.message}</span>
                    <span className="font-mono text-slate-500">
                      {event.experiment_id}
                      {event.simulation_time_sec !== null && ` · sim ${event.simulation_time_sec.toFixed(3)}s`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
