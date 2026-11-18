import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantTransactionRunner } from '../tenancy/tenant-transaction-runner';
import { CreateChannelInput, UpdateChannelInput } from '@orbit/validation';

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

  async getChannel(organizationId: string, channelId: string) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const channel = await tx.channel.findFirst({
        where: {
          id: channelId,
          organizationId,
          deletedAt: null,
        },
      });
      if (!channel) {
        throw new NotFoundException('Channel not found');
      }
      return channel;
    });
  }

  async createChannel(organizationId: string, data: CreateChannelInput) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      return tx.channel.create({
        data: {
          organizationId,
          name: data.name,
          provider: data.provider,
          config: (data.config as Prisma.InputJsonObject) ?? {},
        },
      });
    });
  }

  async updateChannel(organizationId: string, channelId: string, data: UpdateChannelInput) {
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
          ...(data.name ? { name: data.name } : {}),
          ...(data.config ? { config: data.config as Prisma.InputJsonObject } : {}),
          ...(data.status ? { status: data.status } : {}),
        },
      });
    });
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

