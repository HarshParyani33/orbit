# Orbit Master Acceptance Criteria Specification
## Testable Completion Criteria Across Public Ingress, Business Workspaces & Platform Control Plane

**Document ID:** `AC-20261119-ORBIT-V1`  
**Status:** Approved Architectural Blueprint  
**Standard:** Behavior-Driven Development (BDD / Gherkin Format)

---

## 1. Surface A: Public Website & Onboarding

### AC-A1: Interactive ROI Calculator
```gherkin
Feature: Public ROI Calculator
  Scenario: Visitor estimates annual support savings
    Given an unauthenticated visitor navigates to the homepage at "https://orbit.com"
    When they adjust the monthly ticket volume slider to "25,000"
    And they adjust the human team size slider to "10"
    Then the system immediately displays projected autonomous deflection as "75% to 85%"
    And the system displays estimated annual cost savings between "$95,000" and "$120,000"
    And zero backend API calls are made (pure client-side execution)
```

### AC-A2: Enterprise Demo Booking
```gherkin
Feature: Demo Scheduling & Lead Qualification
  Scenario: Enterprise visitor books product demonstration
    Given a visitor clicks "Book a Demo"
    When they submit the form with business email "alex@megabrand.com" and volume "50k+"
    Then the system checks the domain against free email blacklists (gmail.com, yahoo.com)
    And displays the embedded calendar with available enterprise AE time slots
    And upon selecting a slot, dispatches an invite and records a lead in the CRM
    And dispatches a webhook notification to internal Slack with status 200
```

### AC-A3: Self-Serve Trial Onboarding
```gherkin
Feature: Self-Serve Workspace Provisioning
  Scenario: New merchant registers for 14-day free trial
    Given a new visitor navigates to "https://orbit.com/signup"
    When they enter valid name, email, password, and workspace name "Silk & Wool"
    Then the system dispatches a 6-digit OTP to their email within 3 seconds
    When the user submits the correct OTP
    Then the system creates User, Organization, and OWNER membership
    And provisions 2,000 trial credits in the credit_ledger
    And sets an HTTP-only refresh token cookie and returns an in-memory access token
    And redirects the user to "https://app.orbit.com/silk-wool/onboarding"
```

---

## 2. Surface B: Business Workspace & Helpdesk

### AC-B1: Omnichannel Inbox Ticket Lifecycle & Views
```gherkin
Feature: Ticket Lifecycle & Queue Transitions
  Scenario: Inbound message appears in In Queue and transitions to Open
    Given an active workspace with WhatsApp channel connected
    When a customer sends an inbound WhatsApp message "Where is my order?"
    Then a new ticket is created with status "IN_QUEUE" and tag "Needs First Reply"
    And the ticket counter on "In Queue" increments live via WebSocket
    When a human agent clicks the ticket
    Then the ticket status automatically transitions to "OPEN"
    And the assignee is set to the viewing agent
    And the customer message, timestamp, and channel badge render in the center thread
```

### AC-B2: Internal Team Notes & Mentions
```gherkin
Feature: Private Team Collaboration
  Scenario: Support agent adds private note with colleague mention
    Given an agent is viewing an open ticket #557
    When the agent presses shortcut "N" or clicks "Add Note"
    And types "@sarah Customer wants exchange without invoice. Can we approve?"
    And clicks "Submit Note"
    Then the note is inserted into the conversation with "Private" badge and yellow styling
    And Sarah receives an in-app notification and desktop alert
    And the external customer receives ZERO message on WhatsApp or Web Chat
```

### AC-B3: Real-Time Commerce Order Cards
```gherkin
Feature: Shopify Live Order Context
  Scenario: Ticket view displays customer order history and quick actions
    Given an open ticket from customer "kishore@gmail.com"
    And Shopify integration is connected with active credentials
    When the agent opens the ticket context pane
    Then the system queries Shopify API using encrypted credentials
    And renders the latest order #4305 with item thumbnails, fulfillment status "Delivered", and delivery date
    When the agent clicks "Issue Store Credit Refund"
    Then the system prompts for confirmation and executes the Shopify refund API call
    And logs a system event in the ticket thread: "Agent issued $48.00 store credit"
```

### AC-B4: AI Response Guard Supervision
```gherkin
Feature: Response Guard Confidence Threshold & Human Gate
  Scenario: AI draft escalates to human when confidence falls below 85%
    Given Response Guard is configured with confidence threshold "85%"
    When a customer asks a complex policy question: "Can I return a customized monogrammed towel?"
    And the AI model generates a reply with confidence score "72%"
    Then the system blocks autonomous outbound dispatch
    And routes the ticket to the "Investigating" queue
    And presents the generated text to the agent as a suggested draft marked "Review Required (Confidence 72%)"
    And zero credits are billed to the customer until approved
```

### AC-B5: Pulse AI Natural Language Analytics
```gherkin
Feature: Conversational BI via Pulse AI
  Scenario: Manager asks natural language question about ticket volume
    Given a workspace manager opens the Pulse AI panel
    When they submit prompt: "Break down open tickets by how long they have been open"
    Then Pulse AI queries the workspace database within RLS tenant context
    And generates a split-view response within 3.5 seconds
    And renders an interactive bar chart: 0-24h (8), 1-2d (10), 1w-1m (1), Over 1m (1)
    And provides a "Download CSV" export button
```

### AC-B6: Concurrency-Safe Credit Wallet & Auto-Recharge
```gherkin
Feature: Credit Wallet Balance Enforcement
  Scenario: AI requests degrade gracefully when credit balance reaches zero
    Given a workspace has exactly 1 AI credit remaining in the credit_ledger
    When two concurrent customer messages arrive simultaneously
    Then the atomic Redis pre-auth allows exactly 1 message to proceed
    And the second message triggers the out-of-credits fallback
    And routes the second ticket to human queue with badge "Credits Depleted"
    And dispatches a high-priority billing alert email to the workspace Owner
```

---

## 3. Surface C: Platform-Owner Super-Admin

### AC-C1: Auditable Tenant Impersonation
```gherkin
Feature: Super-Admin Tenant Impersonation
  Scenario: Platform SRE impersonates customer workspace to diagnose bug
    Given a platform operator is logged into "https://admin.orbit.com" with hardware 2FA
    When they initiate impersonation for tenant "Lumina Fashion" with ticket ID "T-991" and reason "RAG debugging"
    Then the system issues a temporary JWT with max 30-minute expiry
    And redirects the operator to "https://app.orbit.com/lumina-fashion"
    And renders a persistent red header: "[IMPERSONATION ACTIVE — AUDITED]"
    And every HTTP request made by the operator is logged in "platform_audit_logs"
    And all customer credit card and billing details are masked
```

### AC-C2: Dynamic AI Provider Failover
```gherkin
Feature: Circuit Breaker & Provider Fallback
  Scenario: OpenAI API outage automatically shifts traffic to Groq
    Given OpenAI is the configured primary provider for chat triage
    When OpenAI returns HTTP 500 or times out (>3,500ms) for 3 consecutive calls
    Then the system trips the circuit breaker to OPEN state
    And logs a warning alert to platform administrators
    And immediately routes all subsequent chat requests to Groq (llama-3.1-70b)
    And user-facing conversations experience zero downtime or visible errors
```

### AC-C3: Gross Margin Enforcement
```gherkin
Feature: Platform Gross Margin Assurance
  Scenario: Platform calculates real-time unit economics per tenant
    Given platform operators access "admin.orbit.com/analytics/margins"
    When the system aggregates monthly revenue and provider API token expenditures
    Then the dashboard displays gross margin percentage per tenant
    And flags any tenant with gross margin below 75% for review
```

---

## 4. Shared Security & Infrastructure

### AC-S1: Multi-Tenant RLS Isolation Under Attack
```gherkin
Feature: PostgreSQL Row-Level Security Defense
  Scenario: Malicious user attempts to query another tenant's conversation
    Given an authenticated user belonging to Organization A ("org-alpha")
    When they execute an API request: "GET /api/conversations/conv-beta-uuid" (belonging to Organization B)
    Then the database RLS policy evaluates "organization_id = NULLIF(current_setting(...))"
    And the query returns HTTP 404 (Not Found) or empty result set
    And zero records from Organization B are exposed
```

### AC-S2: Channel Credential Envelope Encryption
```gherkin
Feature: Zero Plaintext Secrets in Database
  Scenario: Merchant saves WhatsApp permanent system token
    Given a merchant submits WhatsApp API credentials via settings
    When the backend processes the request
    Then the credentials are encrypted using AES-256-GCM with a tenant-unique data key
    And the ciphertext is stored in "Channel.config"
    And inspecting raw PostgreSQL tables confirms tokens are indistinguishable from random bytes
```

### AC-S3: Tiered Rate Limiting Protection
```gherkin
Feature: Brute-Force & Denial of Service Protection
  Scenario: Bot attempts credential stuffing on login endpoint
    Given an unauthenticated client targeting "POST /api/auth/login"
    When the client exceeds 5 requests within a 60-second window from one IP
    Then the NestJS ThrottlerModule returns HTTP 429 (Too Many Requests)
    And includes a "Retry-After" header in the response
    And drops further requests without hitting the database
```
