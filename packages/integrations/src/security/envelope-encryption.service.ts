import * as crypto from 'crypto';

export const SENSITIVE_CONFIG_KEYS = new Set([
  'token',
  'accesstoken',
  'access_token',
  'systemusertoken',
  'system_user_token',
  'secret',
  'appsecret',
  'app_secret',
  'apikey',
  'api_key',
  'password',
  'webhooksecret',
  'webhook_secret',
  'privatekey',
  'private_key',
]);

export class EnvelopeEncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 12; // 96 bits recommended for GCM
  private static readonly PREFIX = 'enc:v1:';

  /**
   * Derives a tenant-unique 256-bit encryption key using HKDF/SHA-256 from master key and tenant ID.
   */
  public static deriveTenantKey(tenantId: string, masterSecret?: string): Buffer {
    const rootSecret =
      masterSecret ||
      process.env.ENCRYPTION_MASTER_KEY ||
      process.env.COOKIE_SECRET ||
      process.env.JWT_SECRET ||
      'dev_master_encryption_key_32_chars_testing_only';

    return crypto.createHmac('sha256', rootSecret).update(`tenant:${tenantId}:channel_key`).digest();
  }

  /**
   * Encrypts a plaintext string using AES-256-GCM.
   * Returns a format: "enc:v1:<ivHex>:<tagHex>:<ciphertextHex>"
   */
  public static encryptValue(plaintext: string, tenantId: string, masterSecret?: string): string {
    if (!plaintext || typeof plaintext !== 'string') {
      return plaintext;
    }

    if (plaintext.startsWith(this.PREFIX)) {
      // Already encrypted
      return plaintext;
    }

    const key = this.deriveTenantKey(tenantId, masterSecret);
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${this.PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /**
   * Decrypts an encrypted ciphertext string.
   */
  public static decryptValue(encryptedValue: string, tenantId: string, masterSecret?: string): string {
    if (!encryptedValue || typeof encryptedValue !== 'string' || !encryptedValue.startsWith(this.PREFIX)) {
      return encryptedValue;
    }

    const key = this.deriveTenantKey(tenantId, masterSecret);
    const parts = encryptedValue.slice(this.PREFIX.length).split(':');
    if (parts.length !== 3) {
      throw new Error('[EnvelopeEncryption] Malformed ciphertext structure');
    }

    const [ivHex, tagHex, dataHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    const ciphertext = Buffer.from(dataHex, 'hex');

    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  }

  /**
   * Encrypts sensitive keys within a configuration object.
   */
  public static encryptConfig(
    config: Record<string, any>,
    tenantId: string,
    masterSecret?: string
  ): Record<string, any> {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return config;
    }

    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(config)) {
      const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
      const isSensitive = SENSITIVE_CONFIG_KEYS.has(normalizedKey);

      if (isSensitive && typeof value === 'string' && value.trim().length > 0) {
        result[key] = this.encryptValue(value, tenantId, masterSecret);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = this.encryptConfig(value, tenantId, masterSecret);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Decrypts sensitive keys within a configuration object.
   */
  public static decryptConfig(
    config: Record<string, any>,
    tenantId: string,
    masterSecret?: string
  ): Record<string, any> {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return config;
    }

    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string' && value.startsWith(this.PREFIX)) {
        try {
          result[key] = this.decryptValue(value, tenantId, masterSecret);
        } catch {
          result[key] = value; // Fallback to raw if decryption fails
        }
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = this.decryptConfig(value, tenantId, masterSecret);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Masks sensitive fields in a config object before returning over public APIs.
   */
  public static maskConfig(config: Record<string, any>): Record<string, any> {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return config;
    }

    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(config)) {
      const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
      const isSensitive = SENSITIVE_CONFIG_KEYS.has(normalizedKey);

      if (isSensitive && typeof value === 'string' && value.trim().length > 0) {
        result[key] = '••••••••';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = this.maskConfig(value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }
}
