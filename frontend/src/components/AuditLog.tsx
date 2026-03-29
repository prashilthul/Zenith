import { useState, useEffect, useRef } from "react";
import { ArrowDown } from "lucide-react";
import { fetchAuditLog } from "../lib/api";
import type { AuditEntry } from "../types";

function syntaxHighlight(json: string): string {
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = "text-amber-300"; // number
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? "text-cyan-400" : "text-emerald-300"; // key : string
      } else if (/true|false/.test(match)) {
        cls = "text-purple-400";
      } else if (/null/.test(match)) {
        cls = "text-slate-500";
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchAuditLog();
        setEntries(data);
      } catch { /* silent */ }
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          Audit Trail ({entries.length} entries)
        </h2>
        <button onClick={scrollToBottom} className="text-slate-400 hover:text-cyan-400">
          <ArrowDown className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2 font-mono text-xs">
        {entries.length === 0 ? (
          <p className="text-slate-500 text-center py-8">No audit entries yet.</p>
        ) : (
          entries.map((entry, idx) => (
            <div
              key={`${entry.incident_id}-${idx}`}
              className="bg-slate-900 rounded p-3 border border-slate-700 cursor-pointer hover:border-cyan-800 transition"
              onClick={() => setExpandedId(expandedId === `${entry.incident_id}-${idx}` ? null : `${entry.incident_id}-${idx}`)}
            >
              <div className="flex items-center gap-3">
                <span className="text-slate-500">{entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ""}</span>
                <span className="px-1.5 py-0.5 bg-cyan-900 text-cyan-300 rounded text-xs">{entry.stage}</span>
                <span className="text-slate-400 font-mono">{entry.incident_id}</span>
                <span className={`ml-auto text-xs ${entry.outcome?.startsWith("success") ? "text-emerald-400" : entry.outcome?.startsWith("failure") ? "text-red-400" : "text-yellow-400"}`}>
                  {entry.outcome?.slice(0, 40)}
                </span>
              </div>

              {/* Summary preview */}
              <p className="text-slate-400 mt-1 truncate">
                {entry.summary?.replace(/^#.*\n/gm, "").split("\n").filter(l => l.trim())[0]?.slice(0, 120)}
              </p>

              {/* Expanded details */}
              {expandedId === `${entry.incident_id}-${idx}` && entry.details && (
                <pre
                  className="mt-2 p-2 bg-slate-950 rounded text-xs overflow-x-auto max-h-60"
                  dangerouslySetInnerHTML={{
                    __html: syntaxHighlight(JSON.stringify(entry.details, null, 2)),
                  }}
                />
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
