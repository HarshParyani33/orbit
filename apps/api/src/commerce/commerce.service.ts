import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { TenantTransactionRunner } from '../tenancy/tenant-transaction-runner';
import {
  ShopifyCommerceAdapter,
  CourierLogisticsAdapter,
  CommerceOrder,
  CommerceActionResult,
  CancelOrderPayload,
  RefundOrderPayload,
  NdrReattemptPayload,
  ShipmentDetails,
} from '@orbit/integrations';

@Injectable()
export class CommerceService {
  private readonly shopifyAdapter: ShopifyCommerceAdapter;
  private readonly courierAdapter: CourierLogisticsAdapter;

  constructor(
    @Inject(TenantTransactionRunner)
    private readonly tenantRunner: TenantTransactionRunner
  ) {
    this.shopifyAdapter = new ShopifyCommerceAdapter();
    this.courierAdapter = new CourierLogisticsAdapter();
  }

  async getOrdersForCustomer(
    organizationId: string,
    query: { customerId?: string; email?: string; phone?: string; conversationId?: string }
  ): Promise<CommerceOrder[]> {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      let email = query.email;
      let phone = query.phone;

      // 1. If conversationId is supplied, lookup conversation customer
      if (query.conversationId && (!email && !phone)) {
        const conv = await tx.conversation.findUnique({
          where: { id: query.conversationId },
          include: { customer: true },
        });
        if (conv?.customer) {
          email = conv.customer.email || undefined;
          phone = conv.customer.phone || undefined;
        }
      }

      // 2. If customerId is supplied, lookup customer
      if (query.customerId && (!email && !phone)) {
        const customer = await tx.customer.findUnique({
          where: { id: query.customerId },
        });
        if (customer) {
          email = customer.email || undefined;
          phone = customer.phone || undefined;
        }
      }

      // If no identifiers found, fallback to sample demo order for testing
      const orders = await this.shopifyAdapter.getCustomerOrders({ email, phone });
      if (orders.length === 0 && (email || phone)) {
        // Return matching or default storefront orders
        return orders;
      }

      // Decorate with live courier updates if shipment AWB exists
      for (const order of orders) {
        if (order.shipment?.awbNumber) {
          const liveShipment = await this.courierAdapter.trackShipment(order.shipment.awbNumber);
          order.shipment = { ...order.shipment, ...liveShipment };
        }
      }

      return orders;
    });
  }

  async getOrderById(organizationId: string, orderId: string): Promise<CommerceOrder> {
    const order = await this.shopifyAdapter.getOrderById(orderId);
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found in connected store`);
    }

    if (order.shipment?.awbNumber) {
      const liveShipment = await this.courierAdapter.trackShipment(order.shipment.awbNumber);
      order.shipment = { ...order.shipment, ...liveShipment };
    }

    return order;
  }

  async cancelOrder(
    organizationId: string,
    payload: CancelOrderPayload
  ): Promise<CommerceActionResult> {
    const result = await this.shopifyAdapter.cancelOrder(payload);
    if (!result.success) {
      throw new BadRequestException(result.message);
    }
    return result;
  }

  async refundOrder(
    organizationId: string,
    payload: RefundOrderPayload
  ): Promise<CommerceActionResult> {
    const result = await this.shopifyAdapter.refundOrder(payload);
    if (!result.success) {
      throw new BadRequestException(result.message);
    }
    return result;
  }

  async trackShipment(
    organizationId: string,
    awbNumber: string
  ): Promise<ShipmentDetails> {
    return this.courierAdapter.trackShipment(awbNumber);
  }

  async scheduleNdrReattempt(
    organizationId: string,
    payload: NdrReattemptPayload
  ): Promise<CommerceActionResult> {
    const result = await this.courierAdapter.scheduleNdrReattempt(payload);
    if (!result.success) {
      throw new BadRequestException(result.message);
    }
    return result;
  }

  verifyShopifyWebhook(rawBody: string, signature: string, secret: string): boolean {
    return this.shopifyAdapter.verifyWebhookSignature(rawBody, signature, secret);
  }
}
