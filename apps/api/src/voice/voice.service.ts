import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { TenantTransactionRunner } from '../tenancy/tenant-transaction-runner';
import {
  TwilioVoiceProvider,
  VoiceCallSession,
  VoiceCallStatus,
  VoiceTranscriptionTurn,
  VoiceHandoffBriefing,
} from '@orbit/integrations';

@Injectable()
export class VoiceService {
  private readonly twilioProvider: TwilioVoiceProvider;
  private readonly callSessions: Map<string, VoiceCallSession> = new Map();

  constructor(
    @Inject(TenantTransactionRunner)
    private readonly tenantRunner: TenantTransactionRunner
  ) {
    this.twilioProvider = new TwilioVoiceProvider();
    this.seedMockSessions();
  }

  private seedMockSessions(): void {
    const s1: VoiceCallSession = {
      id: 'call_99182',
      organizationId: '00000000-0000-0000-0000-000000000001',
      channelId: 'chan_voice_1',
      conversationId: 'conv_voice_101',
      externalCallSid: 'CA994820194820',
      callerNumber: '+15550192834',
      calledNumber: '+18005550199',
      status: 'IN_PROGRESS',
      turns: [
        {
          id: 'turn_1',
          role: 'assistant',
          transcript: 'Thank you for calling Orbit Support. How can I help you today?',
          confidence: 0.98,
          durationMs: 1400,
          timestamp: new Date(Date.now() - 40 * 1000).toISOString(),
        },
        {
          id: 'turn_2',
          role: 'customer',
          transcript: 'Hi, I need to check where my package is, order #ORB-10492.',
          confidence: 0.95,
          durationMs: 2100,
          timestamp: new Date(Date.now() - 30 * 1000).toISOString(),
        },
        {
          id: 'turn_3',
          role: 'assistant',
          transcript: 'I see order #ORB-10492 is currently in transit with FedEx, out for delivery tomorrow in Springfield.',
          confidence: 0.99,
          durationMs: 2800,
          timestamp: new Date(Date.now() - 15 * 1000).toISOString(),
        },
      ],
      startedAt: new Date(Date.now() - 60 * 1000).toISOString(),
      durationSeconds: 60,
    };

    this.callSessions.set(s1.id, s1);
  }

  async getCallSessions(organizationId: string): Promise<VoiceCallSession[]> {
    return Array.from(this.callSessions.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  async initiateOutboundCall(
    organizationId: string,
    payload: { toPhoneNumber: string; agentPersonaName?: string; greetingMessage?: string }
  ): Promise<VoiceCallSession> {
    if (!payload.toPhoneNumber) {
      throw new BadRequestException('toPhoneNumber is required');
    }

    const { callId, externalCallSid } = await this.twilioProvider.initiateOutboundCall({
      organizationId,
      toPhoneNumber: payload.toPhoneNumber,
      agentPersonaName: payload.agentPersonaName || 'Orbit Voice Assistant',
      greetingMessage: payload.greetingMessage,
    });

    const session: VoiceCallSession = {
      id: callId,
      organizationId,
      channelId: 'chan_voice_default',
      conversationId: `conv_${callId}`,
      externalCallSid,
      callerNumber: '+18005550199',
      calledNumber: payload.toPhoneNumber,
      status: 'IN_PROGRESS',
      turns: [
        {
          id: `turn_${Date.now()}`,
          role: 'assistant',
          transcript: payload.greetingMessage || 'Hello! This is Orbit customer support calling regarding your account.',
          confidence: 0.99,
          durationMs: 1800,
          timestamp: new Date().toISOString(),
        },
      ],
      startedAt: new Date().toISOString(),
    };

    this.callSessions.set(session.id, session);
    return session;
  }

  async requestHumanTransfer(
    organizationId: string,
    callId: string
  ): Promise<{ session: VoiceCallSession; briefing: VoiceHandoffBriefing; conversationId: string }> {
    const session = this.callSessions.get(callId);
    if (!session) {
      throw new NotFoundException(`Voice call session ${callId} not found`);
    }

    // Generate handoff briefing from conversation turns
    const briefing = await this.twilioProvider.generateHandoffBriefing(session.turns);
    session.briefing = briefing;
    session.status = 'TRANSFERRED';

    // Atomically create high-priority ticket in Master Inbox with Briefing Note
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      // Find or create customer for caller phone
      let customer = await tx.customer.findFirst({
        where: { organizationId, phone: session.callerNumber },
      });

      if (!customer) {
        customer = await tx.customer.create({
          data: {
            organizationId,
            name: `Caller ${session.callerNumber}`,
            phone: session.callerNumber,
          },
        });
      }

      // Find channel
      const channel = await tx.channel.findFirst({ where: { organizationId } });
      if (!channel) {
        throw new BadRequestException('No channel found to host voice handoff ticket');
      }

      // Create conversation
      const conv = await tx.conversation.create({
        data: {
          organizationId,
          channelId: channel.id,
          customerId: customer.id,
          status: 'ESCALATED',
          title: `[VOICE TRANSFER] ${briefing.intent} from ${session.callerNumber}`,
        },
      });

      // Insert customer transcript messages
      await tx.message.create({
        data: {
          organizationId,
          conversationId: conv.id,
          senderType: 'CUSTOMER',
          content: `[Voice Call Transcript — Call SID ${session.externalCallSid}]:\n${session.turns
            .map((t) => `${t.role.toUpperCase()}: ${t.transcript}`)
            .join('\n')}`,
        },
      });

      // Insert private Team Note containing Briefing Card
      const noteContent = `📋 [VOICE HANDOFF BRIEFING CARD]
• Caller: ${customer.name} (${session.callerNumber})
• Detected Sentiment: ${briefing.sentiment}
• Primary Intent: ${briefing.intent}
• Call Summary: ${briefing.summary}
• Customer Key Points:
${briefing.customerKeyPoints.map((pt) => `  - ${pt}`).join('\n')}
• Suggested Action for Agent: ${briefing.suggestedAction}
• Assigned Queue: ${briefing.transferredToTeam}`;

      await tx.message.create({
        data: {
          organizationId,
          conversationId: conv.id,
          senderType: 'NOTE',
          content: noteContent,
        },
      });

      session.conversationId = conv.id;
      return {
        session,
        briefing,
        conversationId: conv.id,
      };
    });
  }

  async hangupCall(organizationId: string, callId: string): Promise<VoiceCallSession> {
    const session = this.callSessions.get(callId);
    if (!session) {
      throw new NotFoundException(`Voice call session ${callId} not found`);
    }

    session.status = 'COMPLETED';
    session.endedAt = new Date().toISOString();
    return session;
  }

  generateTwimlResponse(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Thank you for calling Orbit AI support. Your call is being routed to our intelligent voice agent.</Say>
  <Connect>
    <Stream url="wss://app.orbit.local/api/voice/media-stream" />
  </Connect>
</Response>`;
  }
}
