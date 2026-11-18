import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { getConfig } from '@orbit/config';

export interface ChannelRoutingResult {
  channel_id: string;
  organization_id: string;
  status: string;
}

@Injectable()
export class IngressDatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngressDatabaseService.name);
  private pool: Pool | null = null;

  onModuleInit() {
    const config = getConfig();
    const connStr = config.INGRESS_DATABASE_URL || config.DATABASE_URL;

    this.pool = new Pool({
      connectionString: connStr,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    this.pool.on('error', (err) => {
      this.logger.error('Unexpected error on idle ingress database client', err);
    });
  }

  /**
   * Resolves channel routing using the security-definer function `resolve_channel_routing`.
   * Executes strictly as orbit_ingress role with zero table access permissions.
   *
   * @param provider Channel provider ('META_WHATSAPP', 'META_INSTAGRAM', etc.)
   * @param externalAccountId Remote account identifier (e.g. WhatsApp Phone Number ID)
   */
  async resolveChannelRouting(
    provider: string,
    externalAccountId: string
  ): Promise<ChannelRoutingResult | null> {
    if (!this.pool) {
      throw new Error('IngressDatabaseService pool is not initialized');
    }

    if (!provider || !externalAccountId) {
      return null;
    }

    const cleanProvider = provider.trim();
    const cleanExtId = externalAccountId.trim();

    const result = await this.pool.query<ChannelRoutingResult>(
      'SELECT channel_id, organization_id, status FROM resolve_channel_routing($1, $2)',
      [cleanProvider, cleanExtId]
    );

    if (!result.rows || result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
