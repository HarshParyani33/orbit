import { describe, it, expect } from 'vitest';
import { ApiKeysService } from '../../apps/api/src/developer/api-keys.service';
import { OutboundWebhooksService } from '../../apps/api/src/developer/outbound-webhooks.service';

describe('Milestone 3 — Developer API Keys & Outbound Webhook Signatures', () => {
  const orgId = 'org-dev-12345';

  it('generates cryptographically secure API keys with sha256 hash storage', async () => {
    const service = new ApiKeysService();
    const result = await service.generateApiKey(orgId, 'Testing Key', ['inbox:read', 'ai:suggest']);

    expect(result.key).toMatch(/^orb_live_[a-f0-9]{48}$/);
    expect(result.prefix).toMatch(/^orb_live_\.\.\.[a-f0-9]{4}$/);
    expect(result.name).toBe('Testing Key');
    expect(result.scopes).toEqual(['inbox:read', 'ai:suggest']);

    // Validate key
    const validated = await service.validateApiKey(result.key);
    expect(validated).not.toBeNull();
    expect(validated?.organizationId).toBe(orgId);
    expect(validated?.scopes).toContain('inbox:read');

    // Revoke key
    await service.revokeApiKey(orgId, result.id);
    const postRevocation = await service.validateApiKey(result.key);
    expect(postRevocation).toBeNull();
  });

  it('generates HMAC-SHA256 signatures for outbound webhooks', async () => {
    const webhooks = new OutboundWebhooksService();
    const payload = JSON.stringify({ event: 'ticket.created', id: '123' });
    const secret = 'whsec_testsecret123456';

    const sig = webhooks.signPayload(payload, secret);
    expect(sig).toMatch(/^[a-f0-9]{64}$/); // 32-byte hex string
  });
});
