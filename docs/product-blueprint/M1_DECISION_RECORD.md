# Gravitas Decision Record — Milestone 1 (M1)
## Critical P1 Security Blockers, Resilient AI Gateway & Multi-Surface Scaffolding

**Record ID:** `ADR-20261119-M1-SECURITY-FOUNDATION`  
**Date:** 2026-11-19  
**Status:** `IN PROGRESS`  
**Mode:** `implement`  
**Allowed Write Scope:**
- `apps/api/src/*`
- `packages/config/src/*`
- `packages/integrations/src/*`
- `packages/shared/src/*`
- `packages/validation/src/*`
- `apps/marketing/*`
- `apps/admin/*`
- `tests/*`
- `docs/product-blueprint/*`

---

## 1. Action Scope & Justification
1. **Rate Limiting:** Deploy tiered rate limiting on unauthenticated auth routes (`/api/auth/login`, `/api/auth/register`, `/api/auth/refresh`) and AI generation routes (`/api/ai/*`) to prevent brute-force attacks and denial-of-service.
2. **Envelope Encryption:** Implement AES-256-GCM encryption for channel secrets (WhatsApp, Instagram, Stripe) in `Channel.config` with secret masking on API responses.
3. **AI Provider Decoupling:** Refactor `AiService.generateSuggestion` to separate DB pre-flight from external LLM execution and post-flight recording, eliminating database transaction locks during slow external API calls.
4. **Stripe Webhook Tenant RLS Resolution:** Use `ChannelRoutingLookup` (Category B table) to resolve `organizationId` from Stripe customer/subscription IDs without hitting RLS on `subscriptions`.
5. **Live OpenAI Embeddings:** Wire `OpenAiEmbeddingProvider` in `KnowledgeService` using `process.env.OPENAI_API_KEY` with graceful fallback for test environments.
6. **Password Recovery:** Implement `forgotPassword` and `resetPassword` workflows with cryptographic tokens and full session family revocation.
7. **Resilient AI Gateway:** Implement `GroqProvider`, `OpenRouterProvider`, and `ResilientAiGateway` with circuit-breaker fallback.
8. **Surface Scaffolding:** Scaffold `apps/marketing` (Next.js 14) and `apps/admin` (React + Vite) adhering to approved monorepo architecture.

---

## 2. Evidence Baseline Before Mutation
- 38 unit tests passing (`npm run test:unit`).
- 8 browser tests passing (`npm run test:browser`).
- Working tree clean at commit `bed9fce4cc82585c5676e4f5ad75468bae3ed0f8`.
