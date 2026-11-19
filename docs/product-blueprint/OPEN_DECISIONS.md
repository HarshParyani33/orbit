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
**Approved: Next.js App Router for `apps/marketing`.** Select a currently supported stable Next.js version when implementation begins; do not pin the product decision to Next.js 14.

*Sign-Off Status:* `APPROVED BY PRODUCT OWNER`

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
**Approved direction: defer voice implementation to a later milestone while preparing provider-neutral voice interfaces now.** Do not commit to Twilio, Groq Whisper or Cartesia as final vendors until a later cost, latency, regional availability and quality evaluation.

*Sign-Off Status:* `APPROVED — DEFER IMPLEMENTATION; ARCHITECTURE PREPARATION ONLY`

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
**Approved: Native PostgreSQL `pgvector`.** Keep vectors within the tenant-scoped PostgreSQL security boundary; validate performance with representative data before making latency guarantees.

*Sign-Off Status:* `APPROVED BY PRODUCT OWNER`

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
**Approved: Path-based workspace routing with reserved slugs.**

*Sign-Off Status:* `APPROVED BY PRODUCT OWNER`

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
**Approved: Native integration adapters in `packages/integrations`.** Keep provider-specific capabilities behind stable interfaces; prioritize connectors based on customer demand and maintenance cost.

*Sign-Off Status:* `APPROVED BY PRODUCT OWNER`

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
**Approved: Subscription credits reset monthly; purchased top-up credits do not expire.** Maintain separate ledger buckets and define refund, chargeback, account-closure and regulatory treatment before launch.

*Sign-Off Status:* `APPROVED BY PRODUCT OWNER`

---

## 7. Decision 7: Platform Super-Admin Hosting Isolation

### Context
Hosting architecture for `apps/admin` (Surface C).

### Options
*   **Approved: Fully segregated owner-admin application on `admin.orbit.com`.**
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
| **1. Marketing Site** | Next.js App Router (supported stable version) | Low | Depends on hosting | `APPROVED` |
| **2. Voice AI Engine** | Defer implementation; provider-neutral interfaces now | Medium | To be evaluated later | `APPROVED — DEFERRED` |
| **3. Vector Retrieval** | Native PostgreSQL pgvector | Low | Included in database hosting | `APPROVED` |
| **4. Ingress Routing** | Path-based (`app.orbit.com/:slug`) | Low | Depends on hosting | `APPROVED` |
| **5. Integrations** | Native provider adapters | Medium | Connector-dependent | `APPROVED` |
| **6. Credit Expiry** | Monthly subscription reset / purchased top-ups never expire | Medium | Credit liability must be tracked | `APPROVED` |
| **7. Admin App Hosting**| Separate protected `admin.orbit.com` application | Low | Depends on hosting and access controls | `APPROVED` |
