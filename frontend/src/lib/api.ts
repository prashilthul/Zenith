import type { Incident, ClusterState, ChaosResult, AuditEntry } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

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
  const res = await fetch(`${API_BASE}/api/chaos?count=${count}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchClusterState(): Promise<ClusterState> {
  return request<ClusterState>("/api/cluster-state");
}

export async function injectSpecificChaos(scenario: string): Promise<{ scenario: string; success: boolean; output?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/api/chaos/inject?scenario=${encodeURIComponent(scenario)}`, { method: "POST" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function cleanupChaos(): Promise<{ cleaned: boolean; output: string }> {
  const res = await fetch(`${API_BASE}/api/chaos/cleanup`, { method: "POST" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchChaosScenarios(): Promise<{ name: string; available: boolean }[]> {
  return request<{ name: string; available: boolean }[]>("/api/chaos/scenarios");
}
