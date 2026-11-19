import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantTransactionRunner } from '../tenancy/tenant-transaction-runner';
import { CreateChannelInput, UpdateChannelInput } from '@orbit/validation';
import { EnvelopeEncryptionService } from '@orbit/integrations';

@Injectable()
export class ChannelsService {
  constructor(@Inject(TenantTransactionRunner) private readonly tenantRunner: TenantTransactionRunner) {}

  async listChannels(organizationId: string) {
    const channels = await this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      return tx.channel.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
    });

    return channels.map((channel) => ({
      ...channel,
      config: EnvelopeEncryptionService.maskConfig((channel.config as Record<string, any>) ?? {}),
    }));
  }

  async getChannel(organizationId: string, channelId: string) {
    const channel = await this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const ch = await tx.channel.findFirst({
        where: {
          id: channelId,
          organizationId,
          deletedAt: null,
        },
      });
      if (!ch) {
        throw new NotFoundException('Channel not found');
      }
      return ch;
    });

    return {
      ...channel,
      config: EnvelopeEncryptionService.maskConfig((channel.config as Record<string, any>) ?? {}),
    };
  }

  async getDecryptedChannelConfig(organizationId: string, channelId: string): Promise<Record<string, any>> {
    const channel = await this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const ch = await tx.channel.findFirst({
        where: {
          id: channelId,
          organizationId,
          deletedAt: null,
        },
      });
      if (!ch) {
        throw new NotFoundException('Channel not found');
      }
      return ch;
    });

    return EnvelopeEncryptionService.decryptConfig((channel.config as Record<string, any>) ?? {}, organizationId);
  }

  async createChannel(organizationId: string, data: CreateChannelInput) {
    const rawConfig = (data.config as Record<string, any>) ?? {};
    const encryptedConfig = EnvelopeEncryptionService.encryptConfig(rawConfig, organizationId);

    const channel = await this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      return tx.channel.create({
        data: {
          organizationId,
          name: data.name,
          provider: data.provider,
          config: encryptedConfig as Prisma.InputJsonObject,
        },
      });
    });

    return {
      ...channel,
      config: EnvelopeEncryptionService.maskConfig((channel.config as Record<string, any>) ?? {}),
    };
  }

  async updateChannel(organizationId: string, channelId: string, data: UpdateChannelInput) {
    let encryptedConfig: Prisma.InputJsonObject | undefined;
    if (data.config) {
      encryptedConfig = EnvelopeEncryptionService.encryptConfig(
        data.config as Record<string, any>,
        organizationId
      ) as Prisma.InputJsonObject;
    }

    const channel = await this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const existing = await tx.channel.findFirst({
        where: { id: channelId, organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException('Channel not found');
      }
      return tx.channel.update({
        where: {
          uq_channels_id_org: {
            id: channelId,
            organizationId,
          },
        },
        data: {
          ...(data.name ? { name: data.name } : {}),
          ...(encryptedConfig ? { config: encryptedConfig } : {}),
          ...(data.status ? { status: data.status } : {}),
        },
      });
    });

    return {
      ...channel,
      config: EnvelopeEncryptionService.maskConfig((channel.config as Record<string, any>) ?? {}),
    };
  }

  async deleteChannel(organizationId: string, channelId: string) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const existing = await tx.channel.findFirst({
        where: { id: channelId, organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException('Channel not found');
      }
      return tx.channel.update({
        where: {
          uq_channels_id_org: {
            id: channelId,
            organizationId,
          },
        },
        data: {
          deletedAt: new Date(),
        },
      });
    });
  }
}


