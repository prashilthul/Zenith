import { Clock, CheckCircle, AlertTriangle, XCircle, Zap, BookOpen } from "lucide-react";
import type { Incident, Severity, AnomalyType, IncidentStage } from "../types";

const severityColors: Record<Severity, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-green-500/20 text-green-400 border-green-500/30",
};

const anomalyLabels: Record<AnomalyType, string> = {
  pod_crash_loop: "CrashLoop",
  memory_leak: "Mem Leak",
  cpu_spike: "CPU Spike",
  network_partition: "Net Split",
  disk_pressure: "Disk Full",
  oom_kill: "OOM Kill",
  image_pull_error: "Pull Err",
  config_drift: "Config Drift",
  unknown: "Unknown",
};

const anomalyColors: Record<AnomalyType, string> = {
  pod_crash_loop: "bg-red-500/20 text-red-300",
  memory_leak: "bg-purple-500/20 text-purple-300",
  cpu_spike: "bg-orange-500/20 text-orange-300",
  network_partition: "bg-blue-500/20 text-blue-300",
  disk_pressure: "bg-yellow-500/20 text-yellow-300",
  oom_kill: "bg-red-600/20 text-red-300",
  image_pull_error: "bg-pink-500/20 text-pink-300",
  config_drift: "bg-cyan-500/20 text-cyan-300",
  unknown: "bg-slate-500/20 text-slate-300",
};

const stageIcons: Partial<Record<IncidentStage, React.ReactNode>> = {
  detected: <AlertTriangle size={12} />,
  diagnosed: <Zap size={12} />,
  fixed: <CheckCircle size={12} />,
  verified: <CheckCircle size={12} />,
  failed: <XCircle size={12} />,
  escalated: <AlertTriangle size={12} />,
};

const stageColors: Partial<Record<IncidentStage, string>> = {
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

function formatSeconds(s?: number): string {
  if (s == null) return "--";
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${(s % 60).toFixed(0)}s`;
}

interface Props {
  incident: Incident;
  compact?: boolean;
}

export default function IncidentCard({ incident, compact = false }: Props) {
  const { anomaly, stage, diagnosis, remediation_plan, audit_log, runbook_hit } = incident;

  if (compact) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-800/50 rounded-lg border border-slate-700/50 hover:border-slate-600/50 transition-colors">
        <span className={`px-2 py-0.5 rounded text-xs font-mono ${anomalyColors[anomaly.type]}`}>
          {anomalyLabels[anomaly.type]}
        </span>
        <span className={`px-1.5 py-0.5 rounded text-xs font-mono border ${severityColors[anomaly.severity]}`}>
          {anomaly.severity.toUpperCase()}
        </span>
        <span className="text-sm text-slate-300 font-mono flex-1 truncate">
          {anomaly.resource}
        </span>
        <span className={`text-xs font-mono ${stageColors[stage]}`}>
          {stage}
        </span>
        {incident.resolution_time_seconds != null && (
          <span className="text-xs text-slate-500 font-mono flex items-center gap-1">
            <Clock size={10} />
            {formatSeconds(incident.resolution_time_seconds)}
          </span>
        )}
        {runbook_hit && (
          <span className="px-1.5 py-0.5 rounded text-xs bg-teal-500/20 text-teal-300">
            <BookOpen size={10} className="inline mr-1" />
            cached
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-5 hover:border-cyan-500/30 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2.5 py-1 rounded-md text-xs font-mono font-semibold ${anomalyColors[anomaly.type]}`}>
            {anomalyLabels[anomaly.type]}
          </span>
          <span className={`px-2 py-1 rounded-md text-xs font-mono border ${severityColors[anomaly.severity]}`}>
            {anomaly.severity.toUpperCase()}
          </span>
          {runbook_hit && (
            <span className="px-2 py-1 rounded-md text-xs bg-teal-500/20 text-teal-300 flex items-center gap-1">
              <BookOpen size={12} />
              Runbook hit!
            </span>
          )}
        </div>
        <span className={`text-sm font-mono font-semibold ${stageColors[stage]}`}>
          {stage.toUpperCase()}
        </span>
      </div>

      {/* Resource */}
      <div className="text-sm text-slate-400 font-mono mb-2">
        <span className="text-slate-500">ns/</span>
        {anomaly.namespace}
        <span className="text-slate-600 mx-1">/</span>
        <span className="text-cyan-300">{anomaly.resource}</span>
      </div>

      {/* Description */}
      <p className="text-sm text-slate-300 mb-3">{anomaly.description}</p>

      {/* Diagnosis */}
      {diagnosis && (
        <div className="bg-slate-900/50 rounded-lg p-3 mb-3 border border-slate-700/30">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Diagnosis</div>
          <p className="text-sm text-slate-300">{diagnosis}</p>
        </div>
      )}

      {/* Remediation */}
      {remediation_plan && (
        <div className="bg-slate-900/50 rounded-lg p-3 mb-3 border border-slate-700/30">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Action</div>
          <p className="text-sm text-slate-300">{remediation_plan.action}</p>
          {remediation_plan.command && (
            <code className="block mt-1 text-xs text-cyan-400 bg-slate-950/50 rounded px-2 py-1 font-mono">
              $ {remediation_plan.command}
            </code>
          )}
          <div className="mt-1 text-xs text-slate-500">
            Confidence: {(remediation_plan.confidence * 100).toFixed(0)}%
            {remediation_plan.requires_approval && (
              <span className="ml-2 text-yellow-400">HITL required</span>
            )}
          </div>
        </div>
      )}

      {/* Timeline */}
      {audit_log.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Timeline</div>
          <div className="flex items-center gap-1 flex-wrap">
            {audit_log.map((entry, i) => (
              <div key={i} className="flex items-center gap-1">
                {i > 0 && <div className="w-4 h-px bg-slate-600" />}
                <div className={`flex items-center gap-1 text-xs font-mono ${stageColors[entry.stage] ?? "text-slate-400"}`}>
                  {stageIcons[entry.stage]}
                  {entry.stage}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timing breakdown */}
      <div className="flex items-center gap-4 text-xs text-slate-500 font-mono border-t border-slate-700/30 pt-3">
        {incident.detection_time_seconds != null && (
          <span>detect: {formatSeconds(incident.detection_time_seconds)}</span>
        )}
        {incident.diagnosis_time_seconds != null && (
          <span>diagnose: {formatSeconds(incident.diagnosis_time_seconds)}</span>
        )}
        {incident.fix_time_seconds != null && (
          <span>fix: {formatSeconds(incident.fix_time_seconds)}</span>
        )}
        {incident.verify_time_seconds != null && (
          <span>verify: {formatSeconds(incident.verify_time_seconds)}</span>
        )}
        {incident.resolution_time_seconds != null && (
          <span className="text-cyan-400 ml-auto flex items-center gap-1">
            <Clock size={12} />
            total: {formatSeconds(incident.resolution_time_seconds)}
          </span>
        )}
      </div>
    </div>
  );
}
