import { AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react";
import type { Incident } from "../types";

const severityColors: Record<string, string> = {
  CRITICAL: "bg-red-600",
  HIGH: "bg-red-500",
  MED: "bg-yellow-500",
  LOW: "bg-blue-500",
};

function OutcomeIcon({ outcome }: { outcome: string }) {
  if (outcome?.startsWith("success")) return <CheckCircle className="w-4 h-4 text-emerald-400" />;
  if (outcome?.startsWith("failure")) return <XCircle className="w-4 h-4 text-red-400" />;
  return <Clock className="w-4 h-4 text-yellow-400" />;
}

export default function IncidentCard({ incident }: { incident: Incident }) {
  const i = incident;
  const time = i.first_seen ? new Date(i.first_seen).toLocaleTimeString() : "";

  const shortSummary = i.summary
    ?.replace(/^#.*\n/gm, "")
    ?.split("\n")
    ?.filter(l => l.trim().length > 0)
    ?.[0]
    ?.slice(0, 200) || "Processing...";

  return (
    <div className="bg-slate-900 rounded-lg p-4 border border-slate-700 hover:border-cyan-800 transition">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <OutcomeIcon outcome={i.outcome} />
          <div>
            <div className="flex items-center gap-2">
              {i.anomaly_type && (
                <span className={`px-2 py-0.5 rounded text-xs font-mono text-white ${severityColors[i.severity || "MED"] || "bg-slate-600"}`}>
                  {i.anomaly_type}
                </span>
              )}
              {i.affected_resource && (
                <span className="text-xs text-slate-400 font-mono">{i.affected_resource}</span>
              )}
            </div>
            <p className="text-sm text-slate-300 mt-1">{shortSummary}</p>
          </div>
        </div>
        <div className="text-xs text-slate-500 whitespace-nowrap ml-4">{time}</div>
      </div>

      <div className="flex items-center gap-4 mt-3 text-xs">
        {i.action && (
          <span className="text-cyan-400 font-mono">
            <AlertTriangle className="w-3 h-3 inline mr-1" />{i.action}
          </span>
        )}
        {i.confidence != null && (
          <span className="text-slate-400">conf: {(i.confidence * 100).toFixed(0)}%</span>
        )}
        {i.blast_radius && (
          <span className={`px-1.5 py-0.5 rounded text-xs ${
            i.blast_radius === "low" ? "bg-emerald-900 text-emerald-300" :
            i.blast_radius === "medium" ? "bg-yellow-900 text-yellow-300" :
            "bg-red-900 text-red-300"
          }`}>{i.blast_radius}</span>
        )}
        <span className={`ml-auto ${i.outcome?.startsWith("success") ? "text-emerald-400" : "text-red-400"}`}>
          {i.outcome?.slice(0, 60)}
        </span>
      </div>

      {i.stages && i.stages.length > 0 && (
        <div className="flex gap-1 mt-2">
          {i.stages.map((s, idx) => (
            <span key={idx} className="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-xs font-mono">{s}</span>
          ))}
        </div>
      )}
    </div>
  );
}
