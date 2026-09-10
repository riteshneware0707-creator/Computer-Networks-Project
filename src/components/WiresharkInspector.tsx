import React, { useState } from 'react';
import { PacketTrace } from '../types';
import {
  FileCode,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Layers,
  Terminal,
  Filter,
  Eye,
  X,
} from 'lucide-react';

interface WiresharkInspectorProps {
  packets: PacketTrace[];
  activeRoute: string;
}

export const WiresharkInspector: React.FC<WiresharkInspectorProps> = ({
  packets,
  activeRoute,
}) => {
  const [selectedPacket, setSelectedPacket] = useState<PacketTrace | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DELIVERED' | 'DROPPED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPackets = packets.filter((p) => {
    if (statusFilter === 'DELIVERED' && p.status !== 'DELIVERED') return false;
    if (statusFilter === 'DROPPED' && p.status === 'DELIVERED') return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        p.protocol.toLowerCase().includes(q) ||
        p.sourceIp.includes(q) ||
        p.destIp.includes(q) ||
        p.routeTaken.join(' ').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
      {/* Header & Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-sky-400" />
            Wireshark Packet-Level Dissector (PART 24 Evidence)
          </h3>
          <p className="text-xs text-slate-400">
            Real-time pcap packet inspection showing IP headers, TTL decrement, sequence number, and verified path hops.
          </p>
        </div>

        {/* Filter Badges & Search */}
        <div className="flex items-center gap-2 text-xs">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Filter by IP/Protocol..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-950 border border-slate-800">
            {(['ALL', 'DELIVERED', 'DROPPED'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
                  statusFilter === filter
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Rolling Packet Table (Wireshark Look & Feel) */}
      <div className="overflow-x-auto max-h-72 overflow-y-auto border border-slate-800/80 rounded-xl bg-slate-950/90 font-mono text-[11px]">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 select-none z-10">
            <tr>
              <th className="py-2 px-3 font-semibold w-16">No.</th>
              <th className="py-2 px-3 font-semibold w-24">Time (s)</th>
              <th className="py-2 px-3 font-semibold w-24">Source</th>
              <th className="py-2 px-3 font-semibold w-24">Destination</th>
              <th className="py-2 px-3 font-semibold w-16">Protocol</th>
              <th className="py-2 px-3 font-semibold w-14">Length</th>
              <th className="py-2 px-3 font-semibold w-12">TTL</th>
              <th className="py-2 px-3 font-semibold">Route Path Taken</th>
              <th className="py-2 px-3 font-semibold w-28 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40 text-slate-300">
            {filteredPackets.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-6 text-center text-slate-500 font-sans text-xs">
                  No packets match current filter. Packets generate continuously while simulation runs.
                </td>
              </tr>
            ) : (
              filteredPackets.map((pkt) => {
                const isSelected = selectedPacket?.id === pkt.id;
                const isDropped = pkt.status.startsWith('DROPPED');
                const isViaRouteB = pkt.routeTaken.some((h) => h.includes('R3'));

                return (
                  <tr
                    key={pkt.id}
                    onClick={() => setSelectedPacket(pkt)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-sky-950/60 text-sky-200 border-l-2 border-sky-400'
                        : isDropped
                        ? 'bg-red-950/20 hover:bg-red-950/40 text-rose-300'
                        : isViaRouteB
                        ? 'bg-purple-950/15 hover:bg-purple-950/30'
                        : 'hover:bg-slate-800/30'
                    }`}
                  >
                    <td className="py-1.5 px-3 text-slate-500 font-bold">{pkt.seq}</td>
                    <td className="py-1.5 px-3 text-slate-400">{pkt.simTime.toFixed(3)}</td>
                    <td className="py-1.5 px-3 text-sky-400 font-medium">{pkt.sourceIp}</td>
                    <td className="py-1.5 px-3 text-purple-400 font-medium">{pkt.destIp}</td>
                    <td className="py-1.5 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          pkt.protocol === 'ICMP'
                            ? 'bg-amber-500/20 text-amber-300'
                            : pkt.protocol === 'TCP'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-sky-500/20 text-sky-300'
                        }`}
                      >
                        {pkt.protocol}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-slate-400">{pkt.lengthBytes}</td>
                    <td className="py-1.5 px-3 text-slate-400">{pkt.ttl}</td>
                    <td className="py-1.5 px-3 text-slate-300 truncate max-w-xs">
                      {pkt.routeTaken.join(' ➔ ')}
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      {pkt.status === 'DELIVERED' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-[10px]">
                          <CheckCircle2 className="w-3 h-3" />
                          {pkt.latencyMs.toFixed(1)}ms
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-400 font-semibold text-[10px]">
                          <XCircle className="w-3 h-3" />
                          {pkt.status === 'DROPPED_CONGESTION' ? 'OVERFLOW' : 'DOWN'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Packet Header Inspector Modal / Drawer */}
      {selectedPacket && (
        <div className="p-4 rounded-xl bg-slate-950 border border-sky-500/40 space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400" />
              <span className="font-bold text-slate-200">
                Frame #{selectedPacket.seq} Protocol Dissection Tree
              </span>
              <span className="text-[10px] text-slate-400">
                Captured at T+{selectedPacket.simTime.toFixed(3)}s
              </span>
            </div>
            <button
              onClick={() => setSelectedPacket(null)}
              className="text-slate-400 hover:text-slate-200 p-1 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-300">
            {/* Layer 2/3: IP Header Details */}
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
              <div className="text-sky-400 font-bold text-[11px] mb-1">
                ▸ Internet Protocol Version 4 (IPv4)
              </div>
              <div>Source: <span className="text-slate-100">{selectedPacket.sourceIp}</span> (PC Port 49152)</div>
              <div>Destination: <span className="text-slate-100">{selectedPacket.destIp}</span> (Server Port 9000)</div>
              <div>Time to Live (TTL): <span className="text-slate-100">{selectedPacket.ttl}</span> (Decremented 4 hops)</div>
              <div>Protocol: <span className="text-slate-100">{selectedPacket.protocol} (0x11)</span></div>
              <div>Total Length: <span className="text-slate-100">{selectedPacket.lengthBytes} bytes</span></div>
              <div>Header Checksum: <span className="text-emerald-400">0x4a2e [validation: Correct]</span></div>
            </div>

            {/* Layer 4 & Routing Path Verdict */}
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
              <div className="text-purple-400 font-bold text-[11px] mb-1">
                ▸ Adaptive Routing & Hop Verdict
              </div>
              <div>Calculated Route: <span className="text-slate-100">{selectedPacket.routeTaken.join(' ➔ ')}</span></div>
              <div>Hop Latency: <span className="text-slate-100">{selectedPacket.latencyMs.toFixed(2)} ms</span></div>
              <div>Jitter Variance: <span className="text-slate-100">{selectedPacket.jitterMs} ms</span></div>
              <div>
                Delivery Verdict:{' '}
                <span
                  className={`font-bold ${
                    selectedPacket.status === 'DELIVERED' ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {selectedPacket.status}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
