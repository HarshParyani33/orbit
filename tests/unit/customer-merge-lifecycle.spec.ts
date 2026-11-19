import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomersService } from '../../apps/api/src/customers/customers.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('CustomersService — Milestone 2 Customer Identity Merge & Audit Trail', () => {
  let service: CustomersService;
  let mockTenantRunner: any;

  const tenantId = '00000000-0000-0000-0000-000000000001';
  const sourceCustId = '11111111-1111-1111-1111-111111111111';
  const targetCustId = '22222222-2222-2222-2222-222222222222';
  const userId = '33333333-3333-3333-3333-333333333333';

  beforeEach(() => {
    mockTenantRunner = {
      runWithTenant: vi.fn((orgId, cb) => cb(mockTx)),
    };
  });

  const mockTx = {
    customer: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    customerChannelIdentity: {
      update: vi.fn(),
      delete: vi.fn(),
    },
    conversation: {
      updateMany: vi.fn(),
    },
    customerMergeAudit: {
      create: vi.fn(),
    },
  };

  it('rejects self-merge where sourceCustomerId === targetCustomerId', async () => {
    service = new CustomersService(mockTenantRunner);

    await expect(
      service.mergeCustomers(tenantId, sourceCustId, sourceCustId, userId, 'Duplicate test')
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects merge if source or target customer does not exist', async () => {
    mockTx.customer.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    service = new CustomersService(mockTenantRunner);

    await expect(
      service.mergeCustomers(tenantId, sourceCustId, targetCustId, userId, 'Duplicate test')
    ).rejects.toThrow(NotFoundException);
  });

  it('successfully executes atomic customer merge, repointing identities, conversations, and recording audit log', async () => {
    const sourceCustomer = {
      id: sourceCustId,
      organizationId: tenantId,
      name: 'Jane WhatsApp',
      email: null,
      phone: '+14155551111',
      metadata: {},
      mergedIntoId: null,
      channelIdentities: [
        {
          id: 'ident-wa-1',
          channelId: 'ch-wa-1',
          provider: 'META_WHATSAPP',
          externalId: '+14155551111',
          verified: true,
        },
      ],
      conversations: [{ id: 'conv-101' }],
    };

    const targetCustomer = {
      id: targetCustId,
      organizationId: tenantId,
      name: 'Jane Web',
      email: 'jane@example.com',
      phone: null,
      metadata: {},
      mergedIntoId: null,
      channelIdentities: [
        {
          id: 'ident-web-1',
          channelId: 'ch-web-1',
          provider: 'WEB_CHAT',
          externalId: 'visitor-web-99',
          verified: true,
        },
      ],
    };

    mockTx.customer.findFirst
      .mockResolvedValueOnce(sourceCustomer)
      .mockResolvedValueOnce(targetCustomer);

    mockTx.customerChannelIdentity.update.mockResolvedValue({ id: 'ident-wa-1' });
    mockTx.conversation.updateMany.mockResolvedValue({ count: 1 });
    mockTx.customer.update.mockResolvedValue({
      id: targetCustId,
      name: 'Jane Web',
      mergedIntoId: null,
    });
    mockTx.customerMergeAudit.create.mockResolvedValue({
      id: 'audit-merge-1',
      reason: 'Duplicate accounts confirmed',
    });

    service = new CustomersService(mockTenantRunner);

    const result = await service.mergeCustomers(
      tenantId,
      sourceCustId,
      targetCustId,
      userId,
      'Duplicate accounts confirmed'
    );

    // 1. Channel identity was repointed
    expect(mockTx.customerChannelIdentity.update).toHaveBeenCalledWith({
      where: { id: 'ident-wa-1' },
      data: { customerId: targetCustId },
    });

    // 2. Conversations were moved
    expect(mockTx.conversation.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: tenantId,
        customerId: sourceCustId,
      },
      data: {
        customerId: targetCustId,
      },
    });

    // 3. Source customer was flagged as merged
    expect(mockTx.customer.update).toHaveBeenCalledWith({
      where: {
        uq_customers_id_org: {
          id: sourceCustId,
          organizationId: tenantId,
        },
      },
      data: {
        mergedIntoId: targetCustId,
      },
    });

    // 4. Audit trail was recorded with snapshot
    expect(mockTx.customerMergeAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: tenantId,
          sourceCustomerId: sourceCustId,
          targetCustomerId: targetCustId,
          performedByUserId: userId,
          reason: 'Duplicate accounts confirmed',
        }),
      })
    );

    expect(result.mergedCustomerId).toBe(sourceCustId);
    expect(result.survivingCustomerId).toBe(targetCustId);
  });
});
