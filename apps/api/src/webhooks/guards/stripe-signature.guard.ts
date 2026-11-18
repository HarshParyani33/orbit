import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Request } from 'express';
import { getConfig } from '@orbit/config';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@Injectable()
export class StripeSignatureGuard implements CanActivate {
  private readonly logger = new Logger(StripeSignatureGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RawBodyRequest>();
    const signatureHeader = request.headers['stripe-signature'] as string | undefined;

    if (!signatureHeader) {
      this.logger.warn('Inbound Stripe webhook missing Stripe-Signature header');
      throw new UnauthorizedException('Missing Stripe-Signature header');
    }

    let rawBodyBuffer: Buffer;
    if (Buffer.isBuffer(request.rawBody)) {
      rawBodyBuffer = request.rawBody;
    } else if (typeof request.rawBody === 'string') {
      rawBodyBuffer = Buffer.from(request.rawBody, 'utf8');
    } else if (request.body) {
      rawBodyBuffer = Buffer.from(
        typeof request.body === 'string' ? request.body : JSON.stringify(request.body),
        'utf8'
      );
    } else {
      rawBodyBuffer = Buffer.from('', 'utf8');
    }

    const config = getConfig();
    const webhookSecret = config.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET is unconfigured in application environment');
      throw new UnauthorizedException('Stripe webhook verification unconfigured');
    }

    // Parse Stripe-Signature header format: t=1614555836,v1=5257a869e7eceacca...
    const headerParts = signatureHeader.split(',').reduce<Record<string, string[]>>((acc, item) => {
      const [key, value] = item.trim().split('=');
      if (key && value) {
        acc[key] = acc[key] || [];
        acc[key].push(value);
      }
      return acc;
    }, {});

    const timestamps = headerParts['t'];
    const signatures = headerParts['v1'];

    if (!timestamps || timestamps.length === 0 || !signatures || signatures.length === 0) {
      this.logger.warn('Inbound Stripe webhook has invalid Stripe-Signature format');
      throw new UnauthorizedException('Invalid Stripe-Signature header format');
    }

    const timestampSec = parseInt(timestamps[0], 10);
    if (isNaN(timestampSec)) {
      this.logger.warn('Inbound Stripe webhook has invalid timestamp');
      throw new UnauthorizedException('Invalid timestamp in Stripe-Signature');
    }

    // Replay attack prevention: tolerance of 300 seconds (5 minutes)
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - timestampSec) > 300) {
      this.logger.warn(
        `Inbound Stripe webhook timestamp is outside tolerance (delta: ${nowSec - timestampSec}s)`
      );
      throw new UnauthorizedException('Timestamp outside tolerance window');
    }

    // Compute expected signature: HMAC-SHA256 of "${timestampSec}.${rawBodyBuffer}"
    const payloadToSign = `${timestampSec}.${rawBodyBuffer.toString('utf8')}`;
    const expectedSignatureHex = crypto
      .createHmac('sha256', webhookSecret)
      .update(payloadToSign)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignatureHex, 'hex');

    // Constant-time comparison against all supplied v1 signatures
    const isValid = signatures.some((candidateSig) => {
      try {
        const candidateBuffer = Buffer.from(candidateSig, 'hex');
        if (candidateBuffer.length !== expectedBuffer.length) {
          return false;
        }
        return crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
      } catch {
        return false;
      }
    });

    if (!isValid) {
      this.logger.warn('Stripe webhook signature verification failed');
      throw new UnauthorizedException('Invalid Stripe webhook signature');
    }

    return true;
  }
}
