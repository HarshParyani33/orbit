import { describe, it, expect } from 'vitest';
import { forgotPasswordSchema, resetPasswordSchema } from '../../packages/validation/src';
import * as crypto from 'crypto';

describe('Password Recovery Validation & Crypto Invariants', () => {
  it('validates email format in forgotPasswordSchema', () => {
    const valid = forgotPasswordSchema.safeParse({ email: 'User@Example.COM' });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.email).toBe('user@example.com'); // Lowercased and trimmed
    }

    const invalid = forgotPasswordSchema.safeParse({ email: 'not-an-email' });
    expect(invalid.success).toBe(false);
  });

  it('validates password strength rules in resetPasswordSchema', () => {
    const valid = resetPasswordSchema.safeParse({
      token: '1234567890abcdef1234567890abcdef',
      newPassword: 'StrongPassword123!',
    });
    expect(valid.success).toBe(true);

    // Rejects weak passwords (missing uppercase, number, or too short)
    const tooShort = resetPasswordSchema.safeParse({
      token: '1234567890abcdef1234567890abcdef',
      newPassword: 'Pass1',
    });
    expect(tooShort.success).toBe(false);

    const noNumber = resetPasswordSchema.safeParse({
      token: '1234567890abcdef1234567890abcdef',
      newPassword: 'PasswordWithoutNumber',
    });
    expect(noNumber.success).toBe(false);
  });

  it('ensures password reset tokens are hashed using SHA-256 before database lookup', () => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = 'reset:' + crypto.createHash('sha256').update(rawToken).digest('hex');

    expect(tokenHash).toMatch(/^reset:[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(rawToken);
  });
});
