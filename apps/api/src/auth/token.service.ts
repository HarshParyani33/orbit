import { Injectable, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { AuthSessionPayload } from '@orbit/shared';

@Injectable()
export class TokenService {
  constructor(@Inject(JwtService) private readonly jwtService: JwtService) {}

  generateAccessToken(payload: AuthSessionPayload): string {
    return this.jwtService.sign(payload, {
      expiresIn: '15m',
      secret: process.env.JWT_SECRET,
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
    });
  }
}
