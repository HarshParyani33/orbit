import { describe, it, expect } from 'vitest';
import { EnvelopeEncryptionService } from '../../packages/integrations/src/security/envelope-encryption.service';

describe('EnvelopeEncryptionService — Cryptographic AES-256-GCM Protection', () => {
  const tenantA = 'org-uuid-1111-2222-3333-4444';
  const tenantB = 'org-uuid-9999-8888-7777-6666';

  it('encrypts plaintext into an authenticated ciphertext with enc:v1: prefix', () => {
    const secret = 'EAAFx92834012984712034981720398471';
    const encrypted = EnvelopeEncryptionService.encryptValue(secret, tenantA);

    expect(encrypted).toMatch(/^enc:v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);
    expect(encrypted).not.toContain(secret);
  });

  it('decrypts encrypted ciphertext back into original plaintext', () => {
    const original = 'super_secret_whatsapp_permanent_token_xyz123';
    const encrypted = EnvelopeEncryptionService.encryptValue(original, tenantA);
    const decrypted = EnvelopeEncryptionService.decryptValue(encrypted, tenantA);

    expect(decrypted).toBe(original);
  });

  it('enforces tenant key isolation (decrypting tenant A ciphertext with tenant B fails)', () => {
    const original = 'tenant_a_confidential_api_token';
    const encryptedForA = EnvelopeEncryptionService.encryptValue(original, tenantA);

    // Attempting to decrypt with Tenant B key must fail authentication
    expect(() => {
      EnvelopeEncryptionService.decryptValue(encryptedForA, tenantB);
    }).toThrow();
  });

  it('recursively encrypts and decrypts sensitive keys in channel configuration', () => {
    const rawConfig = {
      phoneNumberId: '109283019283019',
      wabaId: '98127391827391',
      accessToken: 'EAAG9823412093840192840192',
      appSecret: 'sec_test_secret_998127',
      nested: {
        webhookSecret: 'whsec_secret_123',
        normalField: 'hello world',
      },
    };

    const encryptedConfig = EnvelopeEncryptionService.encryptConfig(rawConfig, tenantA);

    // Sensitive keys must be encrypted
    expect(encryptedConfig.accessToken).toMatch(/^enc:v1:/);
    expect(encryptedConfig.appSecret).toMatch(/^enc:v1:/);
    expect(encryptedConfig.nested.webhookSecret).toMatch(/^enc:v1:/);

    // Non-sensitive keys remain unchanged
    expect(encryptedConfig.phoneNumberId).toBe('109283019283019');
    expect(encryptedConfig.nested.normalField).toBe('hello world');

    // Decrypting returns original object
    const decryptedConfig = EnvelopeEncryptionService.decryptConfig(encryptedConfig, tenantA);
    expect(decryptedConfig).toEqual(rawConfig);
  });

  it('masks sensitive fields for safe API display without leaking tokens', () => {
    const config = {
      phoneNumberId: '109283019283019',
      accessToken: 'EAAG9823412093840192840192',
      appSecret: 'sec_test_secret_998127',
    };

    const masked = EnvelopeEncryptionService.maskConfig(config);
    expect(masked.phoneNumberId).toBe('109283019283019');
    expect(masked.accessToken).toBe('••••••••');
    expect(masked.appSecret).toBe('••••••••');
  });
});
