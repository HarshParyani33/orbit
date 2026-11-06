import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { TokenService } from './token.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // 1. Try to extract from HTTP-only cookie
    let token = request.cookies?.access_token;

    // 2. Fallback to Authorization: Bearer <token>
    if (!token && request.headers.authorization) {
      const parts = request.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      throw new UnauthorizedException('Authentication token missing');
    }

    try {
      const payload = this.tokenService.verifyAccessToken(token);
      request.user = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
      };
      return true;
    } catch (err) {
      throw new UnauthorizedException('Authentication token expired or invalid');
    }
  }
}
