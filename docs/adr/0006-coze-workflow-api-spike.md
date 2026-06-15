# ADR 0006: Coze Workflow API Spike for Quality Review

Status: Accepted (Slice 7K)
Date: 2026-06-15

## Context

Slice 7A–7J completed the mock quality review sidecar: TypeScript contracts, RDS repository, detached async boundary, debug API endpoints, debug UI panel, and controlled sidecar verification. The next step is connecting to a real Coze workflow that runs a VLM to score candidate images.

Before writing the real adapter, we need to understand the Coze workflow API surface and plan the integration.

## Research Findings

### Two Workflow API Types in Coze

Coze offers two distinct workflow development paths, each with a different API surface:

1. **Low-code workflow** (低代码工作流): Visual drag-and-drop in the Coze web IDE.
   - API: `POST https://api.coze.cn/v1/workflow/run`
   - Auth: PAT (Personal Access Token), header `Authorization: Bearer pat_xxxx`
   - Supports sync, stream, and async modes
   - `workflow_id` identifies the deployed workflow

2. **AI Programming workflow** (AI 编程工作流): Code-first workflow developed in Coze AI Programming (扣子编程), deployed to a custom domain.
   - API: `https://<your_domain>/run`, `/stream_run`, `/async_run`, `/task/{task_id}`
   - Auth: API Token created in the deployment page
   - Supports sync, stream, and async modes
   - Each deployment gets a unique domain

### Recommended Path: Low-code Workflow

For quality review, the low-code workflow is the better fit because:
- Simpler auth (PAT, no custom domain management)
- Direct `workflow_id` based API
- Can use built-in LLM/VLM nodes without writing code
- Async mode (`is_async: true`) returns `execute_id` for polling — aligns with our detached sidecar pattern

### API Contract (Sync Mode)

```
POST https://api.coze.cn/v1/workflow/run
Headers:
  Authorization: Bearer pat_xxxx
  Content-Type: application/json
Body:
{
  "workflow_id": "<workflow_id>",
  "parameters": {
    "candidate_image_url": "https://...",
    "reference_images": ["https://...", "https://..."],
    "workflow_type": "template_replace",
    "prompt": "..."
  }
}
Response (success):
{
  "code": 0,
  "cost": "0",
  "data": "{\"quality_status\":\"pass\",\"confidence\":0.88,...}",
  "debug_url": "https://www.coze.cn/work_flow?execute_id=...",
  "msg": "Success",
  "token": 98
}
```

### API Contract (Async Mode)

```
POST https://api.coze.cn/v1/workflow/run  (with is_async: true)
Response:
{
  "code": 0,
  "execute_id": "74248231384xxxx",
  "debug_url": "...",
  "msg": "Success"
}

GET https://api.coze.cn/v1/workflows/{workflow_id}/run_histories/{execute_id}
Headers: Authorization: Bearer pat_xxxx
Response:
{
  "code": 0,
  "data": [{
    "execute_status": "Success",
    "output": "...",
    "debug_url": "...",
    ...
  }]
}
```

### Cost Model

- LLM/VLM nodes (大模型节点) charge per model token
- Image generation nodes charge per call
- Partial workflow failure still bills successfully executed paid nodes
- Costs are deducted from Coze subscription points/credits

### Credentials Required

| Variable | Description | Source |
|---|---|---|
| `COZE_PAT` | Personal Access Token for API auth | Coze → Settings → API Tokens |
| `COZE_QUALITY_WORKFLOW_ID` | Workflow ID of the deployed quality review workflow | Coze workflow deployment page |

## Decision

### Slice 7K scope (this spike)

1. Implement a real `cozeQualityWorkflowAdapter` that calls the Coze workflow API via sync mode.
2. Add `isCozeQualityWorkflowAvailable()` to check both `COZE_PAT` and `COZE_QUALITY_WORKFLOW_ID` env vars (instead of hardcoded `false`).
3. Keep the adapter **disabled by default** — both env vars must be explicitly set to activate.
4. Map Coze API response to existing `ImageQualityReviewResult` contract.
5. Add timeout, error handling, and `rawTraceUrl` (from `debug_url`) capture.
6. **Do NOT** create the actual Coze workflow, call real VLM, or incur costs.

### Not in this slice

- Creating the actual Coze workflow (requires manual work in Coze web IDE)
- Activating the adapter (env vars are not set)
- Real VLM calls
- Cost analysis with actual data
- Retry/circuit-breaker policy tuning

### Future slices

- **Slice 7L**: Create the actual Coze low-code workflow with VLM node
- **Slice 7M**: Activate the adapter (set env vars, end-to-end test with one real image)
- **Slice 7N**: Tune thresholds, retry policy, cost monitoring

## Consequences

- The real adapter adds ~100 lines of HTTP call + response mapping code
- `isCozeQualityWorkflowAvailable()` becomes env-var driven, so mock is still the default
- No new dependencies (uses Node.js built-in `fetch`)
- The `rawTraceUrl` from Coze's `debug_url` can be surfaced in the debug UI panel for deeper inspection
- Async mode integration is deferred — sync mode is sufficient for a single VLM call (typically 5-30 seconds)
