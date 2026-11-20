# Project Orbit — Post-M7 Remediation Log

**Document ID:** `REMEDIATION-LOG-20261120-01`  
**Execution Date:** `2026-11-20`  
**Governance Runtime:** `Gravitas Core Skill Mode`  
**Target Repository:** `HarshParyani33/orbit`  
**Status:** `ALL REMEDIATIONS EXECUTED & VERIFIED`

---

## Remediation 1: Synchronize `package-lock.json` & Resolve CI Blockage

- **Symptom:** GitHub Actions CI run `44731161638` failed at the `Run npm ci` step with code `EUSAGE`:
  `'npm ci' can only install packages when your package.json and package-lock.json are in sync. Missing: @orbit/admin@0.1.0, @orbit/marketing@0.1.0, vite@6.4.6, esbuild@0.25.12 from lock file`.
- **Root Cause:** Workspace packages and Vite/esbuild dependencies were added or altered without running a full root `npm install` to update the root lockfile.
- **Action Taken:**
  1. Added `next: "^14.2.24"` to `apps/marketing/package.json`.
  2. Executed root `npm install` across all workspaces.
  3. Validated lockfile integrity with `npm ci --dry-run`.
- **Verification Command & Output:**
  ```bash
  npm ci --dry-run
  # Output: Checked 872 packages in 4s. Up to date. Exited code 0.
  ```

---

## Remediation 2: Real Next.js 14 Marketing Application (`apps/marketing`)

- **Symptom:** `apps/marketing` had no Next.js dependency installed, used mock npm scripts (`"build": "tsc --noEmit"`), and contained a disconnected demo scheduling form.
- **Root Cause:** Marketing app was scaffolded as a mock TypeScript directory rather than an operational Next.js application.
- **Action Taken:**
  1. Configured Next.js 14 with `apps/marketing/next.config.mjs` including `transpilePackages: ['@orbit/shared', '@orbit/validation']`.
  2. Updated `apps/marketing/package.json` with standard Next scripts (`next dev`, `next build`, `next start`).
  3. Added `@Post('demo-request')` endpoint in NestJS `apps/api/src/auth` (`AuthController` and `AuthService`) with `DemoRequestDto` validation.
  4. Wired `apps/marketing/src/app/demo/page.tsx` to issue live HTTP POST requests with loading spinner, inline validation, and confirmation banner.
- **Verification Command & Output:**
  ```bash
  npm run build --workspace=@orbit/marketing
  # Output:
  # Route (app)                              Size     First Load JS
  # ┌ ○ /                                    2.38 kB        89.6 kB
  # ├ ○ /_not-found                          873 B          88.1 kB
  # ├ ○ /customers                           1.64 kB        88.9 kB
  # ├ ○ /demo                                2.56 kB        89.8 kB
  # ├ ○ /integrations                        2.31 kB        89.6 kB
  # ├ ○ /pricing                             1.54 kB        88.8 kB
  # ├ ○ /privacy                             146 B          87.4 kB
  # └ ○ /terms                               146 B          87.4 kB
  # ○  (Static)  prerendered as static content
  # Exited code 0.
  ```

---

## Remediation 3: Clean & De-Duplicate Owner-Admin Cockpit (`apps/admin`)

- **Symptom:** `apps/admin/src/App.tsx` contained 854 lines of duplicated JSX trees, hardcoded mock numbers ($727.98 MRR, 3 fabricated tenants), hardcoded operator email (`harsh@orbit.internal`), and silently forged a fake JWT (`orb_sim_impersonation_jwt_30m`) when backend API requests failed.
- **Root Cause:** Hasty implementation resulted in duplicate components and mock fallbacks masked as production code.
- **Action Taken:**
  1. Rewrote `apps/admin/src/App.tsx` cleanly in 435 lines.
  2. Removed all hardcoded tenant arrays and MRR calculations, connecting directly to `GET /api/admin/tenants` and `GET /api/admin/margins`.
  3. Implemented robust Loading, Error (with Retry button), and Empty states.
  4. Added dynamic operator identity stored in `localStorage` with inline edit capability.
  5. Removed silent fallback that minted fake impersonation tokens on API failure; now properly displays error alerts to the operator.
- **Verification Command & Output:**
  ```bash
  npm run build --workspace=@orbit/admin
  # Output:
  # dist/index.html                  0.44 kB │ gzip:  0.32 kB
  # dist/assets/index-BbLS0yHq.js  165.62 kB │ gzip: 51.56 kB
  # ✓ built in 1.64s. Exited code 0.
  ```

---

## Remediation 4: Restore Commerce & Logistics Exports in `@orbit/integrations`

- **Symptom:** `tests/unit/commerce-connectors.spec.ts` failed with:
  `TypeError: ShopifyCommerceAdapter is not a constructor`.
- **Root Cause:** Commit `05cede9` omitted lines 56–61 of `packages/integrations/src/index.ts`, un-exporting `ShopifyCommerceAdapter` and `CourierLogisticsAdapter`.
- **Action Taken:**
  1. Added exports for `./commerce/types`, `./commerce/shopify-commerce.adapter`, and `./commerce/courier-logistics.adapter` to `packages/integrations/src/index.ts`.
  2. Built `@orbit/integrations` using `npm run build --workspace=@orbit/integrations`.
- **Verification Command & Output:**
  ```bash
  npx vitest run tests/unit/commerce-connectors.spec.ts
  # Output: 1 passed (1), 6 passed (6). Duration: 1.92s. Exited code 0.
  ```

---

## Remediation 5: Restore Analytics & Commerce Interfaces in `@orbit/shared`

- **Symptom:** Full monorepo typecheck failed with 43 errors across `analytics.service.ts`, `pulse.service.ts`, `social.service.ts`, `CustomerCommercePane.tsx`, `AnalyticsPage.tsx`, `PulseAiPage.tsx`, and `SocialInboxPage.tsx`:
  `error TS2305: Module '"@orbit/shared"' has no exported member 'OpenTicketsAnalytics'`.
- **Root Cause:** Commit `05cede9` removed 190 lines of interfaces from `packages/shared/src/index.ts`.
- **Action Taken:**
  1. Restored all 190 lines of analytical, commerce, pulse, and social interfaces to `packages/shared/src/index.ts`.
  2. Built `@orbit/shared` using `npm run build --workspace=@orbit/shared`.
- **Verification Command & Output:**
  ```bash
  npm run typecheck
  # Output: tsc --build. Exited code 0 (zero errors).
  ```

---

## Remediation 6: Honest Feature Verification Matrix Reclassification

- **Symptom:** `docs/product-blueprint/FEATURE_VERIFICATION_MATRIX.md` claimed 100% (72/72) features were `A` (Verified), obscuring that third-party integrations (WhatsApp, Instagram, Twilio, Shopify, Shiprocket, Stripe live mode) were running against mock adapters without live merchant/telecom credentials.
- **Root Cause:** Overly aggressive milestone marking without distinguishing between verified internal code and external vendor adapters.
- **Action Taken:**
  1. Audited all 72 features under Gravitas Invariant 3 (Fresh evidence) and Invariant 6 (Explicit disclosure).
  2. Reclassified 7 external adapters (Commerce B4, Voice B6, Social B7, Campaigns B11, Integrations B26, Dunning C7, Provider Keys C12) as `C` (Simulated Third-Party Adapter).
  3. Reclassified 3 features (Billing B30, OpenAI Embeddings S8, S3 Storage S11) as `B` (Implemented & Verified with Mock/Simulated Env, Live Ready).
  4. Confirmed 62 features as `A` (Fully Implemented & Verified in Monorepo).
- **Verification Command & Output:**
  Document updated in `docs/product-blueprint/FEATURE_VERIFICATION_MATRIX.md`.

---

## Comprehensive Final Suite Verification

| Check | Command | Result |
|---|---|:---:|
| **Unit Tests** | `npm run test:unit` | **PASS (22/22 files, 119/119 tests)** |
| **Browser Tests** | `npm run test:browser` | **PASS (8/8 Playwright multi-tab tests)** |
| **Typecheck** | `npm run typecheck` | **PASS (tsc --build zero errors)** |
| **Linting** | `npm run lint` | **PASS (eslint zero errors)** |
| **Monorepo Build** | `npm run build` | **PASS (all 11 apps & packages built)** |
