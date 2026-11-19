# Gravitas Decision Record: Milestone 3 Closure
## AI Workforce Studio, Response Guard & Credit Ledger

**Record ID:** `DR-20261119-ORBIT-M3`  
**Date:** 2026-11-19  
**Status:** `VERIFIED & ACCEPTED`  
**Governance Mode:** Gravitas Autonomous Execution Loop  
**Audited Target Commit:** `cbf7bfa`  

---

## 1. Context & Objectives

Milestone 3 (M3) establishes complete governance, safety controls, and financial solvency over the AI engine within the multi-tenant Business Workspace.

Prior to Milestone 3, AI suggestions ran without wallet balance enforcement (allowing potential runaway token consumption), lacked competitor blacklisting/PII guardrails, had no developer API key generation, and lacked a dedicated AI Workforce persona management studio.

### Key Deliverables Completed:
1. **AI Workforce Studio UI (`apps/web/src/pages/AiAgentsPage.tsx`):**
   * Multi-persona management: Chat Support Agent, Voice Telephony Agent, and Social Community Agent.
   * Persona builder: System instructions, multi-provider model selection (`gpt-4o-mini`, `gpt-4o`, `llama-3.1-70b-versatile`, `mistral-large-2407`), temperature slider, and channel toggles.
2. **Response Guard & Safety Studio:**
   * Competitor blacklist enforcement: If a customer query mentions a blacklisted competitor (e.g., Zendesk, Freshdesk), AI generation bypasses auto-reply and routes immediately to human agent escalation.
   * Supervised Agent Review Mode: Drafts grounded responses in the shared inbox for agent approval before sending.
   * Automated PII redaction and citation grounding verification.
3. **Double-Entry Credit Ledger & Wallet (`apps/web/src/pages/BillingPage.tsx`):**
   * Pre-flight wallet balance check: If a tenant's token allowance is exhausted (`<= 0`), AI execution fails closed with `INSUFFICIENT_CREDITS` and escalates to human staff.
   * Post-flight atomic deduction: Debits tokens consumed directly from `Subscription.aiTokenAllowance`.
   * Non-expiring top-up credits: Purchased credit packs (+25,000, +50,000, +150,000) persist across billing cycle resets.
4. **Developer REST API Keys & Outbound Webhooks:**
   * Cryptographic API key generation (`orb_live_<32 hex>`) with SHA-256 hash storage and scoped permissions (`inbox:read`, `inbox:write`, `ai:suggest`).
   * Outbound webhook subscriptions with HMAC-SHA256 signature verification headers (`X-Orbit-Signature-256`).

---

## 2. Invariant Compliance Audit

| Invariant | Status | Verification Evidence |
| :--- | :---: | :--- |
| **1. Ground before mutating** | PASS | Inspected existing `AiService`, `BillingService`, and schema relationships before changes. |
| **2. Stay in declared scope** | PASS | Scoped strictly to Milestone 3 deliverables (AI Studio, Response Guard, Billing Wallet, API Keys). |
| **3. Completion needs fresh evidence** | PASS | Freshly executed: 74 passing unit tests (15 test suites), 8 passing browser tests, clean monorepo `typecheck`, and clean `npm run build` across all 11 packages and apps. |
| **4. Never exact-retry a failure** | PASS | Diagnosed dynamic mock resolution for wallet allowance in unit test and resolved before re-run. |
| **5. Satisfy the contract** | PASS | Preserved PostgreSQL RLS tenant boundaries, fail-closed safety, and envelope encryption integrity. |
| **6. Say what cannot be verified** | PASS | Live Stripe checkout webhook redirects and live vendor LLM billing account charges remain simulated via test credentials and unit mocks. |

---

## 3. Architecture & Security Decisions

### ADR-M3-01: Zero-Credit Fail-Closed Invariant
* **Decision:** In `AiService.generateSuggestion`, Phase 1 executes an atomic pre-flight check against the tenant's `Subscription`. If `aiTokenAllowance <= 0`, the system halts external LLM dispatch and returns `bypassed: true`, `reason: 'INSUFFICIENT_CREDITS'`, and `escalatedToHuman: true`.
* **Security Rationale:** Protects against unbounded financial liability and runaway provider API costs when tenant credits expire.

### ADR-M3-02: Response Guard Policy Enforcement
* **Decision:** Competitor blacklists and supervised review flags in `AiConfiguration.policyRules` are evaluated prior to LLM invocation. Customer messages referencing blacklisted entities bypass automated responses and route to human tier 2 agents.
* **Security Rationale:** Prevents AI from acknowledging, comparing, or hallucinating competitor terms in customer-facing communication.

### ADR-M3-03: Scoped API Key Storage & Hashing
* **Decision:** Raw API keys (`orb_live_...`) are returned to the user exactly once upon generation. Only the SHA-256 hash `tokenHash` is persisted in the database.
* **Security Rationale:** Standard cryptographic credential isolation—a database dump cannot leak usable API keys.

---

## 4. Verification Evidence Summary

```text
Test Suites:
  ✓ tests/unit/zero-credit-enforcement.spec.ts (2 tests)
  ✓ tests/unit/response-guard-safety.spec.ts (1 test)
  ✓ tests/unit/developer-api-keys.spec.ts (2 tests)
  ✓ tests/unit/ticket-lifecycle-and-notes.spec.ts (3 tests)
  ✓ tests/unit/customer-merge-lifecycle.spec.ts (3 tests)
  ✓ tests/unit/s3-storage.spec.ts (4 tests)
  ✓ tests/unit/business-hours.spec.ts (5 tests)
  ✓ tests/unit/rate-limiter.spec.ts (4 tests)
  ✓ tests/unit/envelope-encryption.spec.ts (5 tests)
  ✓ tests/unit/resilient-ai-gateway.spec.ts (4 tests)
  ✓ tests/unit/password-recovery.spec.ts (3 tests)
  ✓ tests/unit/knowledge-client.spec.ts (6 tests)
  ✓ tests/unit/client-refresh.spec.ts (6 tests)
  ✓ tests/unit/cross-tab-refresh.spec.ts (18 tests)
  ✓ tests/unit/config-jwt.spec.ts (8 tests)

  Total: 74 passed (15 test suites)

Browser Tests:
  ✓ tests/browser/cross-tab-refresh.browser.spec.ts (8 tests passed)

Compilation & Builds:
  ✓ npm run typecheck: 0 errors
  ✓ npm run build: 11/11 workspaces built successfully
```
