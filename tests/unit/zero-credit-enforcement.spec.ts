import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiService } from '../../apps/api/src/ai/ai.service';
import { BillingService } from '../../apps/api/src/billing/billing.service';

describe('Milestone 3 — Credit Ledger, Wallet & Zero-Credit Fail-Closed Enforcement', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const convId = '22222222-2222-2222-2222-222222222222';

  it('fails closed and escalates to human queue when workspace credit balance is exhausted (0 credits)', async () => {
    const mockTx = {
      conversation: {
        findFirst: vi.fn().mockResolvedValue({
          id: convId,
          organizationId: tenantId,
          status: 'OPEN',
          messages: [
            { id: 'm1', senderType: 'CUSTOMER', content: 'Can you help me with my order?' },
          ],
        }),
      },
      aiConfiguration: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'cfg-1',
          provider: 'MOCK',
          model: 'gpt-4o-mini',
          systemInstructions: 'Help the customer',
          policyRules: [],
        }),
      },
      subscription: {
        findUnique: vi.fn().mockResolvedValue({
          organizationId: tenantId,
          aiTokenAllowance: 0, // Exhausted wallet!
          status: 'ACTIVE',
        }),
      },
    };

    const mockTenantRunner = {
      runWithTenant: vi.fn((orgId, cb) => cb(mockTx)),
    };

    const aiService = new AiService(mockTenantRunner as any, {} as any);

    const result = await aiService.generateSuggestion(tenantId, convId);

    expect(result.bypassed).toBe(true);
    expect(result.reason).toBe('INSUFFICIENT_CREDITS');
    expect(result.escalatedToHuman).toBe(true);
    expect(result.message).toContain('credit balance is exhausted');
  });

  it('allows billing top-ups to increment credit balance', async () => {
    let currentAllowance = 0;
    const mockTx = {
      subscription: {
        findUnique: vi.fn().mockImplementation(() =>
          Promise.resolve({
            organizationId: tenantId,
            aiTokenAllowance: currentAllowance,
            planTier: 'STARTER',
            status: 'ACTIVE',
          })
        ),
        update: vi.fn().mockImplementation(({ data }) => {
          currentAllowance += data.aiTokenAllowance.increment;
          return {
            organizationId: tenantId,
            aiTokenAllowance: currentAllowance,
            planTier: 'STARTER',
            status: 'ACTIVE',
          };
        }),
      },
    };

    const mockTenantRunner = {
      runWithTenant: vi.fn((orgId, cb) => cb(mockTx)),
    };

    const billingService = new BillingService(mockTenantRunner as any);

    // Top-up with +50,000 credits
    const updated = await billingService.addTopUpCredits(tenantId, 50000);
    expect(updated.aiTokenAllowance).toBe(50000);

    const wallet = await billingService.getWallet(tenantId);
    expect(wallet.aiTokenAllowance).toBe(50000);
    expect(wallet.isExhausted).toBe(false);
  });
});
