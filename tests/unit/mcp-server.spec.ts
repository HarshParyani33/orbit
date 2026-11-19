import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpService } from '../../apps/api/src/mcp/mcp.service';

describe('Model Context Protocol (MCP) Server Endpoint', () => {
  let mcpService: McpService;
  let mockTenantRunner: any;
  let mockAnalyticsService: any;
  let mockCommerceService: any;
  let mockTx: any;

  beforeEach(() => {
    mockTx = {
      conversation: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'conv_1',
            title: 'Package tracking inquiry',
            status: 'OPEN',
            customer: { name: 'Alex Morgan' },
            channel: { name: 'WhatsApp' },
            updatedAt: new Date(),
          },
        ]),
      },
      customer: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'cust_1',
          name: 'Alex Morgan',
          email: 'alex.morgan@example.com',
          phone: '+15550192834',
          channelIdentities: [{ provider: 'META_WHATSAPP', externalId: '+15550192834' }],
          conversations: [],
        }),
      },
      knowledgeChunk: {
        findMany: vi.fn().mockResolvedValue([
          {
            chunkText: 'Our return policy is 30 days from delivery date in original packaging.',
            chunkIndex: 0,
            document: { title: 'Return & Exchange Policy' },
          },
        ]),
      },
    };

    mockTenantRunner = {
      runWithTenant: vi.fn().mockImplementation((orgId, callback) => callback(mockTx)),
    };

    mockAnalyticsService = {
      getOverview: vi.fn().mockResolvedValue({ totalConversations: 70, openConversations: 14 }),
      getDeflection: vi.fn().mockResolvedValue({ deflectionRatePercent: 72 }),
      getPerformanceTat: vi.fn().mockResolvedValue({ slaAdherencePercent: 96 }),
      getCsat: vi.fn().mockResolvedValue({ surveyCsat: 4.7 }),
    };

    mockCommerceService = {
      getOrdersForCustomer: vi.fn().mockResolvedValue([
        { id: 'ord_1', orderNumber: '#ORB-10492', totalPrice: '149.00' },
      ]),
    };

    mcpService = new McpService(mockTenantRunner, mockAnalyticsService, mockCommerceService);
  });

  it('1. handles initialize handshake and declares server capabilities', async () => {
    const response = await mcpService.handleJsonRpc('org-1', {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
    });

    expect(response.error).toBeUndefined();
    expect(response.result?.serverInfo?.name).toBe('orbit-mcp-server');
    expect(response.result?.protocolVersion).toBe('2024-11-05');
  });

  it('2. lists available workspace tools: search_conversations, get_customer_context, query_knowledge_base, get_support_metrics', async () => {
    const response = await mcpService.handleJsonRpc('org-1', {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });

    expect(response.error).toBeUndefined();
    const toolNames = response.result?.tools?.map((t: any) => t.name);
    expect(toolNames).toContain('search_conversations');
    expect(toolNames).toContain('get_customer_context');
    expect(toolNames).toContain('query_knowledge_base');
    expect(toolNames).toContain('get_support_metrics');
  });

  it('3. executes tools/call for search_conversations within tenant context', async () => {
    const response = await mcpService.handleJsonRpc('org-1', {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'search_conversations',
        arguments: { query: 'package' },
      },
    });

    expect(response.error).toBeUndefined();
    expect(response.result?.content?.[0]?.text).toContain('Package tracking inquiry');
  });

  it('4. executes tools/call for get_support_metrics (deflection)', async () => {
    const response = await mcpService.handleJsonRpc('org-1', {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'get_support_metrics',
        arguments: { metricType: 'deflection' },
      },
    });

    expect(response.error).toBeUndefined();
    expect(response.result?.content?.[0]?.text).toContain('"deflectionRatePercent": 72');
  });

  it('5. returns standard JSON-RPC error codes on unknown method or invalid protocol', async () => {
    const invalidProto = await mcpService.handleJsonRpc('org-1', {
      jsonrpc: '1.0' as any,
      id: 5,
      method: 'initialize',
    });
    expect(invalidProto.error?.code).toBe(-32600);

    const unknownMethod = await mcpService.handleJsonRpc('org-1', {
      jsonrpc: '2.0',
      id: 6,
      method: 'non_existent_method',
    });
    expect(unknownMethod.error?.code).toBe(-32601);
  });
});
