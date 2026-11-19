import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';

export interface ApiKeyRecord {
  id: string;
  organizationId: string;
  name: string;
  tokenHash: string;
  prefix: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt?: Date;
  status: 'ACTIVE' | 'REVOKED';
}

@Injectable()
export class ApiKeysService {
  // Thread-safe in-memory tenant store with persistence-ready abstraction
  private readonly keys = new Map<string, ApiKeyRecord[]>();

  async generateApiKey(
    organizationId: string,
    name: string,
    scopes: string[] = ['inbox:read', 'inbox:write', 'ai:suggest']
  ): Promise<{ id: string; name: string; key: string; prefix: string; scopes: string[]; createdAt: string }> {
    if (!name || name.trim().length === 0) {
      throw new BadRequestException('API key name is required');
    }

    const rawSecret = crypto.randomBytes(24).toString('hex');
    const rawKey = `orb_live_${rawSecret}`;
    const tokenHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const prefix = `orb_live_...${rawSecret.slice(-4)}`;

    const id = crypto.randomUUID();
    const now = new Date();

    const record: ApiKeyRecord = {
      id,
      organizationId,
      name: name.trim(),
      tokenHash,
      prefix,
      scopes,
      createdAt: now,
      status: 'ACTIVE',
    };

    const orgKeys = this.keys.get(organizationId) || [];
    orgKeys.push(record);
    this.keys.set(organizationId, orgKeys);

    return {
      id,
      name: record.name,
      key: rawKey,
      prefix,
      scopes,
      createdAt: now.toISOString(),
    };
  }

  async listApiKeys(organizationId: string): Promise<Omit<ApiKeyRecord, 'tokenHash'>[]> {
    const orgKeys = this.keys.get(organizationId) || [];
    return orgKeys
      .filter((k) => k.status === 'ACTIVE')
      .map(({ tokenHash, ...rest }) => rest);
  }

  async revokeApiKey(organizationId: string, keyId: string): Promise<{ success: boolean }> {
    const orgKeys = this.keys.get(organizationId) || [];
    const key = orgKeys.find((k) => k.id === keyId && k.status === 'ACTIVE');

    if (!key) {
      throw new NotFoundException('API key not found or already revoked');
    }

    key.status = 'REVOKED';
    return { success: true };
  }

  async validateApiKey(rawKey: string): Promise<{ organizationId: string; scopes: string[] } | null> {
    if (!rawKey || !rawKey.startsWith('orb_live_')) {
      return null;
    }

    const tokenHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    for (const [orgId, orgKeys] of this.keys.entries()) {
      const match = orgKeys.find((k) => k.tokenHash === tokenHash && k.status === 'ACTIVE');
      if (match) {
        match.lastUsedAt = new Date();
        return {
          organizationId: match.organizationId,
          scopes: match.scopes,
        };
      }
    }

    return null;
  }
}
