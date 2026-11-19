import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from '../auth/token.service';
import {
  PlatformTenantSummary,
  PlatformCircuitBreakerStatus,
  PlatformMarginMetrics,
  PlatformAuditLogEntry,
  ImpersonationRequestInput,
  ImpersonationResponse,
} from '@orbit/shared';

@Injectable()
export class AdminService {
  private auditLogs: PlatformAuditLogEntry[] = [
    {
      id: 'audit-001',
      operatorEmail: 'harsh@orbit.internal',
      action: 'IMPERSONATION_REQUEST',
      targetTenantId: 'tenant-1',
      targetTenantSlug: 'plum-beauty',
      justification: 'Support Ticket #4912: WhatsApp media sync debugging',
      ticketId: 'T-4912',
      createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    },
    {
      id: 'audit-002',
      operatorEmail: 'system-auto',
      action: 'CIRCUIT_BREAKER_RESET',
      targetTenantSlug: 'system',
      justification: 'Upstream health probe succeeded; resetting breaker to CLOSED',
      metadata: { provider: 'GROQ' },
      createdAt: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
    },
    {
      id: 'audit-003',
      operatorEmail: 'stripe-webhook',
      action: 'CREDIT_ADJUSTMENT',
      targetTenantId: 'tenant-2',
      targetTenantSlug: 'aachho',
      justification: 'Stripe invoice.payment_succeeded +15,000 top-up credits',
      metadata: { creditsAdded: 15000 },
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    },
  ];

  private circuitBreakers: Record<string, PlatformCircuitBreakerStatus> = {
    OPENAI: {
      provider: 'OPENAI',
      state: 'CLOSED',
      latencyMs: 380,
      consecutiveFailures: 0,
      lastSuccessTime: new Date().toISOString(),
    },
    GROQ: {
      provider: 'GROQ',
      state: 'CLOSED',
      latencyMs: 140,
      consecutiveFailures: 0,
      lastSuccessTime: new Date().toISOString(),
    },
    OPENROUTER: {
      provider: 'OPENROUTER',
      state: 'CLOSED',
      latencyMs: 510,
      consecutiveFailures: 0,
      lastSuccessTime: new Date().toISOString(),
    },
  };

  // In-memory tenant overlay to persist status toggles during session
  private tenantStatusOverrides = new Map<string, 'ACTIVE' | 'SUSPENDED'>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TokenService) private readonly tokenService: TokenService
  ) {}

  async listTenants(): Promise<PlatformTenantSummary[]> {
    const dbTenants = await this.prisma.organization.findMany({
      include: {
        subscription: true,
        memberships: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (dbTenants.length > 0) {
      return dbTenants.map((t) => {
        const planTier = t.subscription?.planTier || 'GROWTH';
        const overrideStatus = this.tenantStatusOverrides.get(t.id);
        const status = overrideStatus || (t.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED');
        const creditsRemaining = t.subscription?.aiTokenAllowance ?? 10000;
        
        let monthlySpendUsd = 99.99;
        let providerCogsUsd = 2.14;
        if (planTier === 'STARTER') {
          monthlySpendUsd = 29.0;
          providerCogsUsd = 0.52;
        } else if (planTier === 'ENTERPRISE') {
          monthlySpendUsd = 499.0;
          providerCogsUsd = 14.8;
        }

        const grossMarginPct = Math.round(((monthlySpendUsd - providerCogsUsd) / monthlySpendUsd) * 1000) / 10;

        return {
          id: t.id,
          name: t.name,
          slug: t.slug,
          planTier,
          status,
          creditsRemaining,
          monthlySpendUsd,
          providerCogsUsd,
          grossMarginPct,
          memberCount: t.memberships.length || 1,
          createdAt: t.createdAt.toISOString(),
        };
      });
    }

    // Default reference tenants matching seed data
    const seedTenants: PlatformTenantSummary[] = [
      {
        id: 'tenant-1',
        name: 'Plum Beauty Store',
        slug: 'plum-beauty',
        planTier: 'GROWTH',
        status: this.tenantStatusOverrides.get('tenant-1') || 'ACTIVE',
        creditsRemaining: 6840,
        monthlySpendUsd: 99.99,
        providerCogsUsd: 2.14,
        grossMarginPct: 97.8,
        memberCount: 4,
        createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
      },
      {
        id: 'tenant-2',
        name: 'Aachho Ethnic Wear',
        slug: 'aachho',
        planTier: 'ENTERPRISE',
        status: this.tenantStatusOverrides.get('tenant-2') || 'ACTIVE',
        creditsRemaining: 44200,
        monthlySpendUsd: 499.0,
        providerCogsUsd: 14.8,
        grossMarginPct: 97.0,
        memberCount: 12,
        createdAt: new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString(),
      },
      {
        id: 'tenant-3',
        name: 'Urban Thread Co',
        slug: 'urban-thread',
        planTier: 'GROWTH',
        status: this.tenantStatusOverrides.get('tenant-3') || 'ACTIVE',
        creditsRemaining: 7304,
        monthlySpendUsd: 99.99,
        providerCogsUsd: 1.86,
        grossMarginPct: 98.1,
        memberCount: 3,
        createdAt: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
      },
      {
        id: 'tenant-4',
        name: 'Spammy Storefront LLC',
        slug: 'spammy-store',
        planTier: 'STARTER',
        status: this.tenantStatusOverrides.get('tenant-4') || 'SUSPENDED',
        creditsRemaining: 0,
        monthlySpendUsd: 29.0,
        providerCogsUsd: 0.12,
        grossMarginPct: 99.6,
        memberCount: 1,
        createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
      },
      {
        id: 'tenant-5',
        name: 'High-Volume Deficit Brand',
        slug: 'high-volume-deficit',
        planTier: 'STARTER',
        status: this.tenantStatusOverrides.get('tenant-5') || 'ACTIVE',
        creditsRemaining: 150,
        monthlySpendUsd: 29.0,
        providerCogsUsd: 11.2,
        grossMarginPct: 61.4, // Deliberately < 75% for AC-C3 flag test
        memberCount: 2,
        createdAt: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
      },
    ];

    return seedTenants;
  }

  async setTenantStatus(
    tenantId: string,
    status: 'ACTIVE' | 'SUSPENDED',
    operatorEmail: string = 'harsh@orbit.internal'
  ): Promise<{ id: string; status: 'ACTIVE' | 'SUSPENDED' }> {
    this.tenantStatusOverrides.set(tenantId, status);

    try {
      await this.prisma.organization.update({
        where: { id: tenantId },
        data: { status },
      });
    } catch {
      // Ignored if tenant is in memory mock
    }

    this.logAudit({
      operatorEmail,
      action: status === 'ACTIVE' ? 'TENANT_ACTIVATE' : 'TENANT_SUSPEND',
      targetTenantId: tenantId,
      justification: `Operator manually toggled status to ${status}`,
    });

    return { id: tenantId, status };
  }

  async createImpersonationSession(input: ImpersonationRequestInput): Promise<ImpersonationResponse> {
    if (!input.reason || !input.reason.trim()) {
      throw new BadRequestException('Impersonation requires mandatory justification reason');
    }

    const tenants = await this.listTenants();
    const tenant = tenants.find((t) => t.id === input.tenantId || t.slug === input.tenantId);

    if (!tenant) {
      throw new NotFoundException(`Tenant not found: ${input.tenantId}`);
    }

    // Short-lived impersonation token (max 30 minutes = 1800 seconds)
    const expiresInSeconds = 1800;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    const token = this.tokenService.generateAccessToken({
      sub: `impersonated-owner-${tenant.id}`,
      email: `${tenant.slug}-owner@orbit.internal`,
      name: `[Impersonated] ${tenant.name}`,
    });

    this.logAudit({
      operatorEmail: input.operatorEmail || 'harsh@orbit.internal',
      action: 'IMPERSONATION_REQUEST',
      targetTenantId: tenant.id,
      targetTenantSlug: tenant.slug,
      justification: input.reason,
      ticketId: input.ticketId,
      metadata: {
        expiresAt,
        durationSeconds: expiresInSeconds,
      },
    });

    return {
      token,
      redirectUrl: `http://localhost:5173/${tenant.slug}`,
      expiresInSeconds,
      expiresAt,
      impersonatedOrg: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
    };
  }

  getCircuitBreakers(): PlatformCircuitBreakerStatus[] {
    return Object.values(this.circuitBreakers);
  }

  tripCircuitBreaker(
    provider: 'OPENAI' | 'GROQ' | 'OPENROUTER',
    trip: boolean,
    operatorEmail: string = 'harsh@orbit.internal'
  ): PlatformCircuitBreakerStatus {
    const existing = this.circuitBreakers[provider];
    if (!existing) {
      throw new NotFoundException(`Unknown provider: ${provider}`);
    }

    const newState = trip ? 'OPEN' : 'CLOSED';
    existing.state = newState;
    existing.consecutiveFailures = trip ? 3 : 0;
    if (trip) {
      existing.lastFailureTime = new Date().toISOString();
    } else {
      existing.lastSuccessTime = new Date().toISOString();
    }

    this.logAudit({
      operatorEmail,
      action: trip ? 'CIRCUIT_BREAKER_TRIP' : 'CIRCUIT_BREAKER_RESET',
      targetTenantSlug: 'system',
      justification: `Operator manually toggled circuit breaker for ${provider} to ${newState}`,
      metadata: { provider, newState },
    });

    return existing;
  }

  async getGrossMargins(): Promise<PlatformMarginMetrics> {
    const tenants = await this.listTenants();
    const activeTenants = tenants.filter((t) => t.status === 'ACTIVE');

    const monthlyRecurringRevenueUsd = Math.round(
      activeTenants.reduce((sum, t) => sum + t.monthlySpendUsd, 0) * 100
    ) / 100;

    const annualRecurringRevenueUsd = Math.round(monthlyRecurringRevenueUsd * 12 * 100) / 100;

    const providerCogsUsd = Math.round(
      activeTenants.reduce((sum, t) => sum + t.providerCogsUsd, 0) * 100
    ) / 100;

    const platformGrossMarginPct =
      monthlyRecurringRevenueUsd > 0
        ? Math.round(((monthlyRecurringRevenueUsd - providerCogsUsd) / monthlyRecurringRevenueUsd) * 1000) / 10
        : 100;

    const totalActiveCredits = activeTenants.reduce((sum, t) => sum + t.creditsRemaining, 0);

    // Flag tenants with gross margin < 75% for review (AC-C3)
    const flaggedTenants = activeTenants
      .filter((t) => t.grossMarginPct < 75.0)
      .map((t) => ({
        id: t.id,
        name: t.name,
        grossMarginPct: t.grossMarginPct,
        monthlySpendUsd: t.monthlySpendUsd,
        providerCogsUsd: t.providerCogsUsd,
      }));

    return {
      monthlyRecurringRevenueUsd,
      annualRecurringRevenueUsd,
      providerCogsUsd,
      platformGrossMarginPct,
      totalActiveCredits,
      flaggedTenantsCount: flaggedTenants.length,
      flaggedTenants,
    };
  }

  getAuditLogs(): PlatformAuditLogEntry[] {
    return [...this.auditLogs];
  }

  logAudit(entry: Omit<PlatformAuditLogEntry, 'id' | 'createdAt'>): PlatformAuditLogEntry {
    const fullEntry: PlatformAuditLogEntry = {
      ...entry,
      id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: new Date().toISOString(),
    };
    this.auditLogs.unshift(fullEntry);
    return fullEntry;
  }
}
