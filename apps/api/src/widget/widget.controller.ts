import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Headers,
  UseGuards,
  Ip,
  BadRequestException,
} from '@nestjs/common';
import { WidgetService } from './widget.service';
import { WidgetGuard, AuthenticatedWidgetRequest } from './widget.guard';
import {
  WidgetSessionInitInput,
  WidgetSendMessageInput,
  widgetSessionInitSchema,
  widgetSendMessageSchema,
} from '@orbit/validation';

@Controller('api/widget')
export class WidgetController {
  constructor(private readonly widgetService: WidgetService) {}

  /**
   * Public Session Initialization:
   * Accepts public channelId, validates Origin, associates/creates customer,
   * and issues a signed visitor token.
   */
  @Post('session/init')
  async initSession(
    @Body() rawBody: unknown,
    @Headers('origin') origin?: string,
    @Ip() clientIp?: string
  ) {
    const parsed = widgetSessionInitSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid widget session initialization payload',
        details: parsed.error.flatten(),
      });
    }

    return this.widgetService.initSession(parsed.data, origin, clientIp);
  }

  /**
   * Retrieve Conversation & Chronological History:
   * Protected strictly by WidgetGuard (requires valid WIDGET_VISITOR token).
   */
  @Get('conversation')
  @UseGuards(WidgetGuard)
  async getConversation(@Req() req: AuthenticatedWidgetRequest) {
    return this.widgetService.getConversation(req.visitor);
  }

  /**
   * Send Customer Message:
   * Protected strictly by WidgetGuard.
   * Emits real-time WebSocket events and updates unified agent inbox.
   */
  @Post('message')
  @UseGuards(WidgetGuard)
  async sendMessage(
    @Req() req: AuthenticatedWidgetRequest,
    @Body() rawBody: unknown
  ) {
    const parsed = widgetSendMessageSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid message payload',
        details: parsed.error.flatten(),
      });
    }

    return this.widgetService.sendMessage(req.visitor, parsed.data);
  }
}
