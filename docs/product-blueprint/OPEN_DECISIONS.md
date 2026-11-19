# Orbit Open Architecture & Product Decisions
## Strategic Trade-Offs & Architectural Decisions Requiring Product-Owner Approval

**Document ID:** `DECISIONS-20261119-ORBIT-V1`  
**Status:** Pending Product-Owner Review & Sign-Off  
**Audited Baseline:** Milestone 0 (M0) Master Architecture Blueprint

---

## 1. Decision 1: Public Marketing Framework (`apps/marketing`)

### Context
Orbit requires a high-performance, SEO-optimized public website (Surface A) that achieves perfect Lighthouse scores, renders interactive ROI calculators, and supports fast dynamic sitemap generation.

### Options
*   **Option A: Next.js 14 (App Router / React Server Components):**
    *   *Pros:* Shares React component libraries and Tailwind tokens with `apps/web`; built-in SSR/SSG; robust ecosystem for analytics and Stripe checkout redirects.
    *   *Cons:* Node.js runtime required for SSR; heavier bundle footprint than pure static sites.
*   **Option B: Astro 4:**
    *   *Pros:* Zero-JavaScript by default; extraordinary Lighthouse performance; islands architecture allowing React components only for interactive widgets (ROI calculator).
    *   *Cons:* Separate templating syntax; cannot share full component trees directly without adaptation.

### Technical Recommendation
**Option A (Next.js 14 App Router):** Monorepo code sharing with `packages/ui` and `packages/validation` heavily outweighs the marginal performance difference.

*Sign-Off Status:* `PENDING OWNER APPROVAL`

---

## 2. Decision 2: AI Voice Telephony Engine Architecture

### Context
Voice AI support requires sub-second conversational latency (<1,200ms) with seamless human transfer capabilities.

### Options
*   **Option A: Twilio Voice SIP + Custom Media Stream (Groq Whisper + OpenAI + Cartesia):**
    *   *Pros:* Maximum control over latency; lowest cost per minute (\$0.0128/min); direct access to streaming audio bytes for interruption handling.
    *   *Cons:* Substantial engineering complexity in managing WebSocket media streams and audio buffering.
*   **Option B: Managed Conversational AI Platform (LiveKit / Bland.ai / Retell AI):**
    *   *Pros:* Turnkey telephony, built-in interruption detection, faster time-to-market.
    *   *Cons:* High vendor lock-in; significantly higher per-minute cost (\$0.08 - \$0.14/min), compressing gross margins below 60%.

### Technical Recommendation
**Option A (Twilio Voice SIP + Groq Whisper + Cartesia):** Preserves target gross margins (>80%) and enables custom written briefing generation upon human transfer.

*Sign-Off Status:* `PENDING OWNER APPROVAL`

---

## 3. Decision 3: Vector Database Engine for Knowledge Retrieval (RAG)

### Context
Knowledge retrieval powers the autonomous Support Agent and Pulse AI. Orbit currently uses `pgvector` inside PostgreSQL 16.

### Options
*   **Option A: Continue with Native PostgreSQL `pgvector`:**
    *   *Pros:* Zero additional infrastructure; transactional consistency; RLS tenant isolation applies directly to vector embeddings; lowest operational complexity.
    *   *Cons:* Slower indexing on massive scale (10M+ vectors); index build times can consume database RAM.
*   **Option B: Dedicated Managed Vector DB (Pinecone / Qdrant):**
    *   *Pros:* Optimized HNSW index scaling; specialized vector query caching.
    *   *Cons:* Additional cloud cost (\$70 - \$200/mo); duplicate data synchronization; tenant isolation must be manually enforced in external application logic.

### Technical Recommendation
**Option A (Native PostgreSQL `pgvector`):** At current and projected scale (<1M chunks across 500 tenants), pgvector using `HNSW` indexes performs sub-25ms vector searches and keeps RLS security uncompromised.

*Sign-Off Status:* `PENDING OWNER APPROVAL`

---

## 4. Decision 4: Multi-Tenant Ingress Subdomain Architecture

### Context
How users navigate to their isolated business workspace.

### Options
*   **Option A: Path-Based Routing (`app.orbit.com/:organizationSlug`):**
    *   *Pros:* Simplest SSL certificate setup (single wildcard cert); unified cookie sharing across workspaces for multi-org users; instant tenant switching.
    *   *Cons:* Potential URL collision if slugs are reserved words (e.g., `/settings`, `/billing`).
*   **Option B: Wildcard Subdomains (`:organizationSlug.orbit.com`):**
    *   *Pros:* Clean visual branding for enterprise clients; strict origin boundary.
    *   *Cons:* Complex cookie sharing for cross-workspace users; wildcard SSL management; CORS complexity across origins.

### Technical Recommendation
**Option A (Path-Based Routing with Reserved Slugs):** Simplifies multi-tab session coordination, simplifies authentication cookies, and matches modern SaaS standards (Notion, Slack).

*Sign-Off Status:* `PENDING OWNER APPROVAL`

---

## 5. Decision 5: E-Commerce Integrations Strategy

### Context
Connecting to 57+ platforms across Commerce, Shipping, Returns, and Payments.

### Options
*   **Option A: Custom Native Connectors in `packages/integrations`:**
    *   *Pros:* Zero middleman costs; deep control over specialized DTC workflows (e.g., store credit refunds, reverse logistics NDRs); no third-party data privacy exposure.
    *   *Cons:* Requires ongoing maintenance of individual third-party API version changes.
*   **Option B: Unified Integration Aggregator (Merge.dev / Rutter / Unified.to):**
    *   *Pros:* Single API to connect Shopify, WooCommerce, ShipStation.
    *   *Cons:* Prohibitive enterprise pricing (\$500 - \$2,000/mo base + per-sync fees); generic lowest-common-denominator data schemas that lack custom shipping and return actions.

### Technical Recommendation
**Option A (Custom Native Connectors):** Essential DTC actions (e.g., Shiprocket NDR re-attempts, Razorpay partial refunds) are unsupported by generic aggregators. Native connectors preserve our core competitive advantage.

*Sign-Off Status:* `PENDING OWNER APPROVAL`

---

## 6. Decision 6: Credit Top-up Expiration Policy

### Context
Merchants on the Growth plan (\$99.99/mo) receive 7,500 monthly subscription credits and can buy one-time top-up packs.

### Options
*   **Option A: Subscription Credits Reset Monthly; Purchased Top-Up Credits Never Expire:**
    *   *Pros:* Industry standard (Twilio, OpenAI); highly merchant-friendly; eliminates billing support complaints.
    *   *Cons:* Platform maintains standing credit liability on balance sheet.
*   **Option B: All Credits Expire After 12 Months:**
    *   *Pros:* Limits long-term platform liability.
    *   *Cons:* Requires automated reminder emails; friction with enterprise procurement.

### Technical Recommendation
**Option A (Subscription Resets Monthly; Top-Ups Never Expire):** Maximizes merchant trust and conversion during self-serve upgrades.

*Sign-Off Status:* `PENDING OWNER APPROVAL`

---

## 7. Decision 7: Platform Super-Admin Hosting Isolation

### Context
Hosting architecture for `apps/admin` (Surface C).

### Options
*   **Option A: Fully Segregated Subdomain & Port (`admin.orbit.com`):**
    *   *Pros:* Physical and network isolation; distinct IP allowlists (Cloudflare Access / VPN required); separate JWT secrets and separate database role (`orbit_admin`).
    *   *Cons:* Requires separate deployment pipeline and DNS records.
*   **Option B: Internal Protected Route inside Workspace App (`app.orbit.com/admin`):**
    *   *Pros:* Single build artifact.
    *   *Cons:* Severe security risk; single XSS vulnerability in workspace could target administrative endpoints.

### Technical Recommendation
**Option A (Fully Segregated Subdomain `admin.orbit.com`):** Absolute prerequisite for SOC2 compliance and zero-trust security.

*Sign-Off Status:* `PENDING OWNER APPROVAL`

---

## 8. Summary Table of Architecture Decisions

| Decision Area | Recommended Option | Risk Level | Cost Impact | Product Owner Approval |
| :--- | :--- | :---: | :---: | :---: |
| **1. Marketing Site** | Next.js 14 App Router | Low | \$0 (Shared compute) | `PENDING` |
| **2. Voice AI Engine** | Twilio SIP + Groq Whisper + Cartesia | Medium | 80%+ Gross Margin | `PENDING` |
| **3. Vector Retrieval** | Native PostgreSQL pgvector | Low | \$0 (In-database) | `PENDING` |
| **4. Ingress Routing** | Path-based (`app.orbit.com/:slug`) | Low | \$0 | `PENDING` |
| **5. Integrations** | Custom Native Connectors | Medium | Saves \$1,500+/mo | `PENDING` |
| **6. Credit Expiry** | Monthly Sub Resets / Top-Ups Never Expire | Low | None | `PENDING` |
| **7. Admin App Hosting**| Dedicated `admin.orbit.com` with Zero-Trust | Low | \$0 | `PENDING` |
