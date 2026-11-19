# Decision Record: Milestone 5 (M5) — Social Media Engagement, Pulse AI & MCP Server

## Status
ACCEPTED & IN-PROGRESS

## Date
2026-11-19

## Context & Problem Statement
With Milestone 4 complete (Commerce connectors, Shopify order actions in Inbox, and the 10-dashboard Support BI Suite), Project Orbit needs three advanced capabilities to achieve full parity with SagePilot:
1. **Social Media Engagement & Moderation:** Modern brands receive customer inquiries not just via private DMs (WhatsApp/Instagram DM) but publicly on Instagram Feed posts and Ad comments. Support agents need a specialized Social Inbox to view comments, run automated AI public replies, trigger automated "Initiate DM" private conversations for sensitive order inquiries, and perform instant moderation (Hide, Delete, Unhide) to protect brand reputation against spam/abuse.
2. **Pulse AI (Insights AI Assistant):** Workspace managers and founders need conversational business intelligence. Rather than manually clicking through dashboards, they require natural language querying ("Which channels drove the most tickets this week?", "Break down open tickets by age") with dynamic visual chart responses, along with CSV/Excel spreadsheet upload analysis (inventory stockouts, sales reports, shipment delays).
3. **Model Context Protocol (MCP) Server:** Professional teams work inside AI-native development environments (Claude Desktop, Cursor, ChatGPT). Project Orbit must expose a standardized JSON-RPC Model Context Protocol endpoint (`/api/mcp`) with token authentication that exposes tools (`search_conversations`, `get_customer_context`, `query_knowledge_base`, `get_support_metrics`).

## Gravitas Invariants Enforced
1. **Ground before mutating:** Inspected existing Instagram webhook receiver, database models, analytics service, and API controller layout.
2. **Stay in declared scope:** Focus strictly on Milestone 5: Social Engagement Engine, Pulse AI Conversational BI with CSV analysis, and MCP Server.
3. **Completion needs fresh evidence:** Require unit tests for Social comment moderation & DM escalation, Pulse AI natural language query parsing and CSV processing, and MCP JSON-RPC protocol compliance.
4. **Never exact-retry a failure:** Systematically inspect compile or test diagnostics before proceeding.
5. **Satisfy the contract:** All Pulse AI and MCP queries must strictly honor tenant RLS (`runWithTenant`) and verify active workspace authorization.
6. **Say what cannot be verified:** Clearly isolate external Meta Graph API calls using mockable adapters while fully implementing live signature verification and schema conformance.

## Architecture & Technical Decisions

### 1. Social Media Engagement Engine (`apps/api/src/social`)
- `SocialService`:
  - Methods: `getComments(orgId, filter)`, `postPublicReply(orgId, commentId, message)`, `initiateDm(orgId, commentId, initialMessage)`, `moderateComment(orgId, commentId, action: 'HIDE' | 'UNHIDE' | 'DELETE')`.
  - Automated toxic/spam moderation policy evaluation: Inbound comments flagged as abusive or competitor spam are automatically hidden with an audit trail.
  - "Initiate DM" converts public comment into a private 1-on-1 thread in the master Inbox, linking the Instagram customer profile.
- `SocialController`:
  - `GET /api/social/comments`: Filter by post, status (`PENDING`, `REPLIED`, `ESCALATED_TO_DM`, `HIDDEN`).
  - `POST /api/social/comments/:id/reply`: Post public reply.
  - `POST /api/social/comments/:id/initiate-dm`: Convert to private DM thread.
  - `POST /api/social/comments/:id/moderate`: Apply moderation action.

### 2. Pulse AI Conversational BI Assistant (`apps/api/src/pulse`)
- `PulseService`:
  - Methods: `querySupportData(orgId, prompt)`, `analyzeUploadedCsv(orgId, csvContent, filename, prompt)`.
  - Pre-built query intent matching:
    - Ticket age breakdown: Aggregates age buckets and returns chart payload.
    - Channel volume breakdown: Groups by channel and returns bar/pie chart data.
    - AI deflection rate: Computes deflection stats and returns metrics.
    - CSV/Spreadsheet parser: Parses CSV lines, computes summaries (row count, numeric columns, top categories), and generates split-view conversational summaries and charts.
- `PulseController`:
  - `POST /api/pulse/query`: Submit natural language question.
  - `POST /api/pulse/analyze-csv`: Upload CSV file/text for immediate analytical chart generation.

### 3. Model Context Protocol (MCP) Server (`apps/api/src/mcp`)
- Standard JSON-RPC 2.0 endpoint (`POST /api/mcp`):
  - Supported methods:
    - `initialize`: Returns server capabilities, info, and protocol version `2024-11-05`.
    - `tools/list`: Declares available tools (`search_conversations`, `get_customer_context`, `query_knowledge_base`, `get_support_metrics`).
    - `tools/call`: Executes specified tool within tenant context and returns content response.
  - Authenticated via workspace API key (`Authorization: Bearer orb_live_...` or `X-Orbit-API-Key`).

### 4. Frontend Workspace Surfaces (`apps/web`)
- `SocialInboxPage.tsx`: Dedicated social engagement cockpit displaying feed posts, comment streams, sentiment badges, public reply composer, "Initiate DM" action, and moderation quick actions (Hide/Delete).
- `PulseAiPanel.tsx`: Interactive split-view slide-over / page accessible throughout the workspace with natural language input, suggested prompt chips, interactive chart rendering, and CSV upload dropzone.
- Routing and navigation in `apps/web/src/components/Navbar.tsx` and `apps/web/src/App.tsx`.
