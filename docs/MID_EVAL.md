# K8sWhisperer — Mid-Evaluation Summary

> Autonomous Kubernetes Incident Response Agent | PS1 Hackathon

---

## What We Built (One-Liners)

### Core Pipeline (7 Stages) — ALL WORKING
1. **Observe** — Polls K8s cluster every 30s, collects pod states, events, deployments, HPA metrics
2. **Detect** — LLM (Claude Haiku) classifies raw signals into 8 anomaly types with dedup + validation
3. **Diagnose** — Fetches targeted evidence (logs, describe, events) per anomaly type, LLM generates root cause
4. **Plan** — LLM generates remediation with confidence score, blast radius, and destructive flag
5. **Safety Gate** — Auto-execute if confidence > 0.8 AND blast_radius=low AND non-destructive; else HITL
6. **Execute** — Runs kubectl action via Python K8s client with verify loop (exponential backoff)
7. **Explain** — LLM generates plain-English summary, writes audit log, posts to Slack, stores on blockchain

### 8 Anomaly Types — ALL IMPLEMENTED
| Type | Auto/HITL | Action | Tested |
|------|-----------|--------|--------|
| CrashLoopBackOff | AUTO | delete_pod | 41 incidents |
| OOMKilled | AUTO | patch_resources | 2 incidents |
| Pending | AUTO | no_op | 2 incidents |
| ImagePullBackOff | HITL | alert human | Slack sent |
| CPUThrottling | HITL | patch_cpu | Fallback ready |
| Evicted | AUTO | delete_pod | 1 incident |
| DeploymentStalled | HITL | rollback | Slack sent |
| NodeNotReady | HITL | cordon_node | Fallback ready |

### Multi-Agent Swarm
- **Commander** (Supervisor) — Orchestrates 4 specialized agents
- **Scout** (Sonnet) — Cluster reconnaissance, read-only tools
- **Doctor** (Opus) — Root cause analysis, deep reasoning
- **Executor** (Sonnet) — Remediation execution, write tools
- **Comms** (Sonnet) — Slack notifications, post-mortems

### Slack Integration
- Incident notifications with rich Block Kit formatting
- HITL Approve/Reject buttons (blast_radius=high actions)
- Socket Mode listener for conversational control (@mentions, /k8s commands)
- War Room chat with real cluster context

### Self-Evolving Runbooks
- Caches diagnosis + fix patterns after each incident
- 9 cached runbooks, 2 with repeat hits (faster resolution on second occurrence)
- Fingerprint-based similarity matching

### Blockchain Audit Trail (25 Bonus Marks)
- Soroban smart contract on Stellar testnet (Rust)
- Auto-stores every incident from explain node
- Tamper-proof diagnosis verification

### Chaos Engineering
- 9 demo scenarios injectable via API or dashboard button
- CrashLoop, OOMKill, Pending, ImagePull, Stalled Deploy, Evicted, CPU Stress, Node Pressure, HPA Stress

### HPA / Autoscaling
- HPA demo: 1→5 replicas on CPU threshold
- Stress generator for load testing
- `get_hpa()` and `scale_deployment()` MCP tools

### Frontend Dashboard
- Professional mission-control dark UI (React + Tailwind)
- Live pod grid, incident timeline, severity-colored cards
- Searchable audit log with syntax-highlighted JSON
- War Room natural language chat
- Chaos Lab with countdown button
- Incident analytics chart (ComposedChart)

### RBAC Security
- ServiceAccount with namespaced Role (pods, deployments, events)
- ClusterRole for nodes (read-only)
- **No cluster-admin anywhere**
- Namespace protection in executor as defense-in-depth

### Docker Support
- `Dockerfile.backend` + `Dockerfile.frontend` + `docker-compose.yml`
- Nginx proxy for frontend → backend API
- Mount kubeconfig + .env at runtime, no secrets baked in

---

## Live Test Results

| Metric | Value |
|--------|-------|
| Total audit entries | 48+ |
| Unique incidents processed | 48+ |
| Distinct anomaly types detected | 5 (+ 2 in HITL) |
| Auto-executed remediations | 7 |
| HITL approvals sent to Slack | 3 |
| Runbook cache entries | 9 |
| Success rate | 81% |
| Detection → Resolution | ~30-45s |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Orchestration | LangGraph StateGraph + conditional edges + checkpointing |
| LLM | Claude Haiku via LiteLLM (detection, diagnosis, planning, explanation) |
| Tools | FastMCP — 11 kubectl tools + 2 Slack tools |
| K8s | kind cluster, Python kubernetes client |
| HITL | LangGraph interrupt() + Command(resume) + Slack Block Kit |
| Backend | FastAPI + Uvicorn + asyncio background loop |
| Frontend | React 19 + Tailwind 4 + Recharts + Lucide |
| Blockchain | Soroban (Rust) on Stellar testnet + Python stellar-sdk |
| Agents | LangGraph Supervisor (Commander + 4 workers) |
| Slack | slack-sdk Socket Mode + webhook for approvals |

---

## Key Differentiators

1. **Multi-Agent Swarm** — Not a pipeline, a coordinated team with isolated RBAC per agent
2. **Self-Evolving** — Resolution time drops on repeated incidents (runbook cache)
3. **Predictive** — OOM predictor with linear regression (code ready, needs Prometheus)
4. **Interactive** — Chaos button for judges, War Room chat, Slack conversational control
5. **Verifiable** — Every decision on blockchain (Stellar testnet)
6. **Production-Grade** — Safety gate, self-correction loop (retry 3x), namespaced RBAC
7. **Dockerized** — One command to run anywhere

---

## Repository

- **GitHub**: github.com/manaspros/k8swhisperer (private)
- **Files**: 100+ tracked files
- **Lines of Code**: 15,000+
- **Commits**: 25+
