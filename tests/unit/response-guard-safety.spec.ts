import { describe, it, expect, vi } from 'vitest';
import { AiService } from '../../apps/api/src/ai/ai.service';

describe('Milestone 3 — Response Guard & Competitor Blacklist Defenses', () => {
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const convId = '11111111-1111-1111-1111-111111111111';

  it('bypasses AI response and flags for human review when customer mentions a blacklisted competitor', async () => {
    const mockTx = {
      conversation: {
        findFirst: vi.fn().mockResolvedValue({
          id: convId,
          organizationId: tenantId,
          status: 'OPEN',
          messages: [
            {
              id: 'm1',
              senderType: 'CUSTOMER',
              content: 'Can you match the discount offered by Zendesk or Freshdesk?',
            },
          ],
        }),
      },
      aiConfiguration: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'cfg-guard',
          provider: 'MOCK',
          model: 'gpt-4o-mini',
          systemInstructions: 'Be a helpful assistant',
          policyRules: {
            competitors: ['Zendesk', 'Intercom', 'Freshdesk'],
            supervisedReview: true,
          },
        }),
      },
      subscription: {
        findUnique: vi.fn().mockResolvedValue({
          organizationId: tenantId,
          aiTokenAllowance: 50000,
          status: 'ACTIVE',
        }),
      },
      aiModelPricingSchedule: {
        findFirst: vi.fn().mockResolvedValue({
          provider: 'MOCK',
          canonicalModel: 'gpt-4o-mini',
          promptTokenRatePerM: 0.15,
          completionTokenRatePerM: 0.60,
        }),
      },
    };

    const mockTenantRunner = {
      runWithTenant: vi.fn((orgId, cb) => cb(mockTx)),
    };

    const aiService = new AiService(mockTenantRunner as any, {} as any);

    const result = await aiService.generateSuggestion(tenantId, convId);

    expect(result.bypassed).toBe(true);
    expect(result.reason).toBe('RESPONSE_GUARD_COMPETITOR_FLAG');
    expect(result.escalatedToHuman).toBe(true);
    expect(result.message).toContain('Zendesk');
  });
});
