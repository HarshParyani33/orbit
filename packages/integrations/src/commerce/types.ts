export interface CommerceLineItem {
  id: string;
  title: string;
  quantity: number;
  price: string;
  thumbnailUrl?: string;
  sku?: string;
}

export interface ShippingAddress {
  name: string;
  address1: string;
  city: string;
  province?: string;
  country: string;
  zip: string;
}

export type ShipmentStatus =
  | 'ORDER_PLACED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'NDR_EXCEPTION'
  | 'RETURNED_TO_ORIGIN';

export interface TrackingEvent {
  timestamp: string;
  location: string;
  activity: string;
}

export interface ShipmentDetails {
  carrier: string;
  awbNumber: string;
  trackingUrl?: string;
  status: ShipmentStatus;
  estimatedDelivery?: string;
  lastLocation?: string;
  events?: TrackingEvent[];
}

export interface CommerceOrder {
  id: string;
  orderNumber: string;
  customerEmail: string;
  customerPhone?: string;
  createdAt: string;
  currency: string;
  totalPrice: string;
  financialStatus: 'paid' | 'pending' | 'refunded' | 'partially_refunded' | 'voided';
  fulfillmentStatus: 'fulfilled' | 'unfulfilled' | 'partial' | 'in_transit' | 'delivered' | 'returned';
  lineItems: CommerceLineItem[];
  shippingAddress?: ShippingAddress;
  shipment?: ShipmentDetails;
}

export interface RefundOrderPayload {
  orderId: string;
  amount: number;
  reason: string;
  note?: string;
}

export interface CancelOrderPayload {
  orderId: string;
  reason: 'customer' | 'inventory' | 'fraud' | 'declined' | 'other';
  note?: string;
}

export interface NdrReattemptPayload {
  awbNumber: string;
  preferredDate: string;
  remarks: string;
  alternatePhone?: string;
}

export interface CommerceActionResult {
  success: boolean;
  action: 'REFUND' | 'CANCEL' | 'NDR_REATTEMPT' | 'TRACK';
  orderId?: string;
  awbNumber?: string;
  referenceId?: string;
  message: string;
  updatedStatus?: string;
}

export interface ICommerceAdapter {
  readonly provider: string;
  getCustomerOrders(query: { email?: string; phone?: string }): Promise<CommerceOrder[]>;
  getOrderById(orderId: string): Promise<CommerceOrder | null>;
  cancelOrder(payload: CancelOrderPayload): Promise<CommerceActionResult>;
  refundOrder(payload: RefundOrderPayload): Promise<CommerceActionResult>;
  verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean;
}

export interface ICourierLogisticsAdapter {
  readonly provider: string;
  trackShipment(awbNumber: string): Promise<ShipmentDetails>;
  scheduleNdrReattempt(payload: NdrReattemptPayload): Promise<CommerceActionResult>;
}
