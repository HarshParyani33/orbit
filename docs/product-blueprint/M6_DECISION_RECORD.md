# Decision Record: Milestone 6 (M6) — AI Voice Telephony Platform & Marketing Automation Journeys

## Status
ACCEPTED & IN-PROGRESS

## Date
2026-11-19

## Context & Problem Statement
Following the completion of Milestone 5 (Social Media Engagement, Pulse AI BI, and MCP Server), Project Orbit must expand into two critical enterprise pillars demonstrated by SagePilot:
1. **AI Voice Telephony Platform:**
   - DTC brands and enterprise operations require phone support on a single brand line.
   - Low-latency conversational voice streaming (Groq Whisper STT -> LLM -> Cartesia TTS) with < 1,200ms turnaround time and natural interruption handling.
   - When a caller requests a human or expresses extreme frustration, the system must execute an automated transfer and generate a structured **Written Handoff Briefing Card** directly in the Master Inbox.
2. **Marketing Automation & Lifecycle Journeys:**
   - Automated revenue retention marketing across WhatsApp and Email.
   - Customer segmentation engine (filtering by spend, tags, channel, cart abandonment).
   - Core automated journeys: Abandoned Cart Recovery (triggered via webhook within 15 mins), Browse Abandonment, and Post-Purchase Re-Engagement.
   - Revenue attribution tracking to measure ROI and customer conversion rate.

## Gravitas Invariants Enforced
1. **Ground before mutating:** Inspected existing provider-neutral voice contracts in `packages/integrations/src/voice/types.ts` and customer models in `prisma/schema.prisma`.
2. **Stay in declared scope:** Focus exclusively on Milestone 6 deliverables: Voice Telephony Provider, Voice Call Session Manager, Human Transfer Briefing Cards, and Marketing Campaign/Journey Automation.
3. **Completion needs fresh evidence:** Require unit tests for Voice handoff briefing generation, speech turnaround latency handling, abandoned cart webhook dispatch, and audience segmentation.
4. **Never exact-retry a failure:** Systematically inspect errors and resolve root causes.
5. **Satisfy the contract:** All call sessions and marketing campaigns must strictly enforce tenant RLS (`runWithTenant`) and verify active organization boundaries.
6. **Say what cannot be verified:** Real telecom SIP trunks and live Twilio phone numbers require external carrier provisioning; provider adapters must implement verified mock/simulated carrier contracts alongside live TwiML endpoints.

## Architecture & Technical Decisions

### 1. Voice Telephony Provider (`packages/integrations/src/voice/twilio-voice.provider.ts`)
- Implements `IVoiceProvider`:
  - `initiateOutboundCall`: Generates external call SID, sets status to `RINGING`/`IN_PROGRESS`.
  - `terminateCall`: Ends active telephony session.
  - `generateHandoffBriefing`: Evaluates transcription turns, performs sentiment analysis (`FRUSTRATED`, `NEUTRAL`, `POSITIVE`), synthesizes customer key points, and formulates suggested agent action.
  - Speech turnaround latency simulated under 1,200ms (Whisper STT ~180ms + Groq Llama 3.1 70B ~320ms + Cartesia TTS ~190ms = ~690ms total turnaround).

### 2. NestJS Voice Telephony Module (`apps/api/src/voice`)
- `VoiceService`:
  - Scoped to active organization with thread-safe session tracking.
  - When human transfer is requested (`requestHumanTransfer`), it automatically creates a high-priority ticket in the Master Inbox with the structured `VoiceHandoffBriefing` card and notifies online agents.
- `VoiceController`:
  - `POST /api/voice/calls/dial`: Trigger voice call.
  - `POST /api/voice/calls/:callId/transfer`: Trigger human handoff with briefing card.
  - `POST /api/voice/calls/:callId/hangup`: End call.
  - `GET /api/voice/calls`: List active and past call logs.
  - `POST /api/voice/webhooks/incoming`: Ingest incoming Twilio carrier voice webhook.

### 3. NestJS Marketing Campaigns Module (`apps/api/src/campaigns`)
- `CampaignsService`:
  - Dynamic audience segmentation: `ALL_CUSTOMERS`, `CART_ABANDONERS`, `VIP_SPENDERS`, `INACTIVE_60_DAYS`.
  - Campaign lifecycle management (`DRAFT`, `SCHEDULED`, `RUNNING`, `COMPLETED`).
  - Automated Abandoned Cart Recovery workflow: Listens for checkout abandonment webhooks, generates personalized 10% discount codes, and dispatches recovery messages via WhatsApp.
  - Revenue attribution engine: Ties purchases made within 48 hours back to the campaign.
- `CampaignsController`:
  - `GET /api/campaigns`: Fetch campaigns and aggregated delivery/conversion metrics.
  - `POST /api/campaigns`: Create campaign with audience filter and template.
  - `POST /api/campaigns/:id/launch`: Immediately dispatch campaign to audience.
  - `POST /api/campaigns/webhooks/abandoned-cart`: Ingest e-commerce abandoned checkout webhook.

### 4. Frontend Marketing & Voice Cockpit (`apps/web`)
- `CampaignsPage.tsx`: Marketing campaign studio with KPI scorecards, active campaigns table, audience segment dropdown, WhatsApp message preview, and abandoned cart recovery toggle.
- Voice Agent dialer and call monitor in `AiAgentsPage.tsx`.
- Connected to navigation bar (`apps/web/src/components/Navbar.tsx`) and application routing (`apps/web/src/App.tsx`).
