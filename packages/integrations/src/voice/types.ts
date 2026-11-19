/**
 * Project Orbit — Provider-Neutral Voice AI Architecture Contracts
 * Supports Twilio SIP, WebRTC, and conversational voice streaming.
 */

export type VoiceCallStatus =
  | 'INITIATED'
  | 'RINGING'
  | 'IN_PROGRESS'
  | 'TRANSFER_REQUESTED'
  | 'TRANSFERRED'
  | 'COMPLETED'
  | 'FAILED'
  | 'BUSY'
  | 'NO_ANSWER';

export interface VoiceTranscriptionTurn {
  id: string;
  role: 'customer' | 'assistant' | 'human_agent';
  transcript: string;
  confidence: number;
  durationMs: number;
  timestamp: string;
}

export interface VoiceHandoffBriefing {
  callId: string;
  conversationId: string;
  customerName?: string;
  customerPhone?: string;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'FRUSTRATED' | 'ANGRY';
  intent: string;
  summary: string;
  customerKeyPoints: string[];
  suggestedAction: string;
  transferredToTeam?: string;
  transferredAt: string;
}

export interface VoiceCallSession {
  id: string;
  organizationId: string;
  channelId: string;
  conversationId: string;
  externalCallSid: string;
  callerNumber: string;
  calledNumber: string;
  status: VoiceCallStatus;
  turns: VoiceTranscriptionTurn[];
  briefing?: VoiceHandoffBriefing;
  durationSeconds?: number;
  startedAt: string;
  endedAt?: string;
}

export interface VoiceOutboundCallOptions {
  organizationId: string;
  toPhoneNumber: string;
  fromPhoneNumber?: string;
  agentPersonaName?: string;
  greetingMessage?: string;
  context?: Record<string, unknown>;
}

export interface IVoiceProvider {
  readonly provider: string;
  initiateOutboundCall(options: VoiceOutboundCallOptions): Promise<{ callId: string; externalCallSid: string }>;
  terminateCall(externalCallSid: string): Promise<boolean>;
  generateHandoffBriefing(turns: VoiceTranscriptionTurn[]): Promise<VoiceHandoffBriefing>;
}
