import type { Incident, ClusterState, ChaosResult, AuditEntry } from "../types";

const API_BASE = "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function fetchIncidents(): Promise<Incident[]> {
  return request<Incident[]>("/api/incidents");
}

export async function fetchAuditLog(): Promise<AuditEntry[]> {
  return request<AuditEntry[]>("/api/audit-log");
}

export async function sendChat(message: string): Promise<{ response: string }> {
  return request<{ response: string }>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function triggerChaos(count: number = 3): Promise<ChaosResult> {
  return request<ChaosResult>(`/api/chaos?count=${count}`, {
    method: "POST",
  });
}

export async function fetchClusterState(): Promise<ClusterState> {
  return request<ClusterState>("/api/cluster-state");
}
