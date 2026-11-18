import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { TenantTransactionRunner } from '../tenancy/tenant-transaction-runner';
import {
  CreateCustomerInput,
  UpdateCustomerInput,
  ListCustomersQuery,
  LinkChannelIdentityInput,
} from '@orbit/validation';

@Injectable()
export class CustomersService {
  constructor(
    @Inject(TenantTransactionRunner)
    private readonly tenantRunner: TenantTransactionRunner
  ) {}

  async createCustomer(organizationId: string, data: CreateCustomerInput) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      return tx.customer.create({
        data: {
          organizationId,
          name: data.name,
          email: data.email || null,
          phone: data.phone || null,
          metadata: (data.metadata as any) || {},
        },
      });
    });
  }

  async getCustomer(organizationId: string, customerId: string) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const customer = await tx.customer.findFirst({
        where: {
          id: customerId,
          organizationId,
        },
        include: {
          channelIdentities: {
            include: {
              channel: {
                select: {
                  id: true,
                  name: true,
                  provider: true,
                },
              },
            },
          },
          conversations: {
            take: 5,
            orderBy: { updatedAt: 'desc' },
            include: {
              channel: {
                select: {
                  id: true,
                  name: true,
                  provider: true,
                },
              },
              messages: {
                take: 1,
                orderBy: { createdAt: 'desc' },
              },
            },
          },
          mergedInto: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!customer) {
        throw new NotFoundException('Customer not found');
      }

      return customer;
    });
  }

  async listCustomers(organizationId: string, query: ListCustomersQuery) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const where: any = {
        organizationId,
        mergedIntoId: null, // Only return active, unmerged customer records
      };

      if (query.search) {
        where.OR = [
          { name: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      const customers = await tx.customer.findMany({
        where,
        take: query.limit,
        skip: query.cursor ? 1 : 0,
        cursor: query.cursor ? { id: query.cursor } : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          channelIdentities: {
            select: {
              id: true,
              provider: true,
              externalId: true,
              verified: true,
            },
          },
          _count: {
            select: {
              conversations: true,
            },
          },
        },
      });

      return customers;
    });
  }

  async updateCustomer(
    organizationId: string,
    customerId: string,
    data: UpdateCustomerInput
  ) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const existing = await tx.customer.findFirst({
        where: { id: customerId, organizationId },
      });

      if (!existing) {
        throw new NotFoundException('Customer not found');
      }

      if (existing.mergedIntoId) {
        throw new BadRequestException('Cannot update a customer that has already been merged');
      }

      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.email !== undefined) updateData.email = data.email;
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.metadata !== undefined) updateData.metadata = data.metadata;

      return tx.customer.update({
        where: {
          uq_customers_id_org: {
            id: customerId,
            organizationId,
          },
        },
        data: updateData,
      });
    });
  }

  async linkChannelIdentity(
    organizationId: string,
    customerId: string,
    data: LinkChannelIdentityInput
  ) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      // 1. Verify customer exists and is not merged
      const customer = await tx.customer.findFirst({
        where: { id: customerId, organizationId },
      });
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
      if (customer.mergedIntoId) {
        throw new BadRequestException('Cannot link identities to a merged customer profile');
      }

      // 2. Verify channel exists and belongs to active tenant
      const channel = await tx.channel.findFirst({
        where: {
          id: data.channelId,
          organizationId,
          deletedAt: null,
        },
      });
      if (!channel) {
        throw new BadRequestException('Channel not found or does not belong to active organization');
      }

      // 3. Check for existing channel identity conflict
      const existingIdentity = await tx.customerChannelIdentity.findUnique({
        where: {
          uq_channel_identities_channel_ext: {
            channelId: data.channelId,
            externalId: data.externalId,
          },
        },
      });

      if (existingIdentity) {
        if (existingIdentity.customerId === customerId) {
          // Already linked to this customer, update verified or metadata
          return tx.customerChannelIdentity.update({
            where: { id: existingIdentity.id },
            data: {
              verified: data.verified ?? existingIdentity.verified,
              metadata: (data.metadata as any) || existingIdentity.metadata,
            },
          });
        }
        throw new ConflictException(
          'This external identity is already registered to another customer in this channel'
        );
      }

      // 4. Create new identity link
      return tx.customerChannelIdentity.create({
        data: {
          organizationId,
          customerId,
          channelId: data.channelId,
          provider: data.provider,
          externalId: data.externalId,
          verified: data.verified ?? false,
          metadata: (data.metadata as any) || {},
        },
      });
    });
  }

  async mergeCustomers(
    organizationId: string,
    sourceCustomerId: string,
    targetCustomerId: string,
    performedByUserId: string | null,
    reason: string
  ) {
    if (sourceCustomerId === targetCustomerId) {
      throw new BadRequestException('Source and target customer cannot be the same');
    }

    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      // 1. Load both customers
      const [sourceCustomer, targetCustomer] = await Promise.all([
        tx.customer.findFirst({
          where: { id: sourceCustomerId, organizationId },
          include: {
            channelIdentities: true,
            conversations: true,
          },
        }),
        tx.customer.findFirst({
          where: { id: targetCustomerId, organizationId },
          include: {
            channelIdentities: true,
          },
        }),
      ]);

      if (!sourceCustomer) {
        throw new NotFoundException('Source customer not found');
      }
      if (!targetCustomer) {
        throw new NotFoundException('Target customer not found');
      }

      if (sourceCustomer.mergedIntoId) {
        throw new BadRequestException('Source customer has already been merged');
      }
      if (targetCustomer.mergedIntoId) {
        throw new BadRequestException('Cannot merge into a customer that has already been merged');
      }

      // 2. Snapshot source customer state before mutation for audit trail
      const snapshot = {
        sourceCustomer: {
          id: sourceCustomer.id,
          name: sourceCustomer.name,
          email: sourceCustomer.email,
          phone: sourceCustomer.phone,
          metadata: sourceCustomer.metadata,
        },
        identitiesCount: sourceCustomer.channelIdentities.length,
        conversationsCount: sourceCustomer.conversations.length,
        identities: sourceCustomer.channelIdentities.map((i) => ({
          channelId: i.channelId,
          provider: i.provider,
          externalId: i.externalId,
          verified: i.verified,
        })),
        conversationIds: sourceCustomer.conversations.map((c) => c.id),
      };

      // 3. Move channel identities from source to target
      // If target already has an identical (channelId, externalId), remove source duplicate to prevent unique violation
      const targetIdentityKeys = new Set(
        targetCustomer.channelIdentities.map((i) => `${i.channelId}:${i.externalId}`)
      );

      for (const identity of sourceCustomer.channelIdentities) {
        const key = `${identity.channelId}:${identity.externalId}`;
        if (targetIdentityKeys.has(key)) {
          await tx.customerChannelIdentity.delete({
            where: { id: identity.id },
          });
        } else {
          await tx.customerChannelIdentity.update({
            where: { id: identity.id },
            data: { customerId: targetCustomerId },
          });
        }
      }

      // 4. Re-parent conversations to target customer
      await tx.conversation.updateMany({
        where: {
          customerId: sourceCustomerId,
          organizationId,
        },
        data: {
          customerId: targetCustomerId,
        },
      });

      // 5. Flag source customer as merged
      await tx.customer.update({
        where: {
          uq_customers_id_org: {
            id: sourceCustomerId,
            organizationId,
          },
        },
        data: {
          mergedIntoId: targetCustomerId,
        },
      });

      // 6. Record immutable audit record
      const audit = await tx.customerMergeAudit.create({
        data: {
          organizationId,
          sourceCustomerId,
          targetCustomerId,
          performedByUserId,
          reason,
          snapshot,
        },
      });

      return {
        success: true,
        auditId: audit.id,
        survivingCustomerId: targetCustomerId,
        mergedCustomerId: sourceCustomerId,
        reason,
      };
    });
  }

  async getCustomerConversations(organizationId: string, customerId: string) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: customerId, organizationId },
      });
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }

      // Return conversations for this customer or any customer that merged into this one
      return tx.conversation.findMany({
        where: {
          organizationId,
          customerId,
        },
        orderBy: { updatedAt: 'desc' },
        include: {
          channel: {
            select: {
              id: true,
              name: true,
              provider: true,
            },
          },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
      });
    });
  }

  /**
   * Resolves an existing customer by channel identity or safely provisions a new one.
   * INVARIANT: Never merge identities based only on matching display names.
   */
  async resolveOrCreateByChannelIdentity(
    organizationId: string,
    data: {
      channelId: string;
      provider: string;
      externalId: string;
      profile?: {
        name?: string;
        email?: string;
        phone?: string;
        verified?: boolean;
      };
    }
  ) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      // 1. Look for existing Channel Identity
      const existingIdentity = await tx.customerChannelIdentity.findUnique({
        where: {
          uq_channel_identities_channel_ext: {
            channelId: data.channelId,
            externalId: data.externalId,
          },
        },
        include: {
          customer: true,
        },
      });

      if (existingIdentity) {
        let canonicalCustomer = existingIdentity.customer;
        // Follow merged customer pointer if merged
        if (canonicalCustomer.mergedIntoId) {
          const surviving = await tx.customer.findFirst({
            where: { id: canonicalCustomer.mergedIntoId, organizationId },
          });
          if (surviving) canonicalCustomer = surviving;
        }
        return canonicalCustomer;
      }

      // 2. Not found by channel identity.
      // Strict Invariant: Never merge based only on matching display name.
      // We ONLY auto-link if there is an authoritative, verified identifier (verified email or verified phone).
      let matchedCustomer = null;

      if (data.profile?.verified) {
        if (data.profile.email) {
          matchedCustomer = await tx.customer.findFirst({
            where: {
              organizationId,
              email: data.profile.email.toLowerCase().trim(),
              mergedIntoId: null,
            },
          });
        }

        if (!matchedCustomer && data.profile.phone) {
          matchedCustomer = await tx.customer.findFirst({
            where: {
              organizationId,
              phone: data.profile.phone.trim(),
              mergedIntoId: null,
            },
          });
        }
      }

      // 3. If no verified link was found, create a NEW distinct customer profile (display name match alone NEVER auto-links)
      if (!matchedCustomer) {
        matchedCustomer = await tx.customer.create({
          data: {
            organizationId,
            name: data.profile?.name || `Customer ${data.externalId.slice(-4)}`,
            email: data.profile?.email ? data.profile.email.toLowerCase().trim() : null,
            phone: data.profile?.phone ? data.profile.phone.trim() : null,
          },
        });
      }

      // 4. Create the channel identity link
      await tx.customerChannelIdentity.create({
        data: {
          organizationId,
          customerId: matchedCustomer.id,
          channelId: data.channelId,
          provider: data.provider,
          externalId: data.externalId,
          verified: data.profile?.verified ?? false,
        },
      });

      return matchedCustomer;
    });
  }
}
