import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { getConfig } from '@orbit/config';
import * as crypto from 'crypto';

@Injectable()
export class MetaSignatureGuard implements CanActivate {
  private readonly logger = new Logger(MetaSignatureGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const signatureHeader = req.headers['x-hub-signature-256'] as string | undefined;

    if (!signatureHeader) {
      this.logger.warn('Inbound webhook missing X-Hub-Signature-256 header');
      throw new UnauthorizedException('Missing X-Hub-Signature-256 header');
    }

    if (!signatureHeader.startsWith('sha256=')) {
      this.logger.warn('Inbound webhook has invalid X-Hub-Signature-256 format');
      throw new UnauthorizedException('Invalid X-Hub-Signature-256 format');
    }

    const providedSignatureHex = signatureHeader.slice('sha256='.length).trim();
    const config = getConfig();
    const appSecret = config.META_APP_SECRET;

    if (!appSecret) {
      this.logger.error('META_APP_SECRET is not configured on the server');
      throw new UnauthorizedException('Server configuration error');
    }

    // Retrieve raw body buffer
    let rawBodyBuffer: Buffer;
    if (Buffer.isBuffer(req.rawBody)) {
      rawBodyBuffer = req.rawBody;
    } else if (typeof req.rawBody === 'string') {
      rawBodyBuffer = Buffer.from(req.rawBody, 'utf8');
    } else if (req.body) {
      // Fallback for tests or standard JSON parsing if rawBody not attached
      rawBodyBuffer = Buffer.from(
        typeof req.body === 'string' ? req.body : JSON.stringify(req.body),
        'utf8'
      );
    } else {
      rawBodyBuffer = Buffer.from('', 'utf8');
    }

    const expectedSignatureHex = crypto
      .createHmac('sha256', appSecret)
      .update(rawBodyBuffer)
      .digest('hex');

    // Constant-time comparison to prevent timing side-channel attacks
    try {
      const providedBuffer = Buffer.from(providedSignatureHex, 'hex');
      const expectedBuffer = Buffer.from(expectedSignatureHex, 'hex');

      if (
        providedBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
      ) {
        this.logger.warn('Meta webhook signature verification failed');
        throw new UnauthorizedException('Invalid Meta webhook signature');
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      this.logger.warn(`Signature parsing error: ${err}`);
      throw new UnauthorizedException('Invalid Meta webhook signature format');
    }

    return true;
  }
}
