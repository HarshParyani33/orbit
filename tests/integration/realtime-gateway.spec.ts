import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/app.config';
import { AuthService } from '../../apps/api/src/auth/auth.service';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { ChannelsService } from '../../apps/api/src/channels/channels.service';
import { ConversationsService } from '../../apps/api/src/conversations/conversations.service';
import { io, Socket } from 'socket.io-client';

describe('Milestone 2 Slice 2.3 — Real-Time WebSocket Gateway & Tenant Isolation Tests', () => {
  let app: INestApplication;
  let baseUrl: string;
  let authService: AuthService;
  let prisma: PrismaService;
  let channelsService: ChannelsService;
  let conversationsService: ConversationsService;

  let tokenA: string;
  let userAId: string;
  let orgAId: string;
  let channelAId: string;

  let tokenB: string;
  let userBId: string;
  let orgBId: string;
  let channelBId: string;

  const openSockets: Socket[] = [];

  function createClientSocket(opts: {
    token?: string;
    organizationId?: string;
    transports?: string[];
  }): Promise<{ socket: Socket; connected: boolean; error?: any }> {
    return new Promise((resolve) => {
      const socket = io(baseUrl, {
        auth: {
          token: opts.token,
          organizationId: opts.organizationId,
        },
        transports: opts.transports || ['websocket'],
        reconnection: false,
        forceNew: true,
        timeout: 4000,
      });

      openSockets.push(socket);

      let isResolved = false;
      const done = (connected: boolean, error?: any) => {
        if (!isResolved) {
          isResolved = true;
          resolve({ socket, connected, error });
        }
      };

      socket.on('authenticated', () => {
        done(true);
      });

      socket.on('connect_error', (err: any) => {
        console.error('[TEST CLIENT connect_error]:', err?.message, 'description:', err?.description);
        done(false, err);
      });

      socket.on('error', (err: any) => {
        console.error('[TEST CLIENT error]:', err?.message);
        done(false, err);
      });

      // Guard timeout in case of silent disconnect or non-authenticated socket
      setTimeout(() => {
        if (!isResolved) {
          console.error('[TEST CLIENT TIMEOUT]: socket.connected is', socket.connected);
          done(socket.connected);
        }
      }, 8000);
    });
  }

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0, '127.0.0.1');

    baseUrl = await app.getUrl();
    authService = app.get(AuthService);
    prisma = app.get(PrismaService);
    channelsService = app.get(ChannelsService);
    conversationsService = app.get(ConversationsService);

    // Register User A in Org A
    const regA = await authService.register({
      name: 'Realtime Agent A',
      email: `agent_a_${Date.now()}@realtime-test.com`,
      password: 'Password123!',
      organizationName: `Realtime Org A ${Date.now()}`,
    });
    tokenA = regA.accessToken;
    userAId = regA.response.user.id;
    orgAId = regA.response.organizations[0].id;

    const chA = await channelsService.createChannel(orgAId, {
      name: 'Org A Web Desk',
      provider: 'WEB_CHAT',
    });
    channelAId = chA.id;

    // Register User B in Org B
    const regB = await authService.register({
      name: 'Realtime Agent B',
      email: `agent_b_${Date.now()}@realtime-test.com`,
      password: 'Password123!',
      organizationName: `Realtime Org B ${Date.now()}`,
    });
    tokenB = regB.accessToken;
    userBId = regB.response.user.id;
    orgBId = regB.response.organizations[0].id;

    const chB = await channelsService.createChannel(orgBId, {
      name: 'Org B WhatsApp',
      provider: 'META_WHATSAPP',
    });
    channelBId = chB.id;
  });

  afterAll(async () => {
    for (const socket of openSockets) {
      if (socket.connected) {
        socket.disconnect();
      }
    }
    await app.close();
    await prisma.$disconnect();
  });

  describe('1. Gateway Authentication & Security Gates', () => {
    it('rejects connection when no authentication token is provided', async () => {
      const { socket, connected, error } = await createClientSocket({});
      expect(socket.connected).toBe(false);
    });

    it('rejects connection when token is forged or invalid', async () => {
      const { socket } = await createClientSocket({
        token: 'invalid.forged.jwt.token',
      });
      expect(socket.connected).toBe(false);
    });

    it('rejects connection when user specifies an organization they do not belong to', async () => {
      // User A attempts to connect claiming Org B
      const { socket } = await createClientSocket({
        token: tokenA,
        organizationId: orgBId,
      });
      expect(socket.connected).toBe(false);
    });

    it('successfully connects and authenticates valid user within their organization', async () => {
      const { socket, connected } = await createClientSocket({
        token: tokenA,
        organizationId: orgAId,
      });

      expect(connected).toBe(true);
      expect(socket.connected).toBe(true);
    });
  });

  describe('2. Multi-Tenant Broadcast Isolation (Strict Boundary)', () => {
    let socketA: Socket;
    let socketB: Socket;

    beforeAll(async () => {
      const resA = await createClientSocket({ token: tokenA, organizationId: orgAId });
      socketA = resA.socket;
      const resB = await createClientSocket({ token: tokenB, organizationId: orgBId });
      socketB = resB.socket;
      expect(socketA.connected).toBe(true);
      expect(socketB.connected).toBe(true);
    });

    it('broadcasts conversation:created to active tenant and isolates from sibling tenants', async () => {
      const eventsB: any[] = [];
      socketB.on('conversation:created', (data) => eventsB.push(data));

      const eventAPromise = new Promise<any>((resolve) => {
        socketA.once('conversation:created', (data) => resolve(data));
      });

      // Create conversation in Org A
      const conv = await conversationsService.createConversation(orgAId, {
        channelId: channelAId,
        title: 'Org A Isolated Ticket',
        initialMessage: 'Customer inquiry in Org A',
      });

      const eventA = await Promise.race([
        eventAPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Event timeout for conversation:created')), 4000)),
      ]);

      // Org A client MUST receive the created event
      expect(eventA).toBeDefined();
      expect(eventA.conversation?.id).toBe(conv.id);

      // Org B client MUST receive ZERO events (Strict Tenant Isolation)
      expect(eventsB.length).toBe(0);
    });

    it('broadcasts conversation:status_changed to tenant room and keeps sibling tenants isolated', async () => {
      const eventsB: any[] = [];
      socketB.on('conversation:status_changed', (data) => eventsB.push(data));

      const statusAPromise = new Promise<any>((resolve) => {
        socketA.once('conversation:status_changed', (data) => resolve(data));
      });

      const conv = await conversationsService.createConversation(orgAId, {
        channelId: channelAId,
        title: 'Status Test Ticket',
      });

      await conversationsService.updateConversationStatus(orgAId, conv.id, 'RESOLVED');

      const statusA = await Promise.race([
        statusAPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Event timeout for conversation:status_changed')), 4000)),
      ]);

      expect(statusA.conversationId).toBe(conv.id);
      expect(statusA.status).toBe('RESOLVED');
      expect(eventsB.length).toBe(0);
    });
  });

  describe('3. Conversation Room Authorization & Cross-Tenant Snooping Defense', () => {
    let socketA: Socket;
    let socketB: Socket;
    let convAId: string;

    beforeAll(async () => {
      const resA = await createClientSocket({ token: tokenA, organizationId: orgAId });
      socketA = resA.socket;
      const resB = await createClientSocket({ token: tokenB, organizationId: orgBId });
      socketB = resB.socket;

      const conv = await conversationsService.createConversation(orgAId, {
        channelId: channelAId,
        title: 'Confidential Thread',
      });
      convAId = conv.id;
    });

    it('allows Org A client to join Org A conversation room', async () => {
      const ackPromise = new Promise((resolve) => {
        socketA.once('conversation:joined', (res) => resolve(res));
        socketA.once('error', (err) => resolve({ error: err }));
      });
      socketA.emit('conversation:join', { conversationId: convAId });
      const ack: any = await Promise.race([
        ackPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for conversation:joined')), 4000)),
      ]);

      expect(ack).toBeDefined();
      expect(ack.conversationId).toBe(convAId);
    });

    it('rejects Org B client attempting to join Org A conversation room', async () => {
      const ackPromise = new Promise((resolve) => {
        socketB.once('conversation:joined', (res) => resolve(res));
        socketB.once('error', (err) => resolve({ error: err }));
      });
      socketB.emit('conversation:join', { conversationId: convAId });
      const ack: any = await Promise.race([
        ackPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for conversation rejection')), 4000)),
      ]);

      expect(ack).toBeDefined();
      expect(ack.error).toBeDefined();
    });

    it('delivers message:created to conversation room and blocks snooping by other tenants', async () => {
      const messagesReceivedB: any[] = [];
      socketB.on('message:created', (data) => messagesReceivedB.push(data));

      const messageAPromise = new Promise<any>((resolve) => {
        socketA.once('message:created', (data) => resolve(data));
      });

      const messageContent = `Secret Token #${Date.now()}`;
      await conversationsService.createMessage(orgAId, convAId, {
        content: messageContent,
        senderType: 'AGENT',
      });

      const msgA = await Promise.race([
        messageAPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Event timeout for message:created')), 4000)),
      ]);

      // Org A client in the conversation room receives the message
      expect(msgA).toBeDefined();
      expect(msgA.message?.content).toBe(messageContent);

      // Org B client receives ZERO messages
      expect(messagesReceivedB.length).toBe(0);
    });

    it('unsubscribes from conversation room via conversation:leave', async () => {
      const messagesAfterLeave: any[] = [];
      socketA.on('message:created', (data) => messagesAfterLeave.push(data));

      // Client leaves conversation room
      const leavePromise = new Promise((resolve) => {
        socketA.once('conversation:left', (res) => resolve(res));
      });
      socketA.emit('conversation:leave', { conversationId: convAId });
      await Promise.race([
        leavePromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for conversation:left')), 4000)),
      ]);

      // Send another message
      await conversationsService.createMessage(orgAId, convAId, {
        content: 'Post-leave message',
        senderType: 'CUSTOMER',
      });

      await new Promise((r) => setTimeout(r, 200));

      // Should not receive conversation-room message after leaving
      expect(messagesAfterLeave.some((m) => m.message?.content === 'Post-leave message')).toBe(false);
    });
  });

  describe('4. Dynamic Tenant Switching & Cookie Authentication', () => {
    it('authenticates successfully via ambient HTTP-only cookie', async () => {
      const socket = io(baseUrl, {
        extraHeaders: {
          cookie: `access_token=${tokenA}`,
        },
        auth: {
          organizationId: orgAId,
        },
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      openSockets.push(socket);

      const connected = await new Promise((resolve) => {
        socket.on('authenticated', () => resolve(true));
        socket.on('connect_error', () => resolve(false));
        setTimeout(() => resolve(false), 3000);
      });

      expect(connected).toBe(true);
      expect(socket.connected).toBe(true);
    });

    it('handles dynamic tenant switching via tenant:join and rejects unauthorized org switch', async () => {
      const res = await createClientSocket({ token: tokenA, organizationId: orgAId });
      const socket = res.socket;
      expect(socket.connected).toBe(true);

      // Attempt to switch to Org B (not a member)
      const rejectPromise = new Promise((resolve) => {
        socket.once('tenant:joined', (r) => resolve(r));
        socket.once('error', (err) => resolve({ error: err }));
      });
      socket.emit('tenant:join', { organizationId: orgBId });
      const rejectAck: any = await rejectPromise;

      expect(rejectAck).toBeDefined();
      expect(rejectAck.error).toBeDefined();
    });
  });
});
