# Gravitas Decision Record: Milestone 2 Closure
## Core Helpdesk, Omnichannel Shared Inbox, Customer CRM & Business Hours Engine

**Record ID:** `DR-20261119-ORBIT-M2`  
**Date:** 2026-11-19  
**Status:** `VERIFIED & ACCEPTED`  
**Governance Mode:** Gravitas Autonomous Execution Loop  
**Audited Target Commit:** `86c8739`  

---

## 1. Context & Objectives

Milestone 2 (M2) evolves Project Orbit from the hardened multi-tenant security foundation delivered in Milestone 1 into a full-featured Business Workspace helpdesk cockpit with customer CRM and operating schedule automation.

Prior to Milestone 2, the web application provided only basic conversation listing and messaging without ticket queue statuses, private team note collaboration, customer identity deduplication/merging, or business hours management.

### Key Deliverables Completed:
1. **Master 3-Column Shared Inbox (`apps/web/src/pages/InboxPage.tsx`):**
   * Multi-queue ticket views: `ALL`, `IN_QUEUE`, `OPEN`, `REOPENED`, `SNOOZED`, `AWAITING`, `INVESTIGATING`, `ESCALATED`, `RESOLVED`, `CLOSED`.
   * Dual-mode message composer: "Public Reply" (external channel dispatch) vs "Private Team Note" (internal yellow card collaboration).
   * Keyboard shortcut `Alt+N` / `Cmd+N` toggle for private notes.
   * Grounded AI assist integration (`POST /api/ai/conversations/:id/suggest`).
2. **Unified Customer CRM Directory (`apps/web/src/pages/CustomersPage.tsx`):**
   * Searchable customer table with real-time query filtering across names, emails, phones, and external channel IDs.
   * Customer Profile slide-over drawer with multi-channel identity graph and interaction history.
   * Customer merge workflow (`POST /api/customers/:id/merge`) with pre-merge snapshot auditing.
3. **Multi-Tenant Business Hours Engine:**
   * Backend service (`apps/api/src/organizations/business-hours.service.ts`) evaluating operating schedules against arbitrary timezones.
   * REST endpoints (`GET/PUT /api/organizations/:id/business-hours`, `GET /api/organizations/:id/business-hours/status`).
   * Frontend settings interface (`apps/web/src/pages/SettingsPage.tsx`) with timezone selection, daily schedule controls, and live status badge.
4. **Production Object Storage (`packages/integrations/src/storage/s3-storage.provider.ts`):**
   * S3 and Cloudflare R2 compatible object storage provider.
   * Path traversal defense and strict key sanitization.
   * Node-native AWS SigV4 request signing.
5. **Team & Workspace Management:**
   * Member directory and invite form with role assignment (`OWNER`, `ADMIN`, `MEMBER`).

---

## 2. Invariant Compliance Audit

| Invariant | Status | Verification Evidence |
| :--- | :---: | :--- |
| **1. Ground before mutating** | PASS | Inspected existing Prisma models, conversation service, customer service, and UI components before modifications. |
| **2. Stay in declared scope** | PASS | Focused exclusively on Milestone 2 deliverables (Inbox, CRM, Business Hours, S3 Storage, Team Management). |
| **3. Completion needs fresh evidence** | PASS | Freshly executed: 69 passing unit tests (12 test suites), 8 passing browser tests, clean monorepo `typecheck`, and clean `npm run build` across all 11 packages and apps. |
| **4. Never exact-retry a failure** | PASS | Diagnosed customer merge return property mismatch (`mergedCustomerId`) and resolved assertion before successful test re-run. |
| **5. Satisfy the contract** | PASS | Preserved PostgreSQL RLS tenant boundaries (`runWithTenant`), role-based authorization, and envelope encryption integrity. |
| **6. Say what cannot be verified** | PASS | Live cloud S3 bucket writes and live Meta Cloud API responses remain simulated via test credentials and unit mocks; local fallback and SigV4 signing are verified. |

---

## 3. Architecture & Security Decisions

### ADR-M2-01: Private Team Notes Isolation
* **Decision:** Team notes are persisted with `senderType: 'NOTE'`. In `ConversationsService.createMessage`, incoming messages with `senderType: 'NOTE'` are explicitly excluded from invoking external channel adapters (`WhatsAppAdapter`, `InstagramAdapter`).
* **Security Rationale:** Guarantees that internal discussions, sensitive customer flags, and operational notes cannot leak to end customers across WhatsApp or Instagram.

### ADR-M2-02: Atomic Customer Merge with Pre-Flight Snapshots
* **Decision:** Customer merge executes atomically within a tenant-scoped transaction (`runWithTenant`). Before re-parenting channel identities and conversations, an immutable JSON snapshot of the source customer's state is captured in `CustomerMergeAudit`.
* **Security Rationale:** Prevents data loss during merges, prevents cross-tenant identity hijacking, and maintains an unalterable audit trail of customer identity unification.

### ADR-M2-03: S3 / Cloudflare R2 Object Storage Provider
* **Decision:** Implemented `S3StorageProvider` implementing `IStorageProvider` using pure Node `crypto` and `fetch` with AWS SigV4 signing, avoiding heavy external SDK dependencies.
* **Security Rationale:** Enforces strict regex validation `^[a-zA-Z0-9_.\-\/]+$` and rejects path traversal sequences (`..`, `.`, null bytes), preventing arbitrary file overwrites.

---

## 4. Verification Evidence Summary

```text
Test Suites:
  ✓ tests/unit/s3-storage.spec.ts (4 tests)
  ✓ tests/unit/business-hours.spec.ts (5 tests)
  ✓ tests/unit/ticket-lifecycle-and-notes.spec.ts (3 tests)
  ✓ tests/unit/customer-merge-lifecycle.spec.ts (3 tests)
  ✓ tests/unit/rate-limiter.spec.ts (4 tests)
  ✓ tests/unit/envelope-encryption.spec.ts (5 tests)
  ✓ tests/unit/resilient-ai-gateway.spec.ts (4 tests)
  ✓ tests/unit/password-recovery.spec.ts (3 tests)
  ✓ tests/unit/knowledge-client.spec.ts (6 tests)
  ✓ tests/unit/client-refresh.spec.ts (6 tests)
  ✓ tests/unit/cross-tab-refresh.spec.ts (18 tests)
  ✓ tests/unit/config-jwt.spec.ts (8 tests)

  Total: 69 passed (12 test suites)

Browser Tests:
  ✓ tests/browser/cross-tab-refresh.browser.spec.ts (8 tests passed)

Compilation & Builds:
  ✓ npm run typecheck: 0 errors
  ✓ npm run build: 11/11 workspaces built successfully
```
