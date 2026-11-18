import { Injectable, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { AuthSessionPayload, WidgetVisitorPayload } from '@orbit/shared';
import { getConfig } from '@orbit/config';

@Injectable()
export class TokenService {
  private readonly jwtSecret: string;
  private readonly widgetJwtSecret: string;

  constructor(@Inject(JwtService) private readonly jwtService: JwtService) {
    const config = getConfig();
    this.jwtSecret = config.JWT_SECRET;
    this.widgetJwtSecret = config.WIDGET_JWT_SECRET || config.JWT_SECRET;
  }

  generateAccessToken(payload: AuthSessionPayload): string {
    return this.jwtService.sign(payload, {
      expiresIn: '15m',
      secret: this.jwtSecret,
    });
  }

  generateWidgetToken(payload: WidgetVisitorPayload): string {
    return this.jwtService.sign(payload, {
      expiresIn: '7d',
      secret: this.widgetJwtSecret,
    });
  }

  generateRefreshToken(): string {
    // 32 cryptographically secure random bytes
    return crypto.randomBytes(32).toString('hex');
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  verifyAccessToken(token: string): AuthSessionPayload {
    return this.jwtService.verify<AuthSessionPayload>(token, {
      secret: this.jwtSecret,
    });
  }

  verifyWidgetToken(token: string): WidgetVisitorPayload {
    return this.jwtService.verify<WidgetVisitorPayload>(token, {
      secret: this.widgetJwtSecret,
    });
  }

  decodeToken(token: string): any {
    return this.jwtService.decode(token);
  }
}
