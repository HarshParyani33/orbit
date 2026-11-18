import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Request } from 'express';
import { TokenService } from '../auth/token.service';
import { WidgetVisitorPayload } from '@orbit/shared';

export interface AuthenticatedWidgetRequest extends Request {
  visitor: WidgetVisitorPayload;
}

@Injectable()
export class WidgetGuard implements CanActivate {
  constructor(@Inject(TokenService) private readonly tokenService: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // 1. Extract Bearer token or cookie
    let token: string | undefined;
    const authHeader = request.headers['authorization'];
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (request.cookies?.widget_token) {
      token = request.cookies.widget_token;
    }

    if (!token) {
      throw new UnauthorizedException('Widget visitor authentication token required');
    }

    try {
      const payload = this.tokenService.verifyWidgetToken(token);
      if (payload.type !== 'WIDGET_VISITOR') {
        throw new ForbiddenException('Invalid token type for widget endpoints');
      }

      request.visitor = payload;
      return true;
    } catch (err: any) {
      if (err instanceof ForbiddenException) {
        throw err;
      }
      throw new UnauthorizedException('Widget visitor token expired or invalid');
    }
  }
}
