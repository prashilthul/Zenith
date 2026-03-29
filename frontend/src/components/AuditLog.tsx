import { useState, useEffect, useRef } from "react";
import { Filter, ArrowDown } from "lucide-react";
import { fetchAuditLog } from "../lib/api";
import type { Incident, IncidentStage, Severity, LogEntry } from "../types";

const ALL_STAGES: IncidentStage[] = [
  "detected", "diagnosing", "diagnosed", "fixing", "fixed", "verifying", "verified", "escalated", "failed",
];

const ALL_SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];

function syntaxHighlight(json: string): string {
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = "text-amber-300"; // number
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = "text-cyan-400"; // key
        } else {
          cls = "text-emerald-300"; // string
        }
      } else if (/true|false/.test(match)) {
        cls = "text-purple-400"; // boolean
      } else if (/null/.test(match)) {
        cls = "text-slate-500"; // null
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

interface FlatEntry {
  incidentId: string;
  severity: Severity;
  resource: string;
  entry: LogEntry;
}

export default function AuditLog() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [stageFilter, setStageFilter] = useState<IncidentStage | "all">("all");
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchAuditLog();
        setIncidents(data);
      } catch {
        // silent
      }
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [incidents, autoScroll]);

  // Flatten all audit log entries
  const entries: FlatEntry[] = incidents.flatMap((inc) =>
    inc.audit_log.map((entry) => ({
      incidentId: inc.id,
      severity: inc.anomaly.severity,
      resource: inc.anomaly.resource,
      entry,
    }))
  );

  // Apply filters
  const filtered = entries.filter((e) => {
    if (stageFilter !== "all" && e.entry.stage !== stageFilter) return false;
    if (severityFilter !== "all" && e.severity !== severityFilter) return false;
    return true;
  });

  // Sort by timestamp
  filtered.sort((a, b) => new Date(a.entry.timestamp).getTime() - new Date(b.entry.timestamp).getTime());

  const toggleExpand = (idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const stageColor = (stage: IncidentStage): string => {
    const map: Record<string, string> = {
      detected: "text-yellow-400",
      diagnosing: "text-blue-400",
      diagnosed: "text-blue-300",
      fixing: "text-cyan-400",
      fixed: "text-green-400",
      verifying: "text-teal-400",
      verified: "text-emerald-400",
      escalated: "text-red-400",
      failed: "text-red-500",
    };
    return map[stage] ?? "text-slate-400";
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
        <Filter size={16} className="text-slate-400" />

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-mono uppercase">Stage:</span>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value as IncidentStage | "all")}
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="all">All</option>
            {ALL_STAGES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-mono uppercase">Severity:</span>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as Severity | "all")}
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="all">All</option>
            {ALL_SEVERITIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="accent-cyan-500"
            />
            <span className="text-xs text-slate-400 font-mono">Auto-scroll</span>
            <ArrowDown size={12} className="text-slate-500" />
          </label>
        </div>

        <span className="text-xs text-slate-600 font-mono">
          {filtered.length} entries
        </span>
      </div>

      {/* Log entries */}
      <div className="bg-slate-900/80 rounded-xl border border-slate-700/50 max-h-[calc(100vh-280px)] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 font-mono">
            No audit log entries match filters
          </div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {filtered.map((e, idx) => (
              <div
                key={idx}
                className="px-4 py-3 hover:bg-slate-800/30 cursor-pointer transition-colors"
                onClick={() => e.entry.details && toggleExpand(idx)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 font-mono w-44 flex-shrink-0">
                    {new Date(e.entry.timestamp).toLocaleString()}
                  </span>
                  <span className={`text-xs font-mono font-semibold w-20 ${stageColor(e.entry.stage)}`}>
                    {e.entry.stage}
                  </span>
                  <span className="text-xs text-slate-500 font-mono w-32 truncate">
                    {e.resource}
                  </span>
                  <span className="text-sm text-slate-300 font-mono flex-1">
                    {e.entry.message}
                  </span>
                  {e.entry.details && (
                    <span className="text-xs text-slate-600 font-mono">
                      {expanded.has(idx) ? "[-]" : "[+]"}
                    </span>
                  )}
                </div>
                {expanded.has(idx) && e.entry.details && (
                  <pre
                    className="mt-2 ml-44 text-xs font-mono bg-slate-950/50 rounded-lg p-3 overflow-x-auto border border-slate-800"
                    dangerouslySetInnerHTML={{
                      __html: syntaxHighlight(JSON.stringify(e.entry.details, null, 2)),
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
