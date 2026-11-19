# Orbit End-to-End User Journeys
## Complete Operational Workflows Across Visitors, Business Owners, Support Agents, Platform Operators & End Customers

**Document ID:** `UJ-20261119-ORBIT-V1`  
**Status:** Approved Architectural Blueprint  
**Coverage:** 5 Key Personas across 16 Step-by-Step Journeys

---

## 1. Persona Matrix

| Persona | Operational Context | Primary Surface | Primary Objective |
| :--- | :--- | :--- | :--- |
| **1. Visitor (Prospective Merchant)** | DTC Founder, VP E-Commerce exploring automation | Surface A (Public Website) | Evaluate capabilities, compute ROI, book demo, initiate free trial |
| **2. Business Owner (Workspace Admin)** | Brand Owner, Head of CX configuring the brand | Surface B (Business Workspace) | Connect channels & Shopify, deploy AI agents, configure Response Guard, monitor billing |
| **3. Support Agent (Human Team Member)** | Customer service agent handling escalations | Surface B (Business Workspace) | Resolve tickets, review AI suggestions, view order context, add private notes |
| **4. Platform Administrator (Operator)** | Orbit DevOps, Super-Admin managing SaaS platform | Surface C (Platform Admin) | Monitor tenant health, adjust model routing, grant credits, audit margins |
| **5. End Customer (Shopper / Consumer)** | Shopper purchasing from merchant storefront | Surface B (Widget / WhatsApp) | Track shipment, request exchange/refund, receive quick human assistance |

---

## 2. Journey Set 1: Prospective Merchant & Visitor

### Journey 1.1: Public Website Evaluation & ROI Calculation
*   **Persona:** VP of Customer Experience at a scaling fashion brand (30k tickets/month).
*   **Trigger:** Clicks an organic search link or ad pointing to `orbit.com`.
*   **Step-by-Step Sequence:**
    1. Lands on `orbit.com` homepage. Observes high-converting headline, customer proof logos (Plum, Aachho), and interactive AI resolution simulator.
    2. Interacts with the Omnichannel capability grid, previewing WhatsApp, Instagram, and Voice AI agent behaviors.
    3. Scrolls to the **Interactive ROI Calculator**:
        *   Sets monthly tickets slider to `30,000`.
        *   Sets current support team size to `12 agents`.
        *   Sets average response time to `45 minutes`.
    4. Calculator dynamically projects:
        *   Estimated autonomous resolution: `76% (22,800 tickets)`.
        *   Projected annual cost savings: `\$142,000`.
        *   Reclaimed human support hours: `4,560 hours/year`.
    5. Clicks primary CTA: **"Book an Enterprise Demo"**.
*   **System Interactions & APIs:**
    *   Client-side math in `apps/marketing` with zero database overhead.
    *   Analytics event tracked: `analytics.track("roi_calculated", { volume: 30000, savings: 142000 })`.

### Journey 1.2: Demo Scheduling & CRM Lead Capture
*   **Trigger:** Visitor clicks "Book an Enterprise Demo".
*   **Step-by-Step Sequence:**
    1. A multi-step qualification modal opens:
        *   Step 1: Contact Details (Name: "Sarah Jenkins", Work Email: "sarah@luminafashion.com").
        *   Step 2: Brand Profile (Company: "Lumina Fashion", Storefront: "Shopify Plus", Monthly Volume: "10k-50k").
        *   Step 3: Primary Channels (Selects "WhatsApp" and "Instagram").
    2. Embedded scheduling calendar (Cal.com) presents available time slots for the Enterprise sales team.
    3. Sarah picks Thursday at 2:00 PM EST.
    4. System confirms booking, displays calendar invite link, and dispatches an automated confirmation email.
*   **System Interactions & APIs:**
    *   `POST /api/leads/demo-request`: Validates email domain (blocks free Gmail/Yahoo addresses), saves lead record in CRM.
    *   Dispatches webhook to internal sales Slack channel: `#inbound-enterprise-leads`.

### Journey 1.3: Self-Serve Trial Onboarding & Workspace Provisioning
*   **Trigger:** Mid-market merchant clicks "Start Free 14-Day Trial".
*   **Step-by-Step Sequence:**
    1. Submits email, password (Argon2id compliant), and workspace name ("Urban Thread Co").
    2. System sends a 6-digit Email OTP verification code.
    3. User enters OTP. System creates `User`, `Organization` (slug: `urban-thread-co`), and initial `OrganizationMembership` (`role: "OWNER"`).
    4. System provisions a default `Subscription` with plan tier `STARTER_TRIAL` and 2,000 complimentary AI credits in `CreditLedger`.
    5. Onboarding wizard launches in `apps/web`:
        *   Step 1: Install Web Chat Widget (provides single line `<script>` snippet).
        *   Step 2: Upload brand Knowledge Base (PDF return policy or FAQ URL).
        *   Step 3: Test first AI conversation.
    6. User arrives on the Business Workspace Dashboard (`app.orbit.com/urban-thread-co`).

---

## 3. Journey Set 2: Business Owner / Workspace Admin

### Journey 2.1: Connecting Omnichannel Ingress (Shopify & WhatsApp)
*   **Persona:** Workspace Owner setting up live customer channels.
*   **Trigger:** Navigates to **Settings -> Integrations**.
*   **Step-by-Step Sequence:**
    1. Browses to **Commerce -> Shopify**. Clicks "Install".
    2. Enters Shopify store domain (`urbanthread.myshopify.com`). Redirects to Shopify OAuth authorization.
    3. Approves read permissions for Orders, Products, and Customers.
    4. Redirects back to Orbit. Channel secret is envelope-encrypted (AES-256-GCM) and saved to `Channel.config`.
    5. Browses to **Channels -> WhatsApp Cloud API**.
    6. Inputs Meta WhatsApp Business Account ID, Phone Number ID, and Permanent System Token.
    7. Copies Orbit Webhook URL (`https://api.orbit.com/api/webhooks/whatsapp`) and verification token into Meta Developer Console.
    8. Meta sends verification handshake. Orbit validates `hub.verify_token` and activates channel status to `ACTIVE`.

### Journey 2.2: AI Workforce Configuration & Response Guard Tuning
*   **Trigger:** Navigates to **AI & Agents -> Response Guard**.
*   **Step-by-Step Sequence:**
    1. Selects "Shreya" (Customer Care Agent persona).
    2. Sets **Supervised Review Mode** to `ENABLED` for the first 100 conversations.
    3. Configures safety guardrails:
        *   Confidence threshold: `85%` (below this, automatically escalate to human queue).
        *   Blacklisted topics: Competitor names ("Zara", "H&M"), legal inquiries, price negotiations.
        *   PII Redaction: Auto-mask credit card numbers and Social Security identifiers.
    4. Saves configuration. System increments `AiConfiguration.version` to 2 and logs approval audit record.

### Journey 2.3: Billing & AI Credit Top-Up Purchase
*   **Trigger:** Receives low-credit notification banner ("850 of 7,500 credits remaining").
*   **Step-by-Step Sequence:**
    1. Clicks "Buy Credits" on the top navigation bar.
    2. Modal opens displaying Credit Top-up packages:
        *   5,000 Credits — \$50.00
        *   15,000 Credits — \$135.00 (10% discount)
        *   50,000 Credits — \$400.00 (20% discount)
    3. Selects 15,000 credits package.
    4. Clicks "Proceed to Payment". System opens embedded Stripe Elements checkout.
    5. Card charge succeeds. Stripe dispatches `payment_intent.succeeded` webhook.
    6. Orbit verifies webhook signature, loads tenant context, and commits an atomic transaction:
        *   Inserts record into `CreditLedger`: `amountCredits: +15000`, `transactionType: "TOP_UP"`.
        *   Updates cached workspace credit balance.
    7. Workspace UI updates credit meter instantaneously via WebSocket: "15,850 credits available".

---

## 4. Journey Set 3: Support Team Lead & Human Agent

### Journey 3.1: Omnichannel Ticket Triage & Resolution
*   **Persona:** Human Support Agent on shift.
*   **Trigger:** Notification sound indicates a new escalated ticket in `In Queue`.
*   **Step-by-Step Sequence:**
    1. Agent views **Inbox -> In Queue (15)**.
    2. Clicks ticket `#557` ("Refund request via WhatsApp" from customer Kishore).
    3. System assigns ticket to agent: status changes from `In Queue` to `Open`, assignee set to agent.
    4. Center thread displays full historical context:
        *   Customer's original WhatsApp query: "Refund my product to store wallet".
        *   Shopify Order Card: Order `#4305` (Delivered Nov 18, Item: "Boxy Waffle Tank XL", Total: \$48.00).
        *   AI Private Note (yellow card): "Customer asks to change refund to store credit. Order delivered yesterday. Eligible under 14-day policy. Awaiting receipt verification."
        *   AI Copilot Draft: Suggested reply generated via RAG knowledge base.
    5. Agent reviews the draft, makes a minor edit to include a personalized sign-off, and presses `Ctrl + Enter` (or `Reply`).
    6. Message dispatches immediately to customer via WhatsApp Cloud API.
    7. Ticket status updates to `Awaiting Reply`.

### Journey 3.2: Internal Team Collaboration via Private Notes
*   **Trigger:** Agent needs manager approval for an out-of-policy exchange.
*   **Step-by-Step Sequence:**
    1. Presses keyboard shortcut `N` to toggle the composer into **Private Note** mode.
    2. Types: `@amanda Customer received defective zipper on jacket. Can we approve exchange even though tag was removed? Photos verified.`
    3. Clicks "Add Note".
    4. Private note posts into the conversation stream with a bright yellow background and `Private` shield badge.
    5. Amanda receives an in-app mention notification and desktop push alert.
    6. Customer sees zero evidence of this internal exchange on WhatsApp.
    7. Amanda replies internally: `@agent Approved as one-time goodwill exception.`
    8. Agent completes exchange in Shopify card and resolves ticket.

---

## 5. Journey Set 4: Platform-Owner Super-Administrator

### Journey 5.1: Tenant Health Monitoring & Incident Mitigation
*   **Persona:** Orbit Lead Site Reliability Engineer.
*   **Trigger:** PagerDuty alert: Meta WhatsApp webhook delivery latency spike.
*   **Step-by-Step Sequence:**
    1. SRE logs into `admin.orbit.com` using hardware security key (WebAuthn / FIDO2).
    2. Navigates to **System Health -> Integration Ingress**.
    3. Diagnostic chart reveals Meta Graph API returning intermittent `503 Service Unavailable` errors for 3 enterprise tenants.
    4. SRE clicks into **Dead Letter Queue (DLQ) Inspector**.
    5. Inspects failed webhook payloads safely in read-only JSON viewer.
    6. Verifies database lease sweeper has claimed and scheduled automatic retries with exponential backoff.
    7. Broadcasts a global workspace notification banner: "Meta WhatsApp API is currently experiencing upstream delays. Outbound messages are safely queued."

### Journey 5.2: Auditable Tenant Impersonation for Support
*   **Trigger:** Tier-3 enterprise customer submits urgent ticket: "AI auto-reply answering inappropriately for VIP order queries".
*   **Step-by-Step Sequence:**
    1. Admin navigates to **Tenant Management -> Organizations -> "Lumina Fashion"**.
    2. Clicks **"Request Impersonation Session"**.
    3. Modal requires mandatory inputs:
        *   Support Ticket ID: `TICKET-8891`.
        *   Reason: "Diagnosing RAG prompt grounding failure on VIP catalog".
        *   Session Duration: `30 Minutes` (auto-expires).
    4. System generates short-lived, cryptographically signed impersonation JWT.
    5. Admin is redirected to Lumina Fashion's Business Workspace with a high-visibility red header banner: `[IMPERSONATION MODE — ACTING AS LUMINA FASHION — READ/WRITE AUDITED]`.
    6. Admin inspects `AiConfiguration.policyRules`, identifies a malformed regex rule, corrects it, and logs out.
    7. System records immutable entry in `platform_audit_logs`.

---

## 6. Journey Set 5: End Customer (Consumer Shopper)

### Journey 6.1: Autonomous WhatsApp Order Support & Deflection
*   **Persona:** Consumer who purchased apparel online.
*   **Trigger:** Sends WhatsApp message: "Hi, I ordered yesterday, when will it arrive? Order #4305".
*   **Step-by-Step Sequence:**
    1. WhatsApp Cloud API delivers webhook payload to `POST /api/webhooks/whatsapp`.
    2. Orbit Webhook Sweeper validates HMAC SHA-256 signature and enqueues job in BullMQ.
    3. Worker processes job:
        *   Matches incoming phone number to `CustomerChannelIdentity`.
        *   Finds Customer "Kishore" and active Conversation.
        *   Executes pre-flight DB transaction: logs customer message.
        *   Calls AI Gateway (outside DB transaction) with Shopify tool context.
        *   AI queries Shopify API: finds Order `#4305` shipped via BlueDart with tracking URL.
        *   Generates warm, concise response: "Hi Kishore! Your order #4305 has shipped and is currently in transit. Expected delivery is tomorrow, Nov 20. You can track live here: [tracking_link]."
    4. Worker sends outbound WhatsApp message via Meta Cloud API.
    5. Worker updates `AiUsageEvent` and deducts 1 credit from merchant's `CreditLedger`.
    6. Customer receives message in 1.8 seconds.
    7. Ticket is automatically marked `RESOLVED` with zero human intervention (**Deflection Success**).

### Journey 6.2: Automated CSAT Survey Dispatch & AI Sentiment Inference
*   **Trigger:** Ticket resolved for 15 minutes.
*   **Step-by-Step Sequence:**
    1. Background worker checks CSAT dispatch rules.
    2. Dispatches WhatsApp interactive button message: "How satisfied were you with your support today? (1 - Poor, 5 - Excellent)".
    3. Customer taps "5 - Excellent".
    4. Webhook receives rating.
    5. Orbit records rating in `CsatSurvey` (`surveyRating: 5`).
    6. Concurrently, Orbit AI analyzes the transcript sentiment: generates `inferredRating: 4.85` based on customer tone and resolution speed.
    7. Analytics dashboard updates live in merchant's workspace.
