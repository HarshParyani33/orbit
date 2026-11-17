import { Injectable, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { AuthSessionPayload } from '@orbit/shared';
import { getConfig } from '@orbit/config';

@Injectable()
export class TokenService {
  constructor(@Inject(JwtService) private readonly jwtService: JwtService) {}
  private readonly jwtSecret: string;

  constructor(@Inject(JwtService) private readonly jwtService: JwtService) {
    this.jwtSecret = getConfig().JWT_SECRET;
  }

  generateAccessToken(payload: AuthSessionPayload): string {
    return this.jwtService.sign(payload, {
      expiresIn: '15m',
      secret: process.env.JWT_SECRET,
      secret: this.jwtSecret,
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
      secret: process.env.JWT_SECRET,
      secret: this.jwtSecret,
    });
  }
}
