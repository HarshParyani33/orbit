import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationsService } from '../../apps/api/src/conversations/conversations.service';
import { IWhatsAppAdapter, IInstagramAdapter } from '@orbit/integrations';

describe('ConversationsService — Milestone 2 Ticket Lifecycle & Private Notes', () => {
  let service: ConversationsService;
  let mockTenantRunner: any;
  let mockRealtimeService: any;
  let mockAutomationsService: any;
  let mockWhatsAppAdapter: IWhatsAppAdapter;
  let mockInstagramAdapter: IInstagramAdapter;

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const convId = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    mockWhatsAppAdapter = {
      provider: 'META_WHATSAPP',
      sendMessage: vi.fn().mockResolvedValue({ success: true, externalMessageId: 'wa-123' }),
    };

    mockInstagramAdapter = {
      provider: 'META_INSTAGRAM',
      sendMessage: vi.fn().mockResolvedValue({ success: true, externalMessageId: 'ig-123' }),
    };

    mockRealtimeService = {
      emitConversationCreated: vi.fn(),
      emitConversationStatusChanged: vi.fn(),
      emitMessageCreated: vi.fn(),
    };

    mockAutomationsService = {
      evaluateRules: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('supports updating ticket status across extended statuses (e.g., ESCALATED, AWAITING, IN_QUEUE)', async () => {
    const fakeConversation = {
      id: convId,
      organizationId: tenantId,
      status: 'OPEN',
      channel: { id: 'ch-1', name: 'Support WhatsApp', provider: 'META_WHATSAPP' },
    };

    const mockTx = {
      conversation: {
        findFirst: vi.fn().mockResolvedValue(fakeConversation),
        update: vi.fn().mockImplementation(({ data }) => ({
          ...fakeConversation,
          status: data.status,
          updatedAt: data.updatedAt,
        })),
      },
    };

    mockTenantRunner = {
      runWithTenant: vi.fn((orgId, callback) => callback(mockTx)),
    };

    service = new ConversationsService(
      mockTenantRunner,
      mockRealtimeService,
      mockAutomationsService
    );

    const statusesToTest = ['IN_QUEUE', 'ESCALATED', 'AWAITING', 'INVESTIGATING', 'REOPENED', 'RESOLVED'];

    for (const status of statusesToTest) {
      const updated = await service.updateConversationStatus(tenantId, convId, status);
      expect(updated.status).toBe(status);
      expect(mockRealtimeService.emitConversationStatusChanged).toHaveBeenCalledWith(
        tenantId,
        convId,
        status
      );
    }
  });

  it('creates Private Internal Notes without dispatching to WhatsApp adapter', async () => {
    const fakeConversation = {
      id: convId,
      organizationId: tenantId,
      status: 'OPEN',
      channel: {
        id: 'ch-1',
        provider: 'META_WHATSAPP',
        config: { phoneNumberId: 'phone-123' },
      },
      customer: {
        id: 'cust-1',
        phone: '+14155552671',
      },
    };

    const createdNote = {
      id: 'msg-note-1',
      organizationId: tenantId,
      conversationId: convId,
      senderType: 'NOTE',
      content: 'Customer mentioned they are an enterprise VIP account. Escalate to tier 2 if needed.',
      createdAt: new Date(),
    };

    const mockTx = {
      conversation: {
        findFirst: vi.fn().mockResolvedValue(fakeConversation),
        update: vi.fn().mockResolvedValue(fakeConversation),
      },
      message: {
        create: vi.fn().mockResolvedValue(createdNote),
      },
    };

    mockTenantRunner = {
      runWithTenant: vi.fn((orgId, callback) => callback(mockTx)),
    };

    service = new ConversationsService(
      mockTenantRunner,
      mockRealtimeService,
      mockAutomationsService
    );
    service.setWhatsAppAdapter(mockWhatsAppAdapter);

    const result = await service.createMessage(tenantId, convId, {
      content: 'Customer mentioned they are an enterprise VIP account. Escalate to tier 2 if needed.',
      senderType: 'NOTE',
    });

    expect(result.senderType).toBe('NOTE');
    // WhatsApp adapter must NOT have been called for internal notes!
    expect(mockWhatsAppAdapter.sendMessage).not.toHaveBeenCalled();
    // Realtime notification was emitted to agents
    expect(mockRealtimeService.emitMessageCreated).toHaveBeenCalledWith(
      tenantId,
      convId,
      createdNote
    );
  });

  it('dispatches to WhatsApp adapter when an AGENT replies publicly', async () => {
    const fakeConversation = {
      id: convId,
      organizationId: tenantId,
      status: 'OPEN',
      channel: {
        id: 'ch-1',
        provider: 'META_WHATSAPP',
        config: { phoneNumberId: 'phone-123' },
      },
      customer: {
        id: 'cust-1',
        phone: '+14155552671',
      },
    };

    const createdMsg = {
      id: 'msg-agent-1',
      organizationId: tenantId,
      conversationId: convId,
      senderType: 'AGENT',
      content: 'Hello! We have reviewed your request and processed the order.',
      createdAt: new Date(),
    };

    const mockTx = {
      conversation: {
        findFirst: vi.fn().mockResolvedValue(fakeConversation),
        update: vi.fn().mockResolvedValue(fakeConversation),
      },
      message: {
        create: vi.fn().mockResolvedValue(createdMsg),
      },
    };

    mockTenantRunner = {
      runWithTenant: vi.fn((orgId, callback) => callback(mockTx)),
    };

    service = new ConversationsService(
      mockTenantRunner,
      mockRealtimeService,
      mockAutomationsService
    );
    service.setWhatsAppAdapter(mockWhatsAppAdapter);

    const result = await service.createMessage(tenantId, convId, {
      content: 'Hello! We have reviewed your request and processed the order.',
      senderType: 'AGENT',
    });

    expect(result.senderType).toBe('AGENT');
    // WhatsApp adapter was called with phone and content
    expect(mockWhatsAppAdapter.sendMessage).toHaveBeenCalledWith({
      phoneNumberId: 'phone-123',
      to: '+14155552671',
      text: 'Hello! We have reviewed your request and processed the order.',
    });
  });
});
