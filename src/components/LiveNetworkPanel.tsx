import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, LoaderCircle, Play, RotateCcw, ServerOff, Square, Wifi } from 'lucide-react';
import {
  getLiveLabStatus,
  LiveLabAction,
  LiveLabStatus,
  runLiveLabAction,
} from '../services/api';

function metric(value: number | null, suffix = ''): string {
  return value === null ? '—' : `${value.toFixed(2)}${suffix}`;
}

export function LiveNetworkPanel() {
  const [status, setStatus] = useState<LiveLabStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setStatus(await getLiveLabStatus());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to read live lab status.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const perform = async (action: LiveLabAction) => {
    setBusy(true);
    setError('');
    try {
      setStatus(await runLiveLabAction(action));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Live network action failed.');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const running = status?.running === true;

  return (
    <section className="rounded-2xl border border-sky-700/50 bg-slate-900/90 p-4 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Live Containerlab + FRRouting
          </p>
          <h2 className="mt-1 text-lg font-bold text-white">Real packet-forwarding demonstration</h2>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
          running
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            : 'border-slate-700 bg-slate-800 text-slate-300'
        }`}>
          {running ? <CheckCircle2 size={13} /> : <ServerOff size={13} />}
          {running ? 'Routers running' : status?.available === false ? 'Runtime unavailable' : 'Lab stopped'}
        </span>
      </div>

      {(error || status?.event) && (
        <div role={error ? 'alert' : 'status'} className={`mt-3 flex items-start gap-2 rounded-lg border p-3 text-sm ${
          error
            ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
            : 'border-sky-500/30 bg-sky-500/10 text-sky-100'
        }`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error || status?.event}</span>
        </div>
      )}

      {!running && (
        <p className="mt-3 text-sm text-slate-300">
          Start the Docker Desktop engine and install Containerlab in WSL2 Ubuntu, then deploy the lab here.
          The browser-only controls below are not a substitute for this live network.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {!running ? (
          <button type="button" onClick={() => void perform('deploy')} disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50">
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Deploy live network
          </button>
        ) : (
          <>
            <button type="button" onClick={() => void perform('congestion')} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/20 disabled:opacity-50">
              <Activity className="h-4 w-4" /> Inject congestion
            </button>
            <button type="button" onClick={() => void perform('failure')} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-500/20 disabled:opacity-50">
              <Wifi className="h-4 w-4" /> Fail primary link
            </button>
            <button type="button" onClick={() => void perform('reset')} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50">
              <RotateCcw className="h-4 w-4" /> Restore primary
            </button>
            <button type="button" onClick={() => void perform('destroy')} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50">
              <Square className="h-4 w-4" /> Stop lab
            </button>
          </>
        )}
      </div>

      {running && status && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
              <p className="text-xs text-slate-400">Observed OSPF path</p>
              <p className="mt-1 font-semibold text-sky-200">{status.selected_route ?? 'Unknown'}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
              <p className="text-xs text-slate-400">Primary-link probe</p>
              <p className="mt-1 font-mono text-slate-100">{metric(status.primary_link_delay_ms, ' ms')}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
              <p className="text-xs text-slate-400">End-to-end loss</p>
              <p className="mt-1 font-mono text-slate-100">{metric(status.packet_loss_pct, '%')}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
              <p className="text-xs text-slate-400">iperf3 throughput</p>
              <p className="mt-1 font-mono text-slate-100">{metric(status.throughput_mbps, ' Mbps')}</p>
            </div>
          </div>
          <p className={`mt-3 text-xs font-semibold ${status.forwarding_verified ? 'text-emerald-300' : 'text-amber-200'}`}>
            {status.forwarding_verified
              ? `Live forwarding verified by route lookup and successful host-to-server ping. State: ${status.network_state}.`
              : `Forwarding is not yet verified. Current state: ${status.network_state}.`}
            {' '}R1 tx packet deltas during probes — primary: {status.primary_tx_packets ?? '—'}, alternate: {status.alternate_tx_packets ?? '—'}.
          </p>
        </>
      )}
    </section>
  );
}
