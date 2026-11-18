import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { TenantTransactionRunner } from '../../apps/api/src/tenancy/tenant-transaction-runner';
import { ChannelsService } from '../../apps/api/src/channels/channels.service';
import { ConversationsService } from '../../apps/api/src/conversations/conversations.service';
import { CustomersService } from '../../apps/api/src/customers/customers.service';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

describe('Milestone 2 Slice 2.4 — Customer Identity, Profile & Merge Integration Tests', () => {
  let prisma: PrismaService;
  let runner: TenantTransactionRunner;
  let channelsService: ChannelsService;
  let conversationsService: ConversationsService;
  let customersService: CustomersService;

  let orgAId: string;
  let orgBId: string;
  let channelAId: string;
  let channelBId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    runner = new TenantTransactionRunner(prisma);
    channelsService = new ChannelsService(runner);
    conversationsService = new ConversationsService(runner);
    customersService = new CustomersService(runner);

    const orgA = await prisma.organization.findUniqueOrThrow({ where: { slug: 'acme' } });
    const orgB = await prisma.organization.findUniqueOrThrow({ where: { slug: 'beta' } });
    orgAId = orgA.id;
    orgBId = orgB.id;

    // Create test channels
    const chA = await channelsService.createChannel(orgAId, {
      name: 'Customer Test WA',
      provider: 'META_WHATSAPP',
    });
    channelAId = chA.id;

    const chB = await channelsService.createChannel(orgBId, {
      name: 'Beta Customer Desk',
      provider: 'WEB_CHAT',
    });
    channelBId = chB.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('1. Customer Profile Lifecycle & Multi-Tenant Isolation', () => {
    let customerAId: string;

    it('creates a customer profile within active organization', async () => {
      const customer = await customersService.createCustomer(orgAId, {
        name: 'Alice Cooper',
        email: 'alice@rock.com',
        phone: '+15551234567',
        metadata: { vip: true, tier: 'enterprise' },
      });

      expect(customer.id).toBeDefined();
      expect(customer.organizationId).toBe(orgAId);
      expect(customer.name).toBe('Alice Cooper');
      expect(customer.email).toBe('alice@rock.com');
      expect(customer.phone).toBe('+15551234567');
      expect((customer.metadata as any).tier).toBe('enterprise');

      customerAId = customer.id;
    });

    it('retrieves customer profile with linked channel identities and conversation summary', async () => {
      const customer = await customersService.getCustomer(orgAId, customerAId);
      expect(customer.id).toBe(customerAId);
      expect(customer.organizationId).toBe(orgAId);
      expect(customer.name).toBe('Alice Cooper');
      expect(customer.channelIdentities).toEqual([]);
    });

    it('updates customer details within active organization', async () => {
      const updated = await customersService.updateCustomer(orgAId, customerAId, {
        name: 'Alice Cooper (Verified)',
        metadata: { vip: true, tier: 'vip_platinum' },
      });

      expect(updated.name).toBe('Alice Cooper (Verified)');
      expect((updated.metadata as any).tier).toBe('vip_platinum');
    });

    it('strictly isolates customer data across tenants: Org B cannot access Org A customer', async () => {
      // Direct access by rival organization throws NotFoundException
      await expect(customersService.getCustomer(orgBId, customerAId)).rejects.toThrow(
        NotFoundException
      );

      // Attempted update by rival organization throws NotFoundException
      await expect(
        customersService.updateCustomer(orgBId, customerAId, { name: 'Compromised Name' })
      ).rejects.toThrow(NotFoundException);
    });

    it('lists customers strictly scoped to active organization', async () => {
      // Create a customer in Org B
      await customersService.createCustomer(orgBId, {
        name: 'Beta Isolated Customer',
        email: 'beta.customer@test.com',
      });

      const listA = await customersService.listCustomers(orgAId, { limit: 50 });
      expect(listA.some((c) => c.id === customerAId)).toBe(true);
      expect(listA.some((c) => c.name === 'Beta Isolated Customer')).toBe(false);

      const listB = await customersService.listCustomers(orgBId, { limit: 50 });
      expect(listB.some((c) => c.id === customerAId)).toBe(false);
      expect(listB.some((c) => c.name === 'Beta Isolated Customer')).toBe(true);
    });
  });

  describe('2. Channel Identity Mapping & Deduplication', () => {
    let customerAId: string;

    beforeAll(async () => {
      const cust = await customersService.createCustomer(orgAId, {
        name: 'Bob Marley',
        email: 'bob@reggae.com',
      });
      customerAId = cust.id;
    });

    it('links external channel identity to customer profile', async () => {
      const identity = await customersService.linkChannelIdentity(orgAId, customerAId, {
        channelId: channelAId,
        provider: 'META_WHATSAPP',
        externalId: '+15559876543',
        verified: true,
      });

      expect(identity.id).toBeDefined();
      expect(identity.organizationId).toBe(orgAId);
      expect(identity.customerId).toBe(customerAId);
      expect(identity.channelId).toBe(channelAId);
      expect(identity.provider).toBe('META_WHATSAPP');
      expect(identity.externalId).toBe('+15559876543');
      expect(identity.verified).toBe(true);

      const customerWithIdentities = await customersService.getCustomer(orgAId, customerAId);
      expect(customerWithIdentities.channelIdentities).toHaveLength(1);
      expect(customerWithIdentities.channelIdentities[0].externalId).toBe('+15559876543');
    });

    it('rejects duplicate channel identity link when already bound to another customer', async () => {
      // Create rival customer in same organization
      const cust2 = await customersService.createCustomer(orgAId, {
        name: 'Rival Customer',
      });

      // Attempting to link the exact same WhatsApp number to a second customer in the same channel throws ConflictException
      await expect(
        customersService.linkChannelIdentity(orgAId, cust2.id, {
          channelId: channelAId,
          provider: 'META_WHATSAPP',
          externalId: '+15559876543',
        })
      ).rejects.toThrow(ConflictException);
    });

    it('rejects linking channel identity using a channel belonging to another organization', async () => {
      await expect(
        customersService.linkChannelIdentity(orgAId, customerAId, {
          channelId: channelBId, // Channel belongs to Org B!
          provider: 'WEB_CHAT',
          externalId: 'visitor_token_123',
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('3. Display-Name Collision Defense Invariant & Identity Resolution', () => {
    it('NEVER merges identities based only on matching display names (Strict Invariant)', async () => {
      const extA = `+1555_${Date.now()}_1`;
      const extB = `web_${Date.now()}_2`;

      // 1. First customer arrives with display name "Sarah Connor" on WhatsApp
      const firstCustomer = await customersService.resolveOrCreateByChannelIdentity(orgAId, {
        channelId: channelAId,
        provider: 'META_WHATSAPP',
        externalId: extA,
        profile: {
          name: 'Sarah Connor',
          verified: false, // Unverified display name
        },
      });

      // 2. Second customer arrives ALSO with display name "Sarah Connor" on Web Chat
      const secondCustomer = await customersService.resolveOrCreateByChannelIdentity(orgAId, {
        channelId: channelAId,
        provider: 'WEB_CHAT',
        externalId: extB,
        profile: {
          name: 'Sarah Connor', // Identical name!
          verified: false,
        },
      });

      // CONTRACT ENFORCEMENT:
      // Even though names are identical, they MUST remain two completely distinct customer records!
      expect(firstCustomer.id).toBeDefined();
      expect(secondCustomer.id).toBeDefined();
      expect(firstCustomer.id).not.toBe(secondCustomer.id);
    });

    it('auto-links channel identity when an authoritative verified email matches', async () => {
      const uniqueEmail = `jane.foster_${Date.now()}@astrophysics.org`;
      const uniqueExtId = `web_session_${Date.now()}`;

      // Existing customer with verified email
      const verifiedCust = await customersService.createCustomer(orgAId, {
        name: 'Dr. Jane Foster',
        email: uniqueEmail,
      });

      // Incoming connection with matching verified email
      const resolved = await customersService.resolveOrCreateByChannelIdentity(orgAId, {
        channelId: channelAId,
        provider: 'WEB_CHAT',
        externalId: uniqueExtId,
        profile: {
          name: 'Jane F.',
          email: uniqueEmail,
          verified: true, // Authoritative verification
        },
      });

      expect(resolved.id).toBe(verifiedCust.id);

      // Verify the new channel identity was linked to Dr. Jane Foster
      const fetched = await customersService.getCustomer(orgAId, verifiedCust.id);
      expect(fetched.channelIdentities.some((i) => i.externalId === uniqueExtId)).toBe(true);
    });
  });

  describe('4. Customer Identity Merge & Immutable Audit Trail', () => {
    let targetCustId: string;
    let sourceCustId: string;
    let conv1Id: string;
    let conv2Id: string;
    let targetExtId: string;
    let sourceExtId: string;

    beforeAll(async () => {
      targetExtId = `+1555_${Date.now()}_tgt`;
      sourceExtId = `batcave_${Date.now()}_src`;

      // Customer A (Target / Surviving profile)
      const target = await customersService.createCustomer(orgAId, {
        name: 'Bruce Wayne (Canonical)',
        email: `bruce_${Date.now()}@wayne-enterprises.com`,
      });
      targetCustId = target.id;

      await customersService.linkChannelIdentity(orgAId, targetCustId, {
        channelId: channelAId,
        provider: 'META_WHATSAPP',
        externalId: targetExtId,
        verified: true,
      });

      // Customer B (Source / To be merged)
      const source = await customersService.createCustomer(orgAId, {
        name: 'The Batman (Legacy)',
        phone: `+1555_${Date.now()}_bat`,
      });
      sourceCustId = source.id;

      await customersService.linkChannelIdentity(orgAId, sourceCustId, {
        channelId: channelAId,
        provider: 'WEB_CHAT',
        externalId: sourceExtId,
        verified: true,
      });

      // Create conversations linked to both customers
      const c1 = await conversationsService.createConversation(orgAId, {
        channelId: channelAId,
        customerId: targetCustId,
        title: 'Target Customer Conversation',
        initialMessage: 'Order inquiry for batmobile parts',
      });
      conv1Id = c1.id;

      const c2 = await conversationsService.createConversation(orgAId, {
        channelId: channelAId,
        customerId: sourceCustId,
        title: 'Source Customer Conversation',
        initialMessage: 'Technical support request from the cave',
      });
      conv2Id = c2.id;
    });

    it('rejects merging a customer into itself', async () => {
      await expect(
        customersService.mergeCustomers(
          orgAId,
          targetCustId,
          targetCustId,
          null,
          'Self merge attempt'
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('merges source customer into target customer, re-parents conversations & identities, and logs immutable audit trail', async () => {
      const mergeResult = await customersService.mergeCustomers(
        orgAId,
        sourceCustId,
        targetCustId,
        null,
        'Agent confirmed identical customer via security verification'
      );

      expect(mergeResult.success).toBe(true);
      expect(mergeResult.survivingCustomerId).toBe(targetCustId);
      expect(mergeResult.mergedCustomerId).toBe(sourceCustId);
      expect(mergeResult.auditId).toBeDefined();

      // 1. Verify source customer is flagged as merged (via tenant-scoped runner)
      const mergedSource = await runner.runWithTenant(orgAId, async (tx) => {
        return tx.customer.findUniqueOrThrow({
          where: { id: sourceCustId },
        });
      });
      expect(mergedSource.mergedIntoId).toBe(targetCustId);

      // 2. Verify channel identity from source was re-parented to target
      const targetCustomer = await customersService.getCustomer(orgAId, targetCustId);
      expect(targetCustomer.channelIdentities).toHaveLength(2);
      expect(targetCustomer.channelIdentities.some((i) => i.externalId === sourceExtId)).toBe(
        true
      );

      // 3. Verify conversations from source were re-parented to target
      const targetConversations = await customersService.getCustomerConversations(
        orgAId,
        targetCustId
      );
      expect(targetConversations.some((c) => c.id === conv1Id)).toBe(true);
      expect(targetConversations.some((c) => c.id === conv2Id)).toBe(true);

      // 4. Verify immutable audit log in customer_merge_audits (via tenant-scoped runner)
      const auditRecord = await runner.runWithTenant(orgAId, async (tx) => {
        return tx.customerMergeAudit.findUniqueOrThrow({
          where: { id: mergeResult.auditId },
        });
      });
      expect(auditRecord.organizationId).toBe(orgAId);
      expect(auditRecord.sourceCustomerId).toBe(sourceCustId);
      expect(auditRecord.targetCustomerId).toBe(targetCustId);
      expect(auditRecord.reason).toBe(
        'Agent confirmed identical customer via security verification'
      );
      expect((auditRecord.snapshot as any).sourceCustomer.name).toBe('The Batman (Legacy)');

      // 5. Resolving by source channel identity now returns canonical target customer
      const canonical = await customersService.resolveOrCreateByChannelIdentity(orgAId, {
        channelId: channelAId,
        provider: 'WEB_CHAT',
        externalId: sourceExtId,
      });
      expect(canonical.id).toBe(targetCustId);
    });

    it('rejects further modifications or re-merging of an already merged customer', async () => {
      // Attempting to update merged customer throws BadRequestException
      await expect(
        customersService.updateCustomer(orgAId, sourceCustId, { name: 'Attempted Post-Merge Update' })
      ).rejects.toThrow(BadRequestException);

      // Attempting to merge an already-merged customer throws BadRequestException
      const cust3 = await customersService.createCustomer(orgAId, { name: 'Third Customer' });
      await expect(
        customersService.mergeCustomers(
          orgAId,
          sourceCustId,
          cust3.id,
          null,
          'Re-merge attempt'
        )
      ).rejects.toThrow(BadRequestException);
    });
  });
});
