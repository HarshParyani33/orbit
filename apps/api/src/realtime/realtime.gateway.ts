import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getConfig } from '@orbit/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantTransactionRunner } from '../tenancy/tenant-transaction-runner';

export interface AuthenticatedSocketData {
  userId: string;
  organizationId?: string;
  userRole?: string;
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      cookies[key] = decodeURIComponent(val);
    }
  }
  return cookies;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: (_origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      callback(null, true);
    },
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    @Inject(JwtService)
    private readonly jwtService: JwtService,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(TenantTransactionRunner)
    private readonly tenantRunner: TenantTransactionRunner
  ) {}

  afterInit(server: Server) {
    server.use(async (socket: Socket, next: (err?: Error) => void) => {
      try {
        const config = getConfig();

        // 1. Extract Token from handshake auth, authorization header, or cookie
        let token: string | undefined = socket.handshake.auth?.token;
        if (!token && socket.handshake.headers?.authorization) {
          const auth = socket.handshake.headers.authorization;
          if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
            token = auth.slice(7);
          }
        }
        if (!token && socket.handshake.headers?.cookie) {
          const cookies = parseCookies(socket.handshake.headers.cookie);
          token = cookies['access_token'];
        }

        if (!token) {
          this.logger.warn(`[Socket ${socket.id}] Handshake rejected: No authentication token`);
          return next(new Error('Authentication required'));
        }

        // 2. Verify JWT signature & expiration
        let payload: any;
        try {
          payload = this.jwtService.verify(token, { secret: config.JWT_SECRET });
        } catch (err: any) {
          this.logger.warn(`[Socket ${socket.id}] Handshake rejected: Invalid JWT token - ${err.message}`);
          return next(new Error('Invalid or expired token'));
        }

        const userId = payload.sub;
        const initialOrgId = socket.handshake.auth?.organizationId || socket.handshake.query?.organizationId;

        const socketData: AuthenticatedSocketData = {
          userId,
        };

        // 3. If organizationId was provided, verify user's active membership
        if (initialOrgId && typeof initialOrgId === 'string') {
          const membership = await this.prisma.organizationMembership.findFirst({
            where: {
              userId,
              organizationId: initialOrgId,
            },
          });

          if (!membership) {
            this.logger.warn(`[Socket ${socket.id}] Handshake rejected: User not a member of org ${initialOrgId}`);
            return next(new Error('Unauthorized organization membership'));
          }

          socketData.organizationId = initialOrgId;
          socketData.userRole = membership.role;
        }

        socket.data = socketData;
        return next();
      } catch (err: any) {
        this.logger.error(`[Socket ${socket.id}] Unexpected handshake authentication error: ${err.message}`);
        return next(new Error('Internal authentication error'));
      }
    });
  }

  async handleConnection(client: Socket) {
    const orgId = client.data?.organizationId;
    if (orgId) {
      await client.join(`tenant:${orgId}`);
      this.logger.log(`[Socket ${client.id}] Joined room tenant:${orgId}`);
    }
    client.emit('authenticated', {
      userId: client.data?.userId,
      organizationId: orgId,
    });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`[Socket ${client.id}] Disconnected`);
  }

  @SubscribeMessage('tenant:join')
  async handleTenantJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { organizationId: string }
  ) {
    const userId = client.data?.userId;
    if (!userId) {
      return { error: 'Unauthenticated socket' };
    }

    if (!data?.organizationId) {
      return { error: 'organizationId is required' };
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId: data.organizationId,
      },
    });

    if (!membership) {
      client.emit('error', { message: 'Unauthorized organization membership' });
      return { error: 'Unauthorized organization membership' };
    }

    // Leave previous tenant room if different
    const currentOrgId = client.data.organizationId;
    if (currentOrgId && currentOrgId !== data.organizationId) {
      await client.leave(`tenant:${currentOrgId}`);
    }

    client.data.organizationId = data.organizationId;
    client.data.userRole = membership.role;
    await client.join(`tenant:${data.organizationId}`);

    this.logger.log(`[Socket ${client.id}] User ${userId} switched to room tenant:${data.organizationId}`);
    client.emit('tenant:joined', { organizationId: data.organizationId });
    return { success: true, organizationId: data.organizationId };
  }

  @SubscribeMessage('conversation:join')
  async handleConversationJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string }
  ) {
    const userId = client.data?.userId;
    const organizationId = client.data?.organizationId;

    if (!userId || !organizationId) {
      client.emit('error', { message: 'Authentication and active organization required' });
      return { error: 'Authentication and active organization required' };
    }

    if (!data?.conversationId) {
      client.emit('error', { message: 'conversationId is required' });
      return { error: 'conversationId is required' };
    }

    // Strictly verify conversation belongs to active organization using TenantTransactionRunner
    const conversation = await this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      return tx.conversation.findFirst({
        where: {
          id: data.conversationId,
          organizationId,
        },
      });
    });

    if (!conversation) {
      client.emit('error', { message: 'Conversation not found or unauthorized' });
      return { error: 'Conversation not found or unauthorized' };
    }

    await client.join(`conv:${data.conversationId}`);
    this.logger.log(`[Socket ${client.id}] Joined room conv:${data.conversationId}`);
    client.emit('conversation:joined', { conversationId: data.conversationId });
    return { success: true, conversationId: data.conversationId };
  }

  @SubscribeMessage('conversation:leave')
  async handleConversationLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string }
  ) {
    if (!data?.conversationId) {
      client.emit('error', { message: 'conversationId is required' });
      return { error: 'conversationId is required' };
    }

    await client.leave(`conv:${data.conversationId}`);
    client.emit('conversation:left', { conversationId: data.conversationId });
    return { success: true, conversationId: data.conversationId };
  }
}
