import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceService } from '../../apps/api/src/voice/voice.service';
import { TwilioVoiceProvider } from '../../packages/integrations/src';

describe('AI Voice Telephony Platform (M6)', () => {
  let voiceService: VoiceService;
  let twilioProvider: TwilioVoiceProvider;
  let mockTenantRunner: any;
  let mockTx: any;

  beforeEach(() => {
    mockTx = {
      customer: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'cust_voice_1', ...data })),
      },
      channel: {
        findFirst: vi.fn().mockResolvedValue({ id: 'chan_voice_1', name: 'Voice Line' }),
      },
      conversation: {
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'conv_voice_esc_1', ...data })),
      },
      message: {
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'msg_v_1', ...data })),
      },
    };

    mockTenantRunner = {
      runWithTenant: vi.fn().mockImplementation((orgId, callback) => callback(mockTx)),
    };

    voiceService = new VoiceService(mockTenantRunner);
    twilioProvider = new TwilioVoiceProvider();
  });

  it('1. initiates outbound voice call session with external call SID', async () => {
    const session = await voiceService.initiateOutboundCall('org-1', {
      toPhoneNumber: '+15550192834',
      agentPersonaName: 'Orbit Voice Concierge',
      greetingMessage: 'Hello Alex, calling regarding your recent order.',
    });

    expect(session.id).toBeDefined();
    expect(session.externalCallSid).toMatch(/^CA[a-f0-9]{32}$/);
    expect(session.status).toBe('IN_PROGRESS');
    expect(session.calledNumber).toBe('+15550192834');
    expect(session.turns.length).toBeGreaterThan(0);
  });

  it('2. enforces speech turnaround latency target under 1,200ms', () => {
    // Pipeline: Groq Whisper STT (180ms) + Groq Llama 3.1 70B (320ms) + Cartesia TTS (190ms) = 690ms
    const latencyReport = twilioProvider.calculateTurnaroundLatencyMs(180, 320, 190);
    expect(latencyReport.totalTurnaroundMs).toBe(690);
    expect(latencyReport.withinTarget).toBe(true);

    // Excessively slow external fallback trips condition
    const slowReport = twilioProvider.calculateTurnaroundLatencyMs(600, 800, 300);
    expect(slowReport.withinTarget).toBe(false);
  });

  it('3. executes automated human transfer and generates structured Briefing Card in Master Inbox', async () => {
    const result = await voiceService.requestHumanTransfer('org-1', 'call_99182');

    expect(result.session.status).toBe('TRANSFERRED');
    expect(result.briefing).toBeDefined();
    expect(result.briefing.intent).toBe('Order Status & Tracking Escalation');
    expect(result.briefing.suggestedAction).toContain('Check courier AWB');
    expect(result.conversationId).toBe('conv_voice_esc_1');

    // Confirms conversation was created with ESCALATED status
    expect(mockTx.conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ESCALATED' }),
      })
    );

    // Confirms Briefing Note was created with internal NOTE senderType
    expect(mockTx.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          senderType: 'NOTE',
          content: expect.stringContaining('VOICE HANDOFF BRIEFING CARD'),
        }),
      })
    );
  });

  it('4. hangs up active call and transitions status to COMPLETED', async () => {
    const session = await voiceService.hangupCall('org-1', 'call_99182');
    expect(session.status).toBe('COMPLETED');
    expect(session.endedAt).toBeDefined();
  });
});
