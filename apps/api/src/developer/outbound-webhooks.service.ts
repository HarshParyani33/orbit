import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';

export interface WebhookSubscription {
  id: string;
  organizationId: string;
  targetUrl: string;
  secret: string;
  events: string[];
  createdAt: Date;
  active: boolean;
}

@Injectable()
export class OutboundWebhooksService {
  private readonly subscriptions = new Map<string, WebhookSubscription[]>();

  async subscribe(
    organizationId: string,
    targetUrl: string,
    events: string[] = ['ticket.created', 'message.created', 'ticket.status_changed']
  ): Promise<WebhookSubscription> {
    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
        throw new BadRequestException('Target URL must use HTTPS');
      }
    } catch {
      throw new BadRequestException('Invalid target URL format');
    }

    const id = crypto.randomUUID();
    const secret = `whsec_${crypto.randomBytes(20).toString('hex')}`;

    const sub: WebhookSubscription = {
      id,
      organizationId,
      targetUrl,
      secret,
      events,
      createdAt: new Date(),
      active: true,
    };

    const orgSubs = this.subscriptions.get(organizationId) || [];
    orgSubs.push(sub);
    this.subscriptions.set(organizationId, orgSubs);

    return sub;
  }

  async listSubscriptions(organizationId: string): Promise<WebhookSubscription[]> {
    return (this.subscriptions.get(organizationId) || []).filter((s) => s.active);
  }

  async deleteSubscription(organizationId: string, id: string): Promise<void> {
    const orgSubs = this.subscriptions.get(organizationId) || [];
    const sub = orgSubs.find((s) => s.id === id && s.active);
    if (!sub) {
      throw new NotFoundException('Webhook subscription not found');
    }
    sub.active = false;
  }

  signPayload(payloadString: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
  }

  async dispatchEvent(
    organizationId: string,
    event: string,
    data: Record<string, unknown>
  ): Promise<void> {
    const orgSubs = (this.subscriptions.get(organizationId) || []).filter(
      (s) => s.active && (s.events.includes(event) || s.events.includes('*'))
    );

    const payloadString = JSON.stringify({
      id: crypto.randomUUID(),
      event,
      timestamp: new Date().toISOString(),
      organizationId,
      data,
    });

    for (const sub of orgSubs) {
      const signature = this.signPayload(payloadString, sub.secret);
      try {
        await fetch(sub.targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Orbit-Signature-256': signature,
            'X-Orbit-Timestamp': Date.now().toString(),
          },
          body: payloadString,
        });
      } catch {
        // Dispatches are best-effort with non-blocking error absorption
      }
    }
  }
}
