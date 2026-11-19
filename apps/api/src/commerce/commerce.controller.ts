import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Headers,
  UseGuards,
  Inject,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { CommerceService } from './commerce.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CurrentTenant } from '../tenancy/tenant-context.decorator';
import { TenantContext } from '@orbit/shared';

@Controller('api/commerce')
export class CommerceController {
  constructor(
    @Inject(CommerceService)
    private readonly commerceService: CommerceService
  ) {}

  @Get('orders')
  @UseGuards(JwtAuthGuard, TenantGuard)
  async getOrders(
    @CurrentTenant() tenant: TenantContext,
    @Query('customerId') customerId?: string,
    @Query('email') email?: string,
    @Query('phone') phone?: string,
    @Query('conversationId') conversationId?: string
  ) {
    const orders = await this.commerceService.getOrdersForCustomer(tenant.orgId, {
      customerId,
      email,
      phone,
      conversationId,
    });
    return { success: true, data: orders };
  }

  @Get('orders/:orderId')
  @UseGuards(JwtAuthGuard, TenantGuard)
  async getOrder(
    @CurrentTenant() tenant: TenantContext,
    @Param('orderId') orderId: string
  ) {
    const order = await this.commerceService.getOrderById(tenant.orgId, orderId);
    return { success: true, data: order };
  }

  @Post('orders/:orderId/refund')
  @UseGuards(JwtAuthGuard, TenantGuard)
  async refundOrder(
    @CurrentTenant() tenant: TenantContext,
    @Param('orderId') orderId: string,
    @Body() body: { amount: number; reason: string; note?: string }
  ) {
    if (typeof body.amount !== 'number' || body.amount <= 0) {
      throw new BadRequestException('Amount must be a positive number');
    }
    const result = await this.commerceService.refundOrder(tenant.orgId, {
      orderId,
      amount: body.amount,
      reason: body.reason || 'Support refund',
      note: body.note,
    });
    return { success: true, data: result };
  }

  @Post('orders/:orderId/cancel')
  @UseGuards(JwtAuthGuard, TenantGuard)
  async cancelOrder(
    @CurrentTenant() tenant: TenantContext,
    @Param('orderId') orderId: string,
    @Body() body: { reason?: 'customer' | 'inventory' | 'fraud' | 'declined' | 'other'; note?: string }
  ) {
    const result = await this.commerceService.cancelOrder(tenant.orgId, {
      orderId,
      reason: body.reason || 'customer',
      note: body.note,
    });
    return { success: true, data: result };
  }

  @Post('shipments/track')
  @UseGuards(JwtAuthGuard, TenantGuard)
  async trackShipment(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { awbNumber: string }
  ) {
    if (!body.awbNumber) {
      throw new BadRequestException('awbNumber is required');
    }
    const shipment = await this.commerceService.trackShipment(tenant.orgId, body.awbNumber);
    return { success: true, data: shipment };
  }

  @Post('shipments/ndr-reattempt')
  @UseGuards(JwtAuthGuard, TenantGuard)
  async scheduleNdrReattempt(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { awbNumber: string; preferredDate: string; remarks: string; alternatePhone?: string }
  ) {
    if (!body.awbNumber || !body.preferredDate || !body.remarks) {
      throw new BadRequestException('awbNumber, preferredDate, and remarks are required');
    }
    const result = await this.commerceService.scheduleNdrReattempt(tenant.orgId, body);
    return { success: true, data: result };
  }

  @Post('webhooks/shopify')
  async handleShopifyWebhook(
    @Headers('x-shopify-hmac-sha256') signature?: string,
    @Headers('x-shopify-topic') topic?: string,
    @Body() payload?: any
  ) {
    const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET || 'test_shopify_secret_orbit';
    const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload || {});

    if (process.env.NODE_ENV !== 'test' && (!signature || !this.commerceService.verifyShopifyWebhook(rawBody, signature, webhookSecret))) {
      throw new UnauthorizedException('Invalid Shopify webhook HMAC signature');
    }

    return {
      success: true,
      received: true,
      topic: topic || 'orders/updated',
      timestamp: new Date().toISOString(),
    };
  }
}
