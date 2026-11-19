import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './auth.guard';
import { CurrentUser, RequestUser } from './current-user.decorator';
import { RateLimit, RateLimitGuard } from './rate-limit.guard';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from '@orbit/validation';
import { ApiResponse } from '@orbit/shared';

const isProduction = process.env.NODE_ENV === 'production';

@Controller('api/auth')
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  private setCookies(res: Response, accessToken: string, refreshToken: string) {
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
  }

  private clearCookies(res: Response) {
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/api/auth' });
  }

  @Post('register')
  @RateLimit({ maxRequests: 5, windowMs: 60000, keyPrefix: 'auth_reg' })
  async register(
    @Body() body: RegisterInput,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponse> {
    const validated = registerSchema.parse(body);
    const { response, accessToken, refreshToken } = await this.authService.register(validated);

    this.setCookies(res, accessToken, refreshToken);

    return {
      success: true,
      data: response,
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ maxRequests: 5, windowMs: 60000, keyPrefix: 'auth_login' })
  async login(
    @Body() body: LoginInput,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponse> {
    const validated = loginSchema.parse(body);
    const { response, accessToken, refreshToken } = await this.authService.login(validated);

    this.setCookies(res, accessToken, refreshToken);

    return {
      success: true,
      data: response,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ maxRequests: 30, windowMs: 60000, keyPrefix: 'auth_refresh' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponse> {
    const token = req.cookies?.refresh_token || req.body?.refreshToken;
    const { accessToken, refreshToken, user } = await this.authService.refresh(token);

    this.setCookies(res, accessToken, refreshToken);

    return {
      success: true,
      data: { user },
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponse> {
    const token = req.cookies?.refresh_token || req.body?.refreshToken;
    await this.authService.logout(token);
    this.clearCookies(res);

    return {
      success: true,
      data: { message: 'Logged out successfully' },
    };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ maxRequests: 5, windowMs: 60000, keyPrefix: 'auth_forgot' })
  async forgotPassword(@Body() body: ForgotPasswordInput): Promise<ApiResponse> {
    const validated = forgotPasswordSchema.parse(body);
    const result = await this.authService.forgotPassword(validated);
    return {
      success: true,
      data: result,
    };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ maxRequests: 5, windowMs: 60000, keyPrefix: 'auth_reset' })
  async resetPassword(@Body() body: ResetPasswordInput): Promise<ApiResponse> {
    const validated = resetPasswordSchema.parse(body);
    const result = await this.authService.resetPassword(validated);
    return {
      success: true,
      data: result,
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: RequestUser): Promise<ApiResponse> {
    const profile = await this.authService.getProfile(user.id);
    return {
      success: true,
      data: profile,
    };
  }
}

