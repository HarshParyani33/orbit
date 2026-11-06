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
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './auth.guard';
import { CurrentUser, RequestUser } from './current-user.decorator';
import {
  registerSchema,
  loginSchema,
  RegisterInput,
  LoginInput,
} from '@orbit/validation';
import { ApiResponse } from '@orbit/shared';

const isProduction = process.env.NODE_ENV === 'production';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
      path: '/api/auth/refresh',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
  }

  private clearCookies(res: Response) {
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/api/auth/refresh' });
  }

  @Post('register')
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
