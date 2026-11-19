import * as crypto from 'crypto';
import {
  ICommerceAdapter,
  CommerceOrder,
  CancelOrderPayload,
  RefundOrderPayload,
  CommerceActionResult,
} from './types';

export interface ShopifyConfig {
  shopDomain?: string;
  accessToken?: string;
  webhookSecret?: string;
}

export class ShopifyCommerceAdapter implements ICommerceAdapter {
  readonly provider = 'SHOPIFY';
  private config: ShopifyConfig;

  // In-memory simulated cache of store orders for sandbox/testing
  private mockOrders: Map<string, CommerceOrder> = new Map();

  constructor(config: ShopifyConfig = {}) {
    this.config = config;
    this.seedMockStore();
  }

  private seedMockStore(): void {
    const orders: CommerceOrder[] = [
      {
        id: 'ord_shp_1001',
        orderNumber: '#ORB-10492',
        customerEmail: 'alex.morgan@example.com',
        customerPhone: '+15550192834',
        createdAt: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
        currency: 'USD',
        totalPrice: '149.00',
        financialStatus: 'paid',
        fulfillmentStatus: 'in_transit',
        lineItems: [
          {
            id: 'item_1',
            title: 'Lumina Cloud Runner Pro (Size 10 / Obsidian)',
            quantity: 1,
            price: '129.00',
            sku: 'LUM-CR-10-OBS',
            thumbnailUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&auto=format&fit=crop&q=80',
          },
          {
            id: 'item_2',
            title: 'Performance Merino Crew Socks (3-Pack)',
            quantity: 1,
            price: '20.00',
            sku: 'LUM-SK-03',
            thumbnailUrl: 'https://images.unsplash.com/photo-1586350977771-b3b0abd50c82?w=100&auto=format&fit=crop&q=80',
          },
        ],
        shippingAddress: {
          name: 'Alex Morgan',
          address1: '742 Evergreen Terrace',
          city: 'Springfield',
          province: 'OR',
          country: 'US',
          zip: '97477',
        },
        shipment: {
          carrier: 'FedEx Express / Shiprocket',
          awbNumber: 'SR-998241029US',
          trackingUrl: 'https://track.shiprocket.example/SR-998241029US',
          status: 'IN_TRANSIT',
          estimatedDelivery: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          lastLocation: 'Distribution Hub, Portland, OR',
          events: [
            {
              timestamp: new Date(Date.now() - 30 * 3600 * 1000).toISOString(),
              location: 'Seattle Origin Warehouse',
              activity: 'Package picked up by carrier',
            },
            {
              timestamp: new Date(Date.now() - 14 * 3600 * 1000).toISOString(),
              location: 'Portland Sorting Center',
              activity: 'Arrived at Sort Facility & In Transit',
            },
          ],
        },
      },
      {
        id: 'ord_shp_1002',
        orderNumber: '#ORB-10381',
        customerEmail: 'alex.morgan@example.com',
        customerPhone: '+15550192834',
        createdAt: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
        currency: 'USD',
        totalPrice: '89.50',
        financialStatus: 'paid',
        fulfillmentStatus: 'delivered',
        lineItems: [
          {
            id: 'item_3',
            title: 'All-Weather Waterproof Shell Jacket',
            quantity: 1,
            price: '89.50',
            sku: 'LUM-JK-AW',
            thumbnailUrl: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=100&auto=format&fit=crop&q=80',
          },
        ],
        shippingAddress: {
          name: 'Alex Morgan',
          address1: '742 Evergreen Terrace',
          city: 'Springfield',
          province: 'OR',
          country: 'US',
          zip: '97477',
        },
        shipment: {
          carrier: 'FedEx Express',
          awbNumber: 'SR-884102910US',
          trackingUrl: 'https://track.shiprocket.example/SR-884102910US',
          status: 'DELIVERED',
          estimatedDelivery: new Date(Date.now() - 12 * 24 * 3600 * 1000).toISOString(),
          lastLocation: 'Front Porch, Springfield, OR',
          events: [
            {
              timestamp: new Date(Date.now() - 12 * 24 * 3600 * 1000).toISOString(),
              location: 'Springfield, OR',
              activity: 'Delivered - Left at front door',
            },
          ],
        },
      },
      {
        id: 'ord_shp_1003',
        orderNumber: '#ORB-10512',
        customerEmail: 'sarah.connor@example.com',
        customerPhone: '+15550998877',
        createdAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
        currency: 'USD',
        totalPrice: '215.00',
        financialStatus: 'paid',
        fulfillmentStatus: 'in_transit',
        lineItems: [
          {
            id: 'item_4',
            title: 'Apex Tactical Running Backpack 25L',
            quantity: 1,
            price: '215.00',
            sku: 'APX-BP-25L',
          },
        ],
        shipment: {
          carrier: 'Shiprocket Surface',
          awbNumber: 'SR-773910284US',
          status: 'NDR_EXCEPTION',
          estimatedDelivery: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
          lastLocation: 'Denver Local Delivery Depot',
          events: [
            {
              timestamp: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
              location: 'Denver, CO',
              activity: 'Delivery attempted: Customer unavailable / Gate locked (NDR)',
            },
          ],
        },
      },
    ];

    for (const order of orders) {
      this.mockOrders.set(order.id, order);
    }
  }

  async getCustomerOrders(query: { email?: string; phone?: string }): Promise<CommerceOrder[]> {
    const results: CommerceOrder[] = [];
    const normalizedEmail = query.email?.toLowerCase().trim();
    const normalizedPhone = query.phone?.replace(/[^0-9+]/g, '');

    for (const order of this.mockOrders.values()) {
      const matchEmail = normalizedEmail && order.customerEmail.toLowerCase() === normalizedEmail;
      const matchPhone = normalizedPhone && order.customerPhone && order.customerPhone.replace(/[^0-9+]/g, '') === normalizedPhone;

      if (matchEmail || matchPhone) {
        results.push(order);
      }
    }

    // Sort newest first
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getOrderById(orderId: string): Promise<CommerceOrder | null> {
    return this.mockOrders.get(orderId) || null;
  }

  async cancelOrder(payload: CancelOrderPayload): Promise<CommerceActionResult> {
    const order = this.mockOrders.get(payload.orderId);
    if (!order) {
      return {
        success: false,
        action: 'CANCEL',
        orderId: payload.orderId,
        message: `Order ${payload.orderId} not found in store`,
      };
    }

    if (order.financialStatus === 'voided') {
      return {
        success: false,
        action: 'CANCEL',
        orderId: payload.orderId,
        message: 'Order is already cancelled/voided',
      };
    }

    order.financialStatus = 'voided';
    order.fulfillmentStatus = 'returned';

    return {
      success: true,
      action: 'CANCEL',
      orderId: payload.orderId,
      referenceId: `cnl_${crypto.randomBytes(6).toString('hex')}`,
      message: `Order ${order.orderNumber} successfully cancelled with reason: ${payload.reason}`,
      updatedStatus: 'voided',
    };
  }

  async refundOrder(payload: RefundOrderPayload): Promise<CommerceActionResult> {
    const order = this.mockOrders.get(payload.orderId);
    if (!order) {
      return {
        success: false,
        action: 'REFUND',
        orderId: payload.orderId,
        message: `Order ${payload.orderId} not found in store`,
      };
    }

    const currentTotal = parseFloat(order.totalPrice);
    if (payload.amount <= 0 || payload.amount > currentTotal) {
      return {
        success: false,
        action: 'REFUND',
        orderId: payload.orderId,
        message: `Invalid refund amount $${payload.amount}. Max refundable: $${currentTotal}`,
      };
    }

    order.financialStatus = payload.amount === currentTotal ? 'refunded' : 'partially_refunded';

    return {
      success: true,
      action: 'REFUND',
      orderId: payload.orderId,
      referenceId: `rfnd_${crypto.randomBytes(6).toString('hex')}`,
      message: `Refund of $${payload.amount.toFixed(2)} processed successfully for ${order.orderNumber}`,
      updatedStatus: order.financialStatus,
    };
  }

  verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
    if (!signature || !secret || !rawBody) {
      return false;
    }

    try {
      const generatedHmac = crypto
        .createHmac('sha256', secret)
        .update(rawBody, 'utf8')
        .digest('base64');

      const expectedBuf = Buffer.from(signature, 'utf8');
      const actualBuf = Buffer.from(generatedHmac, 'utf8');

      if (expectedBuf.length !== actualBuf.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuf, actualBuf);
    } catch {
      return false;
    }
  }
}
