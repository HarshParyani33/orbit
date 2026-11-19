# Decision Record: Milestone 4 (M4) — E-Commerce Connectors & Support Analytics Suite

## Status
ACCEPTED & IN-PROGRESS

## Date
2026-11-19

## Context & Problem Statement
Project Orbit is progressing through its autonomous roadmap toward full SaaS functional parity with the SagePilot enterprise benchmark. In Milestone 3, we hardened the AI Workforce Studio, Response Guard safety system, Zero-Credit fail-closed protocol, and developer API key infrastructure.

In Milestone 4, customer support teams need deep e-commerce context right within their workflow, and business leadership requires comprehensive operational visibility across 10 specialized business intelligence dashboards.

Specifically:
1. Support agents working customer inquiries must see live Shopify orders, shipment tracking numbers, fulfillment statuses, and have one-click powers to issue refunds or cancellations directly from the Inbox without switching tabs.
2. For delayed or failed deliveries, courier logistics (e.g. Shiprocket) must expose real-time AWB status and NDR (non-delivery report) re-attempt scheduling.
3. Leadership and managers require the 10 support analytics dashboards:
   - Dashboard 1: Open Tickets Overview (backlog, priority, sub-status, age distribution).
   - Dashboard 2: Performance & TAT (AI vs Human FRT and MTTR, SLA adherence).
   - Dashboard 3: Ticket Trends (volume over time, message type breakdown).
   - Dashboard 4: Workforce Analytics (agent workload, queue wait times, median response times).
   - Dashboard 5: AI Deflection Trends (daily AI vs Human resolved tickets, deflection % curve).
   - Dashboard 6: Busiest Times Heatmap (24-hour x 7-day conversation activity).
   - Dashboard 7: CSAT Analytics (direct survey vs AI-inferred CSAT, 1-5 star distribution, agent leaderboard).
   - Dashboard 8: Touchpoints Funnel (interactions-to-resolution distribution).
   - Dashboard 9: Social Analytics (inbound comments, auto-replies, escalation to DM, moderation).
   - Dashboard 10: Marketing Journey & Campaign Status (delivered, read, converted, failed).

## Gravitas Invariants Enforced
1. **Ground before mutating:** Inspected existing database schema, Prisma models, existing customer profile pane, and API module structure before adding new services.
2. **Stay in declared scope:** Focus exclusively on Milestone 4 deliverables: Commerce Connectors (Shopify, Couriers), Commerce Action UI in Inbox, and the 10 Analytics Dashboards.
3. **Completion needs fresh evidence:** Require new unit tests for commerce adapters, webhook verification, analytics aggregation queries, plus full TypeScript typechecking and monorepo bundling.
4. **Never exact-retry a failure:** Systematically inspect errors and fix root causes if any compile or test errors occur.
5. **Satisfy the contract:** All analytics queries must be tenant-isolated via PostgreSQL RLS or explicit `organizationId` filtering; all commerce credentials must be protected.
6. **Say what cannot be verified:** Note where live Shopify/Shiprocket API keys require production store credentials, providing verified mock/adapter modes with HMAC verification and live contract compliance.

## Architecture & Technical Decisions

### 1. Commerce Connector Layer (`packages/integrations/src/commerce`)
- `ShopifyCommerceAdapter`:
  - Methods: `getCustomerOrders(emailOrPhone)`, `getOrderById(orderId)`, `cancelOrder(orderId, reason)`, `refundOrder(orderId, amount, note)`, `verifyWebhookSignature(rawBody, signature, secret)`.
  - Production-ready HMAC-SHA256 signature verification matching Shopify webhook standards (`X-Shopify-Hmac-Sha256`).
- `CourierLogisticsAdapter`:
  - Methods: `trackShipment(awbNumber)`, `scheduleNdrReattempt(awbNumber, preferredDate, instructions)`.
  - Normalizes tracking events into standard statuses: `ORDER_PLACED`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`, `NDR_EXCEPTION`, `RETURNED_TO_ORIGIN`.

### 2. NestJS Commerce Module (`apps/api/src/commerce`)
- Multi-tenant service scoped to active organization.
- Endpoints:
  - `GET /api/commerce/orders`: Fetch orders associated with a customer email/phone or active conversation.
  - `POST /api/commerce/orders/:orderId/refund`: Atomically issue partial/full refund.
  - `POST /api/commerce/orders/:orderId/cancel`: Cancel order with documented cancellation reason.
  - `POST /api/commerce/shipments/track`: Fetch live carrier milestones and tracking history.
  - `POST /api/commerce/shipments/ndr-reattempt`: Submit NDR reschedule instruction.
  - `POST /api/commerce/webhooks/shopify`: Webhook endpoint with HMAC verification.

### 3. NestJS Analytics Module (`apps/api/src/analytics`)
- Aggregates conversation and message data scoped strictly to `organizationId`.
- Provides specialized rollup endpoints:
  - `GET /api/analytics/overview`: Backlog counts, priority distribution, age buckets (`0-24h`, `1-2d`, `1w-1m`, `>1m`).
  - `GET /api/analytics/performance-tat`: AI vs Human First Response Time (FRT), Mean Time To Resolution (MTTR), SLA compliance rate.
  - `GET /api/analytics/ticket-trends`: Date-sliced ticket volume, sender distribution (`CUSTOMER`, `AGENT`, `AI`, `NOTE`).
  - `GET /api/analytics/workforce`: Agent resolution metrics, workload, queue wait times.
  - `GET /api/analytics/deflection`: Autonomous AI resolution rate, deflection curve over time.
  - `GET /api/analytics/busiest-heatmap`: 7-day x 24-hour activity matrix.
  - `GET /api/analytics/csat`: Survey vs Inferred CSAT ratings, 1-5 star counts, agent ranking.
  - `GET /api/analytics/touchpoints`: Touchpoints funnel (1, 2-3, 4-6, 7+ touches).
  - `GET /api/analytics/social`: Social comment handling, moderation rate, DM conversions.
  - `GET /api/analytics/campaigns`: Campaign delivery and conversion statistics.

### 4. Frontend Business Workspace (`apps/web`)
- `CustomerCommercePane.tsx`: Embedded inside the right context drawer of `InboxPage.tsx`. Shows live Shopify order details, items, fulfillment badges, courier tracking timeline, and one-click Cancel / Refund / NDR re-attempt modal triggers.
- `AnalyticsPage.tsx`: Full-featured enterprise support BI dashboard with tabbed navigation across all 10 dashboards, date range filtering (`TODAY`, `7D`, `30D`, `90D`), KPI summary cards, visual charts, and CSV data export.
- Connected to workspace navigation bar (`apps/web/src/components/Navbar.tsx`) and application router (`apps/web/src/App.tsx`).
