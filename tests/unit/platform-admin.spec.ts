import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminService } from '../../apps/api/src/admin/admin.service';
import { AdminController } from '../../apps/api/src/admin/admin.controller';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('Milestone 7: Platform-Owner Super-Admin Control Plane (Surface C)', () => {
  let adminService: AdminService;
  let adminController: AdminController;
  let mockPrisma: any;
  let mockTokenService: any;

  beforeEach(() => {
    mockPrisma = {
      organization: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'tenant-1', ...data })),
      },
    };

    mockTokenService = {
      generateAccessToken: vi.fn().mockReturnValue('mock_signed_jwt_30m'),
    };

    adminService = new AdminService(mockPrisma, mockTokenService);
    adminController = new AdminController(adminService);
  });

  describe('1. Global Tenant Directory & Health Status', () => {
    it('returns seed and database tenants with plan tier, credits, and calculated gross margin', async () => {
      const tenants = await adminService.listTenants();
      expect(tenants.length).toBeGreaterThanOrEqual(4);

      const plum = tenants.find((t) => t.slug === 'plum-beauty')!;
      expect(plum).toBeDefined();
      expect(plum.planTier).toBe('GROWTH');
      expect(plum.status).toBe('ACTIVE');
      expect(plum.grossMarginPct).toBeGreaterThan(90);

      const response = await adminController.listTenants();
      expect(response.success).toBe(true);
      expect((response.data as any[]).length).toBeGreaterThanOrEqual(4);
    });

    it('toggles operational status between ACTIVE and SUSPENDED with immutable audit trail', async () => {
      const res = await adminService.setTenantStatus('tenant-1', 'SUSPENDED', 'harsh@orbit.internal');
      expect(res.status).toBe('SUSPENDED');

      const tenants = await adminService.listTenants();
      const plum = tenants.find((t) => t.id === 'tenant-1')!;
      expect(plum.status).toBe('SUSPENDED');

      // Check audit trail
      const logs = adminService.getAuditLogs();
      const latest = logs[0];
      expect(latest.action).toBe('TENANT_SUSPEND');
      expect(latest.targetTenantId).toBe('tenant-1');
      expect(latest.operatorEmail).toBe('harsh@orbit.internal');

      // Reactivate
      const res2 = await adminService.setTenantStatus('tenant-1', 'ACTIVE', 'harsh@orbit.internal');
      expect(res2.status).toBe('ACTIVE');
    });
  });

  describe('2. Auditable Tenant Impersonation (AC-C1)', () => {
    it('fails closed when justification reason is missing or empty', async () => {
      await expect(
        adminService.createImpersonationSession({
          tenantId: 'tenant-1',
          operatorEmail: 'harsh@orbit.internal',
          reason: '',
        })
      ).rejects.toThrow(BadRequestException);

      await expect(
        adminService.createImpersonationSession({
          tenantId: 'tenant-1',
          operatorEmail: 'harsh@orbit.internal',
          reason: '   ',
        })
      ).rejects.toThrow(/mandatory justification reason/i);
    });

    it('fails when tenant ID does not match any organization', async () => {
      await expect(
        adminService.createImpersonationSession({
          tenantId: 'non-existent-tenant',
          operatorEmail: 'harsh@orbit.internal',
          reason: 'Diagnosing missing webhooks',
        })
      ).rejects.toThrow(NotFoundException);
    });

    it('issues 30-minute short-lived token and records audited operator session', async () => {
      const session = await adminService.createImpersonationSession({
        tenantId: 'tenant-1',
        operatorEmail: 'harsh@orbit.internal',
        reason: 'Support Ticket #4912: RAG retrieval debugging',
        ticketId: 'T-4912',
      });

      expect(session.token).toBe('mock_signed_jwt_30m');
      expect(session.expiresInSeconds).toBe(1800); // 30 minutes constraint (AC-C1)
      expect(session.redirectUrl).toBe('http://localhost:5173/plum-beauty');
      expect(session.impersonatedOrg.slug).toBe('plum-beauty');

      // Verify immutable audit log
      const logs = adminService.getAuditLogs();
      const impersonationLog = logs.find((l) => l.action === 'IMPERSONATION_REQUEST')!;
      expect(impersonationLog).toBeDefined();
      expect(impersonationLog.operatorEmail).toBe('harsh@orbit.internal');
      expect(impersonationLog.targetTenantId).toBe('tenant-1');
      expect(impersonationLog.ticketId).toBe('T-4912');
      expect(impersonationLog.justification).toBe('Support Ticket #4912: RAG retrieval debugging');
    });
  });

  describe('3. Global AI Gateway & Circuit Breakers (AC-C2)', () => {
    it('retrieves live status for OpenAI, Groq, and OpenRouter', () => {
      const breakers = adminService.getCircuitBreakers();
      expect(breakers.length).toBe(3);
      expect(breakers.map((b) => b.provider).sort()).toEqual(['GROQ', 'OPENAI', 'OPENROUTER']);

      const openai = breakers.find((b) => b.provider === 'OPENAI')!;
      expect(openai.state).toBe('CLOSED');
      expect(openai.consecutiveFailures).toBe(0);
    });

    it('manually trips breaker to OPEN state and resets back to CLOSED with audit records', () => {
      // 1. Trip breaker
      const tripped = adminService.tripCircuitBreaker('OPENAI', true, 'harsh@orbit.internal');
      expect(tripped.state).toBe('OPEN');
      expect(tripped.consecutiveFailures).toBe(3);
      expect(tripped.lastFailureTime).toBeDefined();

      let logs = adminService.getAuditLogs();
      expect(logs[0].action).toBe('CIRCUIT_BREAKER_TRIP');
      expect(logs[0].metadata?.provider).toBe('OPENAI');

      // 2. Reset breaker
      const reset = adminService.tripCircuitBreaker('OPENAI', false, 'harsh@orbit.internal');
      expect(reset.state).toBe('CLOSED');
      expect(reset.consecutiveFailures).toBe(0);

      logs = adminService.getAuditLogs();
      expect(logs[0].action).toBe('CIRCUIT_BREAKER_RESET');
      expect(logs[0].metadata?.provider).toBe('OPENAI');
    });
  });

  describe('4. Financial & Gross Margin Enforcement (AC-C3)', () => {
    it('calculates real-time unit economics and flags tenants with gross margin < 75%', async () => {
      const margins = await adminService.getGrossMargins();

      expect(margins.monthlyRecurringRevenueUsd).toBeGreaterThan(0);
      expect(margins.annualRecurringRevenueUsd).toBeCloseTo(margins.monthlyRecurringRevenueUsd * 12, 1);
      expect(margins.providerCogsUsd).toBeGreaterThan(0);
      expect(margins.platformGrossMarginPct).toBeGreaterThan(90);

      // Verify AC-C3 requirement: flags any tenant with gross margin below 75% for review
      expect(margins.flaggedTenantsCount).toBeGreaterThanOrEqual(1);
      const deficitTenant = margins.flaggedTenants.find((t) => t.id === 'tenant-5');
      expect(deficitTenant).toBeDefined();
      expect(deficitTenant!.grossMarginPct).toBeLessThan(75.0);
    });
  });

  describe('5. Platform Audit Trail Invariants', () => {
    it('appends and preserves audit log entries in reverse-chronological order', () => {
      const initialCount = adminService.getAuditLogs().length;

      adminService.logAudit({
        operatorEmail: 'secops@orbit.internal',
        action: 'CREDIT_ADJUSTMENT',
        justification: 'Manual emergency credit grant',
        metadata: { grant: 5000 },
      });

      const updatedLogs = adminService.getAuditLogs();
      expect(updatedLogs.length).toBe(initialCount + 1);
      expect(updatedLogs[0].action).toBe('CREDIT_ADJUSTMENT');
      expect(updatedLogs[0].operatorEmail).toBe('secops@orbit.internal');
      expect(updatedLogs[0].createdAt).toBeDefined();
    });
  });
});
