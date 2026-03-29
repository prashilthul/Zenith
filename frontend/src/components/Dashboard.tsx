import { useState, useEffect } from "react";
import { Activity, CheckCircle, UserCheck, Clock, RefreshCw } from "lucide-react";
import { fetchIncidents, fetchClusterState } from "../lib/api";
import type { Incident, ClusterState, PodStatus } from "../types";
import IncidentCard from "./IncidentCard";
import ChaosButton from "./ChaosButton";
import MTTRChart from "./MTTRChart";

function podColor(pod: PodStatus): string {
  if (pod.status === "Running" && pod.restarts === 0) return "bg-emerald-500";
  if (pod.status === "Running" && pod.restarts > 0) return "bg-yellow-500";
  if (pod.status === "CrashLoopBackOff" || pod.status === "Failed") return "bg-red-500";
  if (pod.status === "Pending") return "bg-yellow-400";
  return "bg-slate-500";
}

function podTooltip(pod: PodStatus): string {
  return `${pod.namespace}/${pod.name} [${pod.status}] restarts:${pod.restarts}`;
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
  const autoFixed = incidents.filter(
    (i) => i.stage === "verified" && !i.remediation_plan?.requires_approval
  ).length;
  const hitlApproved = incidents.filter(
    (i) => i.stage === "verified" && i.remediation_plan?.requires_approval
  ).length;
  const resolved = incidents.filter((i) => i.resolution_time_seconds != null);
  const avgMTTR =
    resolved.length > 0
      ? resolved.reduce((s, i) => s + (i.resolution_time_seconds ?? 0), 0) / resolved.length
      : 0;

  return (
    <div className="space-y-6">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Activity size={20} />}
          label="Total Incidents"
          value={totalIncidents}
          color="text-cyan-400"
        />
        <StatCard
          icon={<CheckCircle size={20} />}
          label="Auto-Fixed"
          value={autoFixed}
          color="text-emerald-400"
        />
        <StatCard
          icon={<UserCheck size={20} />}
          label="HITL Approved"
          value={hitlApproved}
          color="text-yellow-400"
        />
        <StatCard
          icon={<Clock size={20} />}
          label="Avg MTTR"
          value={avgMTTR > 0 ? `${avgMTTR.toFixed(1)}s` : "--"}
          color="text-teal-400"
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Cluster + Chart */}
        <div className="lg:col-span-2 space-y-6">
          {/* Cluster Status */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-mono uppercase tracking-wider text-slate-400">
                Cluster Status
              </h3>
              <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                {lastUpdate.toLocaleTimeString()}
              </div>
            </div>
            {cluster?.pods && cluster.pods.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {cluster.pods.map((pod, i) => (
                  <div
                    key={i}
                    className={`w-4 h-4 rounded-full ${podColor(pod)} opacity-80 hover:opacity-100 hover:scale-150 transition-all cursor-pointer`}
                    title={podTooltip(pod)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-500 font-mono">
                No cluster data (API unavailable or no pods)
              </div>
            )}
            <div className="flex items-center gap-4 mt-3 text-xs text-slate-500 font-mono">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Healthy
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> Warning
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Critical
              </span>
            </div>
          </div>

          {/* MTTR Chart */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
            <h3 className="text-sm font-mono uppercase tracking-wider text-slate-400 mb-4">
              Resolution Time Breakdown
            </h3>
            <MTTRChart incidents={incidents} />
          </div>
        </div>

        {/* Right: Chaos Button */}
        <div className="space-y-6">
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 flex flex-col items-center">
            <h3 className="text-sm font-mono uppercase tracking-wider text-slate-400 mb-6">
              Chaos Engineering
            </h3>
            <ChaosButton />
          </div>
        </div>
      </div>

      {/* Incident Timeline */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h3 className="text-sm font-mono uppercase tracking-wider text-slate-400 mb-4">
          Live Incident Timeline
        </h3>
        {incidents.length === 0 ? (
          <div className="text-sm text-slate-500 font-mono py-8 text-center">
            {loading ? "Loading incidents..." : "No incidents detected. Launch some chaos!"}
          </div>
        ) : (
          <div className="space-y-3">
            {[...incidents]
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .map((incident) => (
                <IncidentCard key={incident.id} incident={incident} compact />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={color}>{icon}</span>
        <span className="text-xs font-mono uppercase tracking-wider text-slate-500">
          {label}
        </span>
      </div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
    </div>
  );
}
