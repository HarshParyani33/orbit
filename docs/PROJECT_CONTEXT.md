# PROJECT CONTEXT — MULTI-TENANT AI CUSTOMER ENGAGEMENT SAAS

**Working title:** Project Orbit (temporary name; final brand to be decided)  
**Product type:** Multi-tenant SaaS  
**Initial market:** Small and medium-sized businesses  
**Initial opportunity:** Approximately 15 potential businesses through an existing business contact  
**Initial objective:** Build a free, polished, functional demo, validate it with real business owners, then progressively launch a paid production service.

---

# 1. Product vision

We are building an AI-powered customer engagement and support platform that allows businesses to manage customer conversations from multiple channels in one place.

The platform should help businesses:

- Respond to customer enquiries using AI.
- Manage conversations from a unified inbox.
- Connect website chat, WhatsApp and Instagram.
- Give human agents the ability to take over conversations.
- Manage customer profiles and conversation history.
- Teach the AI about business-specific products, policies and instructions.
- Automate repetitive support workflows.
- Understand support performance through analytics.

The long-term product should have the capabilities of a serious customer engagement SaaS, but our first release must be a focused and demonstrable product.

We are not cloning another company's interface, source code or branding. We are developing our own product and user experience using general customer engagement and automation concepts.

# 2. Development strategy

Use a production-minded development approach with a low-cost demonstration environment.

There are three stages:

## Stage A — Free demo

Build a functional demonstration using:

- Sample business data.
- Seeded customer profiles and conversations.
- Working dashboard and backend APIs.
- Working AI integration with usage limits, plus a mock mode.
- Simulated WhatsApp and Instagram conversations.
- A working website chat widget.
- A functional AI instruction/knowledge management system.
- A basic analytics dashboard.

The demo must not falsely imply that simulated channels are connected to real accounts.

## Stage B — Design partner pilot

After the demo is approved by potential customers:

- Select 2–3 design partner businesses.
- Configure their actual business data.
- Connect official channels where account permissions and approvals allow.
- Test real conversations and human handoff.
- Monitor usage and operating costs.
- Gather feedback and fix issues.

## Stage C — Production SaaS

After validation:

- Deploy production infrastructure.
- Configure official channel credentials and webhooks.
- Configure secure storage and backups.
- Enable subscription billing and usage limits.
- Complete security, privacy and performance testing.
- Onboard additional businesses.

Do not build all future features before validating the initial product.

# 3. Target users and roles

The system must support multiple independent organizations (tenants).

Initial roles:

1. Platform Owner — manages the SaaS itself, subscriptions, tenants, usage and platform health.
2. Business Owner/Admin — manages one business workspace, settings, channels, AI configuration and team members.
3. Manager — manages conversations, agents, assignments, analytics and team workflows.
4. Agent — responds to customer conversations and uses AI suggestions.
5. Customer — communicates through a website widget or connected messaging channel.

A user may belong to more than one organization in the future. Membership and role permissions must be organization-specific.

# 4. Technology stack

Use TypeScript throughout the application wherever practical.

## Frontend

- React.
- TypeScript.
- Vite.
- Tailwind CSS.
- A consistent accessible component system.
- TanStack Query for server state.
- React Hook Form and Zod for forms and validation.
- A charting library for analytics.

Build a responsive, professional SaaS dashboard with a consistent design system.

## Backend

- Node.js.
- TypeScript.
- NestJS as the backend framework.
- REST APIs, documented using OpenAPI/Swagger.
- WebSocket support for real-time conversation updates.
- Background workers for AI processing, webhooks and automation.

Use modular architecture. Do not create one giant controller or service.

## Database

- PostgreSQL as the primary database.
- Prisma ORM and migrations.
- pgvector for future semantic retrieval from business knowledge.
- Redis for caching, rate limiting and job coordination.
- BullMQ for background jobs.

PostgreSQL is the source of truth for business data.

## AI

Create a provider-independent AI service.

Initial provider: OpenAI API.

The AI layer must support:

- Model selection and routing.
- Business-specific system instructions.
- Knowledge retrieval.
- Structured outputs where appropriate.
- Token and cost tracking.
- Retry and timeout policies.
- Human escalation.
- Mock AI mode for local demos.

Do not hardcode a model name throughout the application. Model configuration belongs in environment/configuration settings.

AI must not invent business policies, prices, stock status, delivery estimates or order information.

When reliable information is unavailable, the AI should ask for clarification or escalate to a human.

## Storage

Create a storage abstraction.

- Local storage for development.
- S3-compatible object storage for production.
- Validate file type and size.
- Store file metadata and tenant ownership.
- Never expose private file storage publicly by default.

## Infrastructure

- Docker and Docker Compose for local development.
- Environment-specific configuration.
- CI checks for pull requests.
- Production deployment scripts and documentation.
- Structured application logs.

Do not require paid cloud infrastructure to run the local demo.

# 5. Core modules

## Module 1 — Authentication and organization management

Features:

- Registration and login.
- Secure session handling.
- Password hashing.
- Logout and session expiration.
- Organization creation.
- Organization switching.
- Team invitations.
- Role-based access control.
- Organization settings.

Requirements:

- No hardcoded demo credentials in production.
- No secrets committed to Git.
- Validate authorization on the backend.
- A user must not access another tenant's records by changing an ID in a request.

## Module 2 — Unified inbox

Build the main conversation management interface.

Features:

- All conversations.
- Open, pending, resolved and escalated statuses.
- Search and filters.
- Channel labels.
- Customer information panel.
- Conversation assignment.
- Tags and priority.
- Message history.
- Internal notes.
- Human takeover.
- AI reply suggestions.
- Real-time updates.
- Conversation resolution and reopening.

For the demo, simulated channel conversations are acceptable, but they must use the same internal conversation model as real channel integrations.

## Module 3 — AI assistant

The AI assistant must answer customer questions using the correct organization's information.

Features:

- Business-specific AI instructions.
- Business tone and personality.
- FAQ and knowledge documents.
- Product information.
- Return and refund policies.
- Shipping information.
- Conversation context.
- Suggested replies.
- Automatic replies when enabled.
- Escalation to a human agent.
- AI response history.
- AI usage tracking.

The AI must always know which organization it is answering for.

Never retrieve another organization's data as context.

## Module 4 — Teach the AI

This is an important product differentiator.

The business owner should be able to:

- Add instructions.
- Correct a previous AI answer.
- Define preferred wording.
- Add new business policies.
- Set rules for specific situations.
- Test the instruction before approval.
- Activate, disable or revert an instruction.

Instruction lifecycle:

Draft → Test → Approve → Active → Version history.

Each instruction must store:

- Organization ID.
- Instruction content.
- Scope.
- Priority.
- Creator.
- Approver.
- Created and updated timestamps.
- Version.
- Active status.

Do not let the AI silently rewrite its own permanent instructions based on a conversation.

## Module 5 — Customer CRM

Features:

- Customer list.
- Customer profile.
- Name, email and phone where available.
- Conversation history.
- Tags.
- Notes.
- Channel identities.
- Order references when connected to an order integration.

Only merge customer identities when there is a verified identifier or an explicit authorized match.

## Module 6 — Channel integrations

Build a channel adapter architecture.

Initial channels:

1. Website chat widget.
2. WhatsApp Business Platform.
3. Instagram messaging.
4. Instagram comment management.

Each channel adapter should implement a consistent internal interface for:

- Receiving messages.
- Sending messages.
- Processing webhooks.
- Mapping external identities.
- Handling attachments.
- Reporting errors.
- Updating delivery status where supported.

For the demo, simulated adapters must be available.

Real channel integrations must use official APIs and verified business authorization. Do not scrape websites or automate personal accounts.

## Module 7 — Website chat widget

Features:

- Embeddable JavaScript widget.
- Business-specific appearance.
- Welcome message.
- AI conversation.
- Conversation persistence.
- Human handoff.
- Mobile responsiveness.

Each widget must be linked to one organization using a public widget identifier. Public identifiers must not expose private API credentials.

## Module 8 — Automation engine

Start with simple trigger/action rules.

Examples:

- When a conversation is created, assign it to an agent.
- When a customer asks for a human, escalate the conversation.
- When a conversation remains unanswered, mark it for attention.
- When a conversation is resolved, update its status.

Build a safe, testable rule engine before building a complex visual workflow editor.

## Module 9 — Analytics

Demo metrics:

- Total conversations.
- Open conversations.
- Resolved conversations.
- AI-handled conversations.
- Human escalations.
- Average response time.
- Conversation volume by channel.
- AI usage and estimated AI cost.

Use real database queries over seeded demo data. Do not hardcode chart values into the frontend.

## Module 10 — Platform administration

Platform Owner dashboard:

- Organization list.
- Organization status.
- User counts.
- Conversation usage.
- AI token usage and cost.
- Integration health.
- Error overview.
- Subscription status placeholder.

Platform administration must be separate from normal business administration.

# 6. Multi-tenancy and security — non-negotiable

This is a multi-tenant product. Tenant isolation is a foundational requirement, not a later enhancement.

Every tenant-owned database record must have an organization/tenant relationship.

Requirements:

- Backend tenant authorization.
- Organization-scoped queries.
- Database constraints and indexes.
- PostgreSQL Row-Level Security where appropriate.
- Tenant-aware cache keys.
- Tenant-aware background jobs.
- Tenant-aware file access.
- Tenant-aware analytics.
- Encrypted integration credentials.
- Webhook signature verification.
- Input validation.
- Rate limiting.
- Audit logging.
- Secure error handling.
- Dependency and vulnerability checks.

Never trust a tenant ID supplied by the browser without verifying membership and permissions on the server.

Do not log passwords, access tokens, API keys or sensitive message contents unnecessarily.

# 7. AI safety and cost controls

Implement:

- Per-organization model configuration.
- Per-organization AI usage tracking.
- Token counting and cost estimation.
- Monthly usage limits.
- Request timeouts.
- Retry limits.
- Rate limiting.
- Fallback responses.
- Human escalation.
- Prompt-injection-aware retrieval.
- Separation between trusted business instructions and untrusted customer messages.

Never execute customer-provided instructions as privileged system instructions.

Do not use customer conversations to train or fine-tune models by default.

# 8. Data model — initial entities

Design a normalized relational schema around these entities:

- users
- organizations
- organization_memberships
- invitations
- channels
- channel_credentials
- contacts
- contact_channel_identities
- conversations
- conversation_assignments
- messages
- message_attachments
- conversation_tags
- tags
- internal_notes
- ai_instructions
- ai_instruction_versions
- knowledge_documents
- knowledge_chunks
- automation_rules
- automation_runs
- integrations
- webhook_events
- usage_records
- audit_logs
- subscriptions
- platform_events

Use UUID identifiers where appropriate.

Define relationships, indexes, unique constraints, deletion behavior and tenant ownership explicitly.

Do not create every table blindly. Start with the entities needed for the first vertical slice and evolve through reviewed migrations.

# 9. Suggested repository structure

Use a monorepo.

```text
orbit-saas/
│
├── apps/
│   ├── web/                 # React dashboard
│   ├── api/                 # NestJS backend
│   ├── widget/              # Embeddable customer chat
│   └── worker/              # Background jobs
│
├── packages/
│   ├── shared/              # Shared types and utilities
│   ├── validation/          # Shared schemas
│   ├── ui/                  # Shared UI components
│   ├── config/              # Shared configuration
│   └── integrations/        # Channel adapter contracts
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
│
├── docs/
│   ├── PROJECT_CONTEXT.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── API.md
│   ├── SECURITY.md
│   ├── DEVELOPMENT.md
│   ├── DEPLOYMENT.md
│   └── DECISIONS/
│
├── scripts/
├── tests/
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

Adjust the structure only when there is a clear technical reason. Keep modules cohesive and avoid unnecessary abstraction.

# 10. Demo scope — build in this order

Priority 1:

- Project setup.
- Authentication.
- Organization creation.
- Tenant isolation.
- Dashboard shell.
- Seeded demo organization.
- Unified inbox.
- Conversation detail.
- Customer profile.
- Website chat widget.

Priority 2:

- AI assistant.
- Knowledge base.
- Teach the AI.
- Human handoff.
- AI usage tracking.

Priority 3:

- Simulated WhatsApp and Instagram channels.
- Basic automations.
- Analytics.
- Platform administration.

Priority 4:

- Real WhatsApp integration.
- Real Instagram integration.
- Subscription billing.
- Production infrastructure.

Do not delay the first working demo to build complex integrations.

# 11. Production-readiness standards

Production-minded code must include:

- TypeScript strict mode.
- Consistent linting and formatting.
- Centralized error handling.
- DTO validation.
- OpenAPI documentation.
- Database migrations.
- Automated tests.
- Integration tests for critical workflows.
- Tenant-isolation tests.
- Authentication and authorization tests.
- Structured logs.
- Health-check endpoints.
- Graceful shutdown.
- Queue retry and dead-letter handling.
- Idempotent webhook processing.
- Environment-based configuration.
- Secure secret management.
- Backup and recovery documentation.

A feature is not complete merely because the UI renders.

It is complete only when:

1. The frontend works.
2. The backend enforces the required rules.
3. Data persists correctly.
4. Errors are handled.
5. Tests pass.
6. Authorization is verified.
7. Documentation is updated.

# 12. Development rules for AI coding agents

Follow these rules throughout the project:

1. Read PROJECT_CONTEXT.md and relevant architecture documents before making changes.
2. Inspect the existing repository before proposing or writing code.
3. Do not overwrite existing working features without understanding their purpose.
4. Plan multi-file changes before implementation.
5. Work in small, reviewable increments.
6. Do not make unrelated changes.
7. Do not invent dependencies or API methods.
8. Check official documentation for version-sensitive APIs.
9. Never commit secrets or real customer data.
10. Never disable tests simply to make a build pass.
11. Run relevant tests after each meaningful change.
12. Report exactly what was implemented and what remains incomplete.
13. Do not claim that an integration works without testing it.
14. Update architecture and API documentation when contracts change.
15. Ask before performing destructive database, infrastructure or Git operations.

# 13. Team workflow

Use Git and feature branches.

Suggested ownership:

- Product/architecture and AI/backend.
- Frontend dashboard and widget.
- Backend modules and database.
- Channel integrations and webhooks.
- Testing, security and documentation.

Before parallel development, agree on API contracts, database ownership and module boundaries.

Do not allow multiple developers or agents to independently modify the same critical files without coordination.

# 14. Definition of a successful demo

A business owner should be able to:

1. Open the demo.
2. Log in as a business owner.
3. View their business dashboard.
4. Open the unified inbox.
5. Read an existing customer conversation.
6. Send a reply.
7. Ask the AI a business-related question.
8. Correct the AI through the Teach AI interface.
9. Test the corrected instruction.
10. See customer information and conversation history.
11. View analytics.

The website widget should be usable from a separate browser session.

All demo data must be clearly marked as sample data.

The demo must show what the product can do without pretending that unavailable production integrations are already live.

# 15. Important business principle

Build the common product once.

Do not create a separate codebase or permanent code branch for each client.

Each business should have its own:

- Organization.
- Users and permissions.
- Brand settings.
- Products and knowledge.
- AI instructions.
- Channels and credentials.
- Automations.
- Usage limits.
- Analytics.

Client-specific behavior should be configured wherever possible rather than implemented as custom code.

# 16. First instruction to the development agent

Do not start generating the entire application immediately.

First:

1. Inspect the repository and current working directory.
2. Confirm the installed runtime and tooling.
3. Read this project context.
4. Propose the architecture and dependency choices.
5. Identify risks and unresolved decisions.
6. Create a phased implementation plan.
7. Propose the first database schema.
8. Identify the first vertical slice.
9. Wait for approval before making large-scale changes.

Our first milestone is a working, tenant-isolated application skeleton with authentication, organization management, dashboard layout and seeded demo data.

**The goal is a real product foundation with a low-cost demo environment, not a collection of impressive-looking but nonfunctional screens.**