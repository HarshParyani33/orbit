import { Injectable, Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantTransactionRunner } from '../tenancy/tenant-transaction-runner';

@Injectable()
export class ChannelsService {
  constructor(@Inject(TenantTransactionRunner) private readonly tenantRunner: TenantTransactionRunner) {}

  async listChannels(organizationId: string) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      return tx.channel.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async createChannel(
    organizationId: string,
    data: { name: string; provider: string; config?: Prisma.InputJsonObject }
  ) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      return tx.channel.create({
        data: {
          organizationId,
          name: data.name,
          provider: data.provider,
          config: data.config ?? {},
        },
      });
    });
  }
}

