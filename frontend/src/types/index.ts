export type Severity = "critical" | "high" | "medium" | "low";

export type AnomalyType =
  | "pod_crash_loop"
  | "memory_leak"
  | "cpu_spike"
  | "network_partition"
  | "disk_pressure"
  | "oom_kill"
  | "image_pull_error"
  | "config_drift"
  | "unknown";

export type IncidentStage =
  | "detected"
  | "diagnosing"
  | "diagnosed"
  | "fixing"
  | "fixed"
  | "verifying"
  | "verified"
  | "escalated"
  | "failed";

export interface Anomaly {
  id: string;
  type: AnomalyType;
  severity: Severity;
  resource: string;
  namespace: string;
  description: string;
  detected_at: string;
  metrics?: Record<string, number>;
}

export interface RemediationPlan {
  action: string;
  command?: string;
  rollback_command?: string;
  requires_approval: boolean;
  confidence: number;
  reasoning: string;
}

export interface LogEntry {
  timestamp: string;
  stage: IncidentStage;
  message: string;
  details?: Record<string, unknown>;
}

export interface Incident {
  id: string;
  anomaly: Anomaly;
  stage: IncidentStage;
  diagnosis?: string;
  remediation_plan?: RemediationPlan;
  audit_log: LogEntry[];
  resolution_time_seconds?: number;
  detection_time_seconds?: number;
  diagnosis_time_seconds?: number;
  fix_time_seconds?: number;
  verify_time_seconds?: number;
  runbook_hit?: boolean;
  created_at: string;
  resolved_at?: string;
}

export interface ClusterState {
  pods: PodStatus[];
  nodes: NodeStatus[];
}

export interface PodStatus {
  name: string;
  namespace: string;
  status: "Running" | "Pending" | "Failed" | "CrashLoopBackOff" | "Unknown";
  restarts: number;
}

export interface NodeStatus {
  name: string;
  status: "Ready" | "NotReady" | "Unknown";
  cpu_percent: number;
  memory_percent: number;
}

export interface ChatMessage {
  role: "user" | "agent";
  content: string;
  timestamp: string;
}

export interface ChaosResult {
  injected: string[];
  count: number;
}
