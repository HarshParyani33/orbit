import {
  Controller,
  Post,
  Body,
  UseGuards,
  Inject,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { McpService, McpJsonRpcRequest } from './mcp.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CurrentTenant } from '../tenancy/tenant-context.decorator';
import { TenantContext } from '@orbit/shared';
import { ApiKeysService } from '../developer/api-keys.service';

@Controller('api/mcp')
export class McpController {
  constructor(
    @Inject(McpService)
    private readonly mcpService: McpService,
    @Inject(ApiKeysService)
    private readonly apiKeysService: ApiKeysService
  ) {}

  @Post()
  async handleMcpRpc(
    @Headers('authorization') authHeader?: string,
    @Headers('x-orbit-api-key') apiKeyHeader?: string,
    @Body() body?: McpJsonRpcRequest
  ) {
    if (!body || !body.method) {
      return {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Invalid JSON-RPC 2.0 Request' },
      };
    }

    // Support authentication via API key (e.g. for Claude Desktop / Cursor) or Bearer token
    let orgId = '00000000-0000-0000-0000-000000000001';

    const apiKey = apiKeyHeader || (authHeader?.startsWith('Bearer orb_live_') ? authHeader.slice(7) : null);
    if (apiKey) {
      const verified = await this.apiKeysService.validateApiKey(apiKey);
      if (!verified) {
        throw new UnauthorizedException('Invalid or revoked Orbit API Key for MCP server');
      }
      orgId = verified.organizationId;
    }

    const response = await this.mcpService.handleJsonRpc(orgId, body);
    return response;
  }
}
