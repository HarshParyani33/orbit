import { describe, it, expect, beforeEach } from 'vitest';
import * as crypto from 'crypto';
import {
  ShopifyCommerceAdapter,
  CourierLogisticsAdapter,
} from '../../packages/integrations/src';

describe('Commerce & Logistics Connectors', () => {
  let shopifyAdapter: ShopifyCommerceAdapter;
  let courierAdapter: CourierLogisticsAdapter;

  beforeEach(() => {
    shopifyAdapter = new ShopifyCommerceAdapter();
    courierAdapter = new CourierLogisticsAdapter();
  });

  describe('Shopify Commerce Adapter', () => {
    it('1. retrieves customer orders matching customer email or phone', async () => {
      const ordersByEmail = await shopifyAdapter.getCustomerOrders({
        email: 'alex.morgan@example.com',
      });
      expect(ordersByEmail.length).toBeGreaterThanOrEqual(2);
      expect(ordersByEmail[0].customerEmail).toBe('alex.morgan@example.com');
      expect(ordersByEmail[0].lineItems.length).toBeGreaterThan(0);

      const ordersByPhone = await shopifyAdapter.getCustomerOrders({
        phone: '+15550192834',
      });
      expect(ordersByPhone.length).toBeGreaterThanOrEqual(2);
    });

    it('2. cancels an active order and transitions financial status to voided', async () => {
      const cancelResult = await shopifyAdapter.cancelOrder({
        orderId: 'ord_shp_1001',
        reason: 'customer',
        note: 'Customer changed their mind before dispatch',
      });

      expect(cancelResult.success).toBe(true);
      expect(cancelResult.action).toBe('CANCEL');
      expect(cancelResult.updatedStatus).toBe('voided');
      expect(cancelResult.referenceId).toBeDefined();

      const updated = await shopifyAdapter.getOrderById('ord_shp_1001');
      expect(updated?.financialStatus).toBe('voided');
      expect(updated?.fulfillmentStatus).toBe('returned');

      // Subsequent cancel attempts fail gracefully
      const reCancel = await shopifyAdapter.cancelOrder({
        orderId: 'ord_shp_1001',
        reason: 'customer',
      });
      expect(reCancel.success).toBe(false);
      expect(reCancel.message).toContain('already cancelled');
    });

    it('3. validates and executes order refund with bounds enforcement', async () => {
      // Negative / zero refund fails
      const zeroRefund = await shopifyAdapter.refundOrder({
        orderId: 'ord_shp_1002',
        amount: 0,
        reason: 'Customer courtesy',
      });
      expect(zeroRefund.success).toBe(false);

      // Excessive refund fails
      const excessiveRefund = await shopifyAdapter.refundOrder({
        orderId: 'ord_shp_1002',
        amount: 9999.0,
        reason: 'Typo amount',
      });
      expect(excessiveRefund.success).toBe(false);
      expect(excessiveRefund.message).toContain('Max refundable');

      // Valid partial refund succeeds
      const validRefund = await shopifyAdapter.refundOrder({
        orderId: 'ord_shp_1002',
        amount: 40.0,
        reason: 'Partial goodwill credit for late delivery',
      });
      expect(validRefund.success).toBe(true);
      expect(validRefund.action).toBe('REFUND');
      expect(validRefund.updatedStatus).toBe('partially_refunded');
    });

    it('4. strictly verifies Shopify HMAC-SHA256 webhook signatures using timingSafeEqual', () => {
      const secret = 'shpss_secret_key_88492048';
      const payload = JSON.stringify({
        id: 10492,
        financial_status: 'paid',
        total_price: '149.00',
      });

      const validSignature = crypto
        .createHmac('sha256', secret)
        .update(payload, 'utf8')
        .digest('base64');

      // Valid signature succeeds
      expect(shopifyAdapter.verifyWebhookSignature(payload, validSignature, secret)).toBe(true);

      // Tampered payload fails
      expect(shopifyAdapter.verifyWebhookSignature(payload + ' ', validSignature, secret)).toBe(false);

      // Forged signature fails
      expect(shopifyAdapter.verifyWebhookSignature(payload, 'invalid-signature-base64', secret)).toBe(false);

      // Empty secret/signature fails closed
      expect(shopifyAdapter.verifyWebhookSignature(payload, '', secret)).toBe(false);
    });
  });

  describe('Courier Logistics Adapter (Shiprocket & Carrier)', () => {
    it('5. returns live shipment details and delivery milestones for an AWB', async () => {
      const tracking = await courierAdapter.trackShipment('SR-998241029US');
      expect(tracking.awbNumber).toBe('SR-998241029US');
      expect(tracking.status).toBe('IN_TRANSIT');
      expect(tracking.events).toBeDefined();
      expect(tracking.events?.length).toBeGreaterThanOrEqual(2);
    });

    it('6. schedules an NDR re-attempt and updates tracking timeline', async () => {
      const preferredDate = '2026-11-21T10:00:00Z';
      const ndrResult = await courierAdapter.scheduleNdrReattempt({
        awbNumber: 'SR-773910284US',
        preferredDate,
        remarks: 'Please call customer at gate before arrival',
      });

      expect(ndrResult.success).toBe(true);
      expect(ndrResult.action).toBe('NDR_REATTEMPT');
      expect(ndrResult.updatedStatus).toBe('OUT_FOR_DELIVERY');

      const updatedTracking = await courierAdapter.trackShipment('SR-773910284US');
      expect(updatedTracking.status).toBe('OUT_FOR_DELIVERY');
      const latestEvent = updatedTracking.events?.[updatedTracking.events.length - 1];
      expect(latestEvent?.activity).toContain('NDR Re-attempt scheduled');
      expect(latestEvent?.activity).toContain('call customer at gate');
    });
  });
});
