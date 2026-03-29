import { useState, useEffect } from "react";
import { Activity, CheckCircle, AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { fetchIncidents, fetchClusterState } from "../lib/api";
import type { Incident, ClusterState, PodStatus } from "../types";
import IncidentCard from "./IncidentCard";
import ChaosButton from "./ChaosButton";

function podColor(pod: PodStatus): string {
  const phase = pod.phase;
  const restarts = pod.containers?.reduce((s, c) => s + (c.restart_count || 0), 0) || 0;
  if (phase === "Running" && restarts === 0) return "bg-emerald-500";
  if (phase === "Running" && restarts > 0) return "bg-yellow-500";
  if (phase === "Failed" || pod.containers?.some(c => c.reason === "CrashLoopBackOff" || c.reason === "Error")) return "bg-red-500";
  if (phase === "Pending") return "bg-yellow-400";
  if (phase === "Succeeded") return "bg-blue-400";
  return "bg-slate-500";
}

function podTooltip(pod: PodStatus): string {
  const restarts = pod.containers?.reduce((s, c) => s + (c.restart_count || 0), 0) || 0;
  const reason = pod.containers?.find(c => c.reason)?.reason || pod.phase;
  return `${pod.namespace}/${pod.name}\n${reason} | restarts: ${restarts}`;
}

export default function Dashboard() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [cluster, setCluster] = useState<ClusterState | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const load = async () => {
    try {
      const [inc, cs] = await Promise.allSettled([fetchIncidents(), fetchClusterState()]);
      if (inc.status === "fulfilled") setIncidents(inc.value);
      if (cs.status === "fulfilled") setCluster(cs.value);
      setLastUpdate(new Date());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  const totalIncidents = incidents.length;
  const resolved = incidents.filter(i => i.outcome?.startsWith("success")).length;
  const failed = incidents.filter(i => i.outcome?.startsWith("failure")).length;
  const pending = totalIncidents - resolved - failed;

  return (
    <div className="space-y-6">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Activity className="w-5 h-5 text-cyan-400" />} label="Total Incidents" value={totalIncidents} />
        <StatCard icon={<CheckCircle className="w-5 h-5 text-emerald-400" />} label="Resolved" value={resolved} />
        <StatCard icon={<AlertTriangle className="w-5 h-5 text-red-400" />} label="Failed / Pending" value={failed + pending} />
        <StatCard icon={<Clock className="w-5 h-5 text-yellow-400" />} label="Last Scan" value={lastUpdate.toLocaleTimeString()} small />
      </div>

      {/* Cluster Status */}
      <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Cluster Pods</h2>
          <button onClick={load} className="text-slate-400 hover:text-cyan-400 transition">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {cluster?.pods?.map((pod) => (
            <div
              key={`${pod.namespace}/${pod.name}`}
              className={`w-8 h-8 rounded-full ${podColor(pod)} opacity-90 hover:opacity-100 cursor-pointer transition-all hover:scale-110 ${
                podColor(pod) === "bg-red-500" ? "animate-pulse" : ""
              }`}
              title={podTooltip(pod)}
            />
          )) || <p className="text-slate-500 text-sm">No pods found</p>}
        </div>
        {cluster?.nodes && cluster.nodes.length > 0 && (
          <div className="mt-3 text-xs text-slate-500">
            Nodes: {cluster.nodes.map(n => n.name).join(", ")}
          </div>
        )}
      </div>

      {/* Chaos Button */}
      <div className="flex justify-center">
        <ChaosButton />
      </div>

      {/* Incident Timeline */}
      <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
          Incident Timeline ({incidents.length})
        </h2>
        {incidents.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-8">
            No incidents yet. The agent is monitoring your cluster...
          </p>
        ) : (
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
            {[...incidents].reverse().map((inc) => (
              <IncidentCard key={inc.incident_id} incident={inc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, small }: { icon: React.ReactNode; label: string; value: string | number; small?: boolean }) {
  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs text-slate-400">{label}</span></div>
      <div className={`font-mono ${small ? "text-sm text-slate-300" : "text-2xl text-white"}`}>{value}</div>
    </div>
  );
}
