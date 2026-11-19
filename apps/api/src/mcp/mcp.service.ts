import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { TenantTransactionRunner } from '../tenancy/tenant-transaction-runner';
import { AnalyticsService } from '../analytics/analytics.service';
import { CommerceService } from '../commerce/commerce.service';

export interface McpToolDeclaration {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface McpJsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: any;
}

export interface McpJsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

@Injectable()
export class McpService {
  constructor(
    @Inject(TenantTransactionRunner)
    private readonly tenantRunner: TenantTransactionRunner,
    @Inject(AnalyticsService)
    private readonly analyticsService: AnalyticsService,
    @Inject(CommerceService)
    private readonly commerceService: CommerceService
  ) {}

  getToolDeclarations(): McpToolDeclaration[] {
    return [
      {
        name: 'search_conversations',
        description: 'Search workspace customer tickets and support conversations by keyword, channel, or status.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Keyword query or customer name' },
            status: { type: 'string', description: 'Filter status (e.g. OPEN, RESOLVED)' },
            limit: { type: 'number', description: 'Maximum results to return' },
          },
        },
      },
      {
        name: 'get_customer_context',
        description: 'Retrieve unified customer profile, linked social/messaging channel identities, and historical orders.',
        inputSchema: {
          type: 'object',
          properties: {
            email: { type: 'string', description: 'Customer email address' },
            phone: { type: 'string', description: 'Customer phone number' },
            customerId: { type: 'string', description: 'Orbit customer UUID' },
          },
        },
      },
      {
        name: 'query_knowledge_base',
        description: 'Semantic search over workspace RAG knowledge documents, policy manuals, and FAQs.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Natural language search query' },
            limit: { type: 'number', description: 'Maximum knowledge chunks to return' },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_support_metrics',
        description: 'Retrieve real-time workspace support metrics including open backlog, AI deflection rate, and SLA adherence.',
        inputSchema: {
          type: 'object',
          properties: {
            metricType: {
              type: 'string',
              enum: ['overview', 'deflection', 'tat', 'csat'],
              description: 'Which metric summary to retrieve',
            },
          },
        },
      },
    ];
  }

  async handleJsonRpc(
    organizationId: string,
    request: McpJsonRpcRequest
  ): Promise<McpJsonRpcResponse> {
    const id = request.id ?? null;

    try {
      if (request.jsonrpc !== '2.0') {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32600, message: 'Invalid Request: jsonrpc must be "2.0"' },
        };
      }

      // Method 1: initialize
      if (request.method === 'initialize') {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: {
              name: 'orbit-mcp-server',
              version: '1.0.0',
            },
          },
        };
      }

      // Method 2: tools/list
      if (request.method === 'tools/list') {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: this.getToolDeclarations(),
          },
        };
      }

      // Method 3: tools/call
      if (request.method === 'tools/call') {
        const { name, arguments: args } = request.params || {};
        const toolResult = await this.executeTool(organizationId, name, args || {});
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2),
              },
            ],
          },
        };
      }

      // Unknown method
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method "${request.method}" not found` },
      };
    } catch (err: any) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: err.message || 'Internal MCP Server Error' },
      };
    }
  }

  private async executeTool(
    organizationId: string,
    toolName: string,
    args: any
  ): Promise<any> {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      switch (toolName) {
        case 'search_conversations': {
          const conversations = await tx.conversation.findMany({
            where: {
              organizationId,
              ...(args.status ? { status: args.status } : {}),
              ...(args.query ? { title: { contains: args.query, mode: 'insensitive' } } : {}),
            },
            take: args.limit || 10,
            include: { customer: true, channel: true },
            orderBy: { updatedAt: 'desc' },
          });
          return conversations.map((c) => ({
            id: c.id,
            title: c.title,
            status: c.status,
            customer: c.customer?.name || 'Anonymous',
            channel: c.channel?.name,
            updatedAt: c.updatedAt,
          }));
        }

        case 'get_customer_context': {
          const customer = await tx.customer.findFirst({
            where: {
              organizationId,
              ...(args.customerId ? { id: args.customerId } : {}),
              ...(args.email ? { email: args.email } : {}),
              ...(args.phone ? { phone: args.phone } : {}),
            },
            include: { channelIdentities: true, conversations: { take: 5 } },
          });

          if (!customer) {
            return { message: 'Customer not found' };
          }

          const orders = await this.commerceService.getOrdersForCustomer(organizationId, {
            customerId: customer.id,
            email: customer.email || undefined,
            phone: customer.phone || undefined,
          });

          return {
            customer: {
              id: customer.id,
              name: customer.name,
              email: customer.email,
              phone: customer.phone,
              channelIdentities: customer.channelIdentities.map((ci) => ({
                provider: ci.provider,
                externalId: ci.externalId,
              })),
            },
            orders,
          };
        }

        case 'query_knowledge_base': {
          const chunks = await tx.knowledgeChunk.findMany({
            where: {
              organizationId,
              chunkText: { contains: args.query, mode: 'insensitive' },
            },
            take: args.limit || 5,
            include: { document: { select: { title: true } } },
          });
          return chunks.map((ch) => ({
            documentTitle: ch.document.title,
            chunkText: ch.chunkText,
            chunkIndex: ch.chunkIndex,
          }));
        }

        case 'get_support_metrics': {
          if (args.metricType === 'deflection') {
            return this.analyticsService.getDeflection(organizationId);
          }
          if (args.metricType === 'tat') {
            return this.analyticsService.getPerformanceTat(organizationId);
          }
          if (args.metricType === 'csat') {
            return this.analyticsService.getCsat(organizationId);
          }
          return this.analyticsService.getOverview(organizationId);
        }

        default:
          throw new BadRequestException(`Unknown MCP tool: ${toolName}`);
      }
    });
  }
}
