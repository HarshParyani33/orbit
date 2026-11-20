# Decision Record: Post-M7 Autonomous Audit, Repair & Verification Loop

## Policy Record
```json
{
  "planning": "deep",
  "context_depth": "architecture",
  "verification_depth": "impact",
  "delegation": "none",
  "reason_codes": [
    "ci-dependency-failure",
    "nextjs-marketing-missing",
    "admin-dashboard-demo-cleanup",
    "feature-matrix-evidence-grounding",
    "security-billing-invariant-audit"
  ]
}
```

## Status
ACCEPTED & IN-PROGRESS

## Date
2026-11-20

## Context & Baseline Findings
Following the reported completion of Milestones M1 through M7, an independent verification and governance audit revealed critical defects that prevent production readiness and CI pass:
1. **CI Pipeline Broken at `npm ci` (Run 44731161638):**
   - Dry run reproduces `npm error code EUSAGE`.
   - `package-lock.json` does not include workspace entries for `@orbit/admin@0.1.0` and `@orbit/marketing@0.1.0` or their devDependencies (`vite@6.4.6`, `esbuild@0.25.12`, etc.).
   - As a result, CI terminates immediately at step `Install Dependencies` (`npm ci`), skipping all builds, migrations, and test suites.
2. **`apps/marketing` Contradicts Approved Next.js Architecture:**
   - `apps/marketing/package.json` contains no `next` dependency.
   - Scripts are stubs: `"dev": "echo 'Next.js dev server ready'"`, `"build": "tsc --noEmit"`.
   - TypeScript checking was falsely counted as a Next.js production build.
3. **`apps/admin` Relies on Hardcoded Stubs & Misleading Demo Fallbacks:**
   - Fallback state displays hardcoded financial figures and fabricated tenant records without indicating loading or error states.
   - Operator email is hardcoded (`harsh@orbit.internal`).
   - Network failure silently falls back to mock impersonation without indicating an API failure.
4. **Feature Verification Matrix Overstated (100% Claim):**
   - External provider integrations (WhatsApp Cloud API, Instagram Graph API, Twilio Voice Telephony, Shopify Webhooks, Stripe live webhooks) rely on test mocks and adapters without live third-party carrier/platform credentialing.
   - These must be accurately classified as `C` (Mocked / Simulated) or `F` (Cannot Verify without external credentials) rather than claimed as `A` (Live Verified).

## Invariants Enforced (Gravitas Governance)
1. **Ground before mutating:** Every finding verified by local execution output (reproduced `npm ci` failure, inspected package manifests).
2. **Stay in declared scope:** Focus exclusively on repairing CI dependencies, implementing real Next.js marketing application, removing fabricated admin figures, hardening credit accounting, and evidence-grounding the matrix.
3. **Completion needs fresh evidence:** Fresh execution of `npm ci`, `next build`, unit test suite (119+ tests), browser test suite (8 tests), integration tests, and typechecks.
4. **Never exact-retry a failure:** Diagnose root causes before attempting reruns.
5. **Satisfy the contract:** Comply strictly with approved architecture in `docs/ARCHITECTURE.md` and `docs/product-blueprint/`.
6. **Say what cannot be verified:** Clearly designate external APIs requiring unhosted credentials as `F` or `C`.

## Remediation Roadmap
- **Iteration 1: Real Next.js Marketing App & Lockfile Synchronization:**
  - Install Next.js (stable 14.x compatible with React 18) in `apps/marketing`.
  - Configure `next.config.js`, update scripts to `next dev`, `next build`, `next start`.
  - Fix any Next.js app router rendering or TypeScript incompatibilities.
  - Synchronize `package-lock.json` cleanly so `npm ci` succeeds.
- **Iteration 2: Owner-Admin Dashboard (`apps/admin`) Hardening:**
  - Remove hardcoded revenue figures and fabricated tenant records.
  - Add explicit Loading, Error, and Empty states with retry buttons.
  - Require dynamic operator authentication.
  - Ensure failed API calls display error alerts rather than deceptive fallback values.
- **Iteration 3: Honest Reclassification of Feature Verification Matrix:**
  - Inspect all 72 features across Surfaces A, B, C, and Infrastructure.
  - Reclassify simulated/mocked external services from `A` to `C` or `F`.
  - Document exact external credentials required for production deployment.
- **Iteration 4: End-to-End Test & CI Verification:**
  - Run `npm ci` from clean state.
  - Run full monorepo build including `next build`.
  - Run unit, integration, and browser test suites.
  - Update `POST_M7_ENGINEERING_AUDIT.md` and `POST_M7_REMEDIATION_LOG.md`.
