# K8sWhisperer - Hackathon Learnings

## Architecture Decisions

### LangGraph as the Orchestration Engine
- LangGraph's `StateGraph` with `TypedDict` state is ideal for multi-stage pipelines
- Conditional edges for safety gate routing (auto-execute vs HITL) work cleanly
- `interrupt()` + `Command(resume=...)` is the correct HITL pattern for pausing/resuming
- `InMemorySaver` checkpointer stores graph state so Slack webhook can resume later
- Each incident gets a unique `thread_id` for isolated state management

### Sync vs Async in LangGraph Nodes
- LangGraph nodes run synchronously by default
- LLM calls via litellm are async (`acompletion`)
- **Solution**: Created `llm_call_sync` and `llm_call_json_sync` wrappers using `litellm.completion` (sync version)
- Cannot use `asyncio.run()` or `run_until_complete()` inside nodes when already in an event loop

### Resource Name Parsing
- LLM classifies affected_resource as "pod/crashloop-demo" with kind prefix
- kubectl API expects just "crashloop-demo" (no prefix)
- **Solution**: Strip kind prefix with `resource.split("/", 1)[-1]` in diagnose and execute nodes

### LiteLLM with Custom Proxy
- The proxy exposes an OpenAI-compatible API at `/v1/chat/completions`
- Must use `openai/` prefix in model name for litellm to route correctly
- Without prefix, litellm tries Anthropic's `/v1/messages` endpoint and gets 404
- Model names must match proxy's model list exactly (e.g., `openai/claude-haiku-4-5`)

## Testing Insights

### Demo Scenario Behavior
- **CrashLoopBackOff**: Standalone Pod with `exit 1` — agent correctly detects, diagnoses, deletes
- **OOMKilled**: Standalone Pod with stress tool — detected correctly, patch fails because it's not a Deployment (expected for standalone pods)
- **Pending**: Pod requesting 100 CPUs — correctly routed to HITL with medium blast_radius
- For production demos, use Deployments instead of standalone Pods so patches work

### Safety Gate Routing
- CrashLoopBackOff: `delete_pod` with confidence=0.95, blast=low, destructive=false → **AUTO-EXECUTE** (correct)
- OOMKilled: `patch_deployment_resources` with confidence=0.95, blast=low → **AUTO-EXECUTE** (correct)
- Pending: `no_op` with blast=medium → **HITL** (correct)
- DeploymentStalled: `rollback_deployment` with destructive=true → **HITL** (correct)

### Planner Prompt Engineering
- Without explicit guidance, the LLM suggests rollback_deployment for CrashLoopBackOff
- Adding "Preferred actions by anomaly type" section to the prompt fixes this
- The planner fallback defaults ensure correct behavior even if LLM fails

## Slack Integration

### Channel Setup
- Bot token (`xoxb-`) needs `chat:write` and `chat:write.public` scopes minimum
- `SLACK_CHANNEL_ID` must be the actual channel ID (starts with `C`), not workspace ID (starts with `T`)
- Block Kit buttons with Approve/Reject encode `thread_id` in the value field for graph resumption
- Webhook must return 200 within 3 seconds — use FastAPI `BackgroundTasks` for graph resumption

### HITL Flow
1. Safety gate routes to `hitl_node`
2. `hitl_node` sends Slack approval request with Block Kit buttons
3. `hitl_node` calls `interrupt()` which pauses the graph and saves state to checkpointer
4. Slack webhook (`POST /slack/actions`) receives button click
5. Webhook calls `graph.invoke(Command(resume={"approved": True}), config)` to resume
6. Graph continues from where it paused

## Performance

| Scenario | Total Pipeline Time | LLM Calls |
|---|---|---|
| CrashLoopBackOff | ~28s | 4 (detect, diagnose, plan, explain) |
| OOMKilled | ~47s | 4 |
| Pending Pod | ~15s | 3 (detect, diagnose, plan → HITL pause) |

### Token Optimization
- Using `claude-haiku-4-5` (fast model) for all pipeline stages saves significant tokens
- Haiku is sufficient for classification and planning — diagnosis benefits from a stronger model
- Log chunking (keep last 200 lines + summary) prevents token overflow

## Kubernetes Specifics

### RBAC Design
- ServiceAccount `k8swhisperer-agent` in demo namespace
- Namespaced Role: pods (get/list/watch/delete/patch), pods/log (get), events, deployments
- ClusterRole: nodes (get/list/watch) — read-only at cluster scope
- **No cluster-admin** — judges check for this specifically
- Namespace protection in executor tools as defense-in-depth

### kind vs minikube
- Used `kind` (Kubernetes IN Docker) instead of minikube — functionally equivalent
- Both provide a real K8s cluster for the demo
- kind is lighter and faster to spin up

## What Would We Improve with More Time

1. **Deployment-based demos** — Use Deployments instead of standalone Pods so patches and rollbacks work correctly
2. **Prometheus integration** — Real metric-driven detection for CPU throttling and predictive alerting
3. **End-to-end HITL testing** — Full Slack webhook flow with ngrok/Cloudflare tunnel
4. **Concurrent anomaly handling** — Test two anomalies firing simultaneously
5. **Frontend WebSocket** — Real-time updates instead of polling
6. **Blockchain deployment** — Deploy Soroban contract and test on-chain storage
