# K8sWhisperer Architecture

## System Overview

```
                    +--------------------------------------------------+
                    |              K8sWhisperer System                  |
                    +--------------------------------------------------+
                    |                                                  |
    +---------------v----------------+    +------------------------+  |
    |    Observation Loop (30s)      |    |   FastAPI Server       |  |
    |    Continuous cluster scan     |    |   :8000                |  |
    +---------------+----------------+    |                        |  |
                    |                     |  POST /slack/actions   |  |
                    v                     |  GET  /api/incidents   |  |
    +-------------------------------------------+  POST /api/chat |  |
    |         LangGraph StateGraph               |  POST /api/chaos|  |
    |         (InMemorySaver Checkpointer)       |  WS   /api/ws   |  |
    |                                            +--------+--------+  |
    |  +----------+    +-----------+    +-------+         |           |
    |  | OBSERVE  |--->|  DETECT   |--->|DIAGNOSE|        |           |
    |  | kubectl  |    | LLM       |    | LLM +  |        |           |
    |  | poll     |    | classifier|    | kubectl |        |           |
    |  +----------+    +-----------+    +---+----+        |           |
    |                                      |              |           |
    |                                      v              |           |
    |                                  +--------+         |           |
    |                                  |  PLAN  |         |           |
    |                                  |  LLM   |         |           |
    |                                  +---+----+         |           |
    |                                      |              |           |
    |                          +-----------v-----------+  |           |
    |                          |     SAFETY GATE       |  |           |
    |                          | conf>0.8 & blast=low  |  |           |
    |                          | & !destructive        |  |           |
    |                          +---+---------------+---+  |           |
    |                              |               |      |           |
    |                         AUTO |          HITL |      |           |
    |                              v               v      |           |
    |                        +---------+    +----------+  |           |
    |                        | EXECUTE |    |HITL NODE |  |           |
    |                        | kubectl |    |interrupt()|  |           |
    |                        | + verify|    +----+-----+  |           |
    |                        +----+----+         |        |           |
    |                             |         Slack|Webhook |           |
    |                             v              v        |           |
    |                        +---------+   +----------+   |           |
    |                        | EXPLAIN |<--| Approve/ |   |           |
    |                        | LLM +   |   | Reject   |   |           |
    |                        | audit   |   +----------+   |           |
    |                        +----+----+                  |           |
    |                             |                       |           |
    |                    Loop back to OBSERVE             |           |
    +----------------------------------------------------+-----------+
                    |                    |
          +---------v--------+  +--------v--------+
          | Kubernetes       |  |     Slack       |
          | Cluster (kind)   |  |   Workspace     |
          |                  |  |                 |
          | - Pods           |  | - Notifications|
          | - Deployments    |  | - Approve/Reject|
          | - Nodes          |  | - Audit posts  |
          | - Events         |  |                 |
          | - HPA            |  |                 |
          +------------------+  +-----------------+
```

## LangGraph Node Graph

```
START --> observe --> detect --[anomalies?]--> diagnose --> plan
                        |                                    |
                     [none]                          safety_router
                        |                           /            \
                       END                    [AUTO]              [HITL]
                                                |                   |
                                            execute            hitl_node
                                                |              (interrupt)
                                           verify_check            |
                                           /          \        [Slack]
                                      [success]    [fail]         |
                                          |       (retry<3)  [resume]
                                       explain   --> diagnose     |
                                          |                   execute
                                     [loop to observe]            |
                                                              explain
```

## Safety Gate Decision Matrix

```
+-------------------+------------+--------+-------------+---------+
| Anomaly           | Confidence | Blast  | Destructive | Route   |
+-------------------+------------+--------+-------------+---------+
| CrashLoopBackOff  | 0.9        | low    | false       | AUTO    |
| OOMKilled         | 0.85       | low    | false       | AUTO    |
| Evicted           | 0.9        | low    | false       | AUTO    |
| Pending           | 0.7        | medium | false       | HITL    |
| ImagePullBackOff  | 0.95       | medium | false       | HITL    |
| CPUThrottling     | 0.8        | medium | false       | HITL    |
| DeploymentStalled | 0.7        | high   | true        | HITL    |
| NodeNotReady      | 0.5        | high   | true        | HITL    |
+-------------------+------------+--------+-------------+---------+

Rule: AUTO only if (confidence > 0.8 AND blast_radius = "low" AND NOT destructive)
```

## ClusterState Schema (TypedDict)

```
ClusterState:
  events:        list[dict]          # Raw kubectl events (append-only)
  anomalies:     list[Anomaly]       # Detected anomalies (append-only)
  diagnosis:     str                 # LLM root cause with evidence
  plan:          RemediationPlan     # Action + confidence + blast_radius
  approved:      bool                # HITL approval decision
  result:        str                 # Execution output + post-action state
  audit_log:     list[LogEntry]      # Persistent history (append-only)
  current_anomaly_index: int         # Processing tracker
  retry_count:   int                 # Self-correction attempts (max 3)
  incident_id:   str                 # Unique incident identifier
```

## MCP Tool Architecture

```
+-----------------------------------+
| kubectl MCP Server (FastMCP)      |
| RBAC: k8swhisperer-agent SA      |
+-----------------------------------+
| get_pods(namespace)               |
| get_pod_logs(name, ns, previous)  |
| describe_pod(name, ns)            |
| get_events(namespace)             |
| get_nodes()                       |
| delete_pod(name, ns)              |
| patch_deployment_resources(...)   |
| rollback_deployment(name, ns)     |
| get_deployments(namespace)        |
| get_hpa(namespace)                |
| scale_deployment(name, ns, n)     |
+-----------------------------------+

+-----------------------------------+
| Slack MCP Server (FastMCP)        |
+-----------------------------------+
| send_slack_message(ch, text)      |
| send_approval_request(ch, plan)   |
+-----------------------------------+
```

## RBAC Security Model

```
ServiceAccount: k8swhisperer-agent (namespace: k8swhisperer-demo)

Namespaced Role:
  pods:         get, list, watch, delete, patch
  pods/log:     get
  events:       get, list, watch
  deployments:  get, list, watch, patch, update
  replicasets:  get, list, watch

ClusterRole (read-only):
  nodes:        get, list, watch
  metrics:      get, list (metrics.k8s.io)

NO cluster-admin. NO namespace deletion. NO secret access.
```

## Tech Stack

| Component | Technology |
|---|---|
| Orchestration | LangGraph StateGraph + InMemorySaver |
| LLM | Claude via LiteLLM (OpenAI-compatible proxy) |
| MCP Server | FastMCP (Python MCP SDK) |
| HITL | Slack Block Kit + FastAPI webhook |
| API Server | FastAPI + uvicorn |
| Frontend | React + TypeScript + Tailwind CSS |
| Cluster | kind (Kubernetes in Docker) |
| Blockchain | Stellar Soroban (testnet) |
| Language | Python 3.11+ / TypeScript |
