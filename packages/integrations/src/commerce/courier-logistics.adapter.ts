import * as crypto from 'crypto';
import {
  ICourierLogisticsAdapter,
  ShipmentDetails,
  NdrReattemptPayload,
  CommerceActionResult,
} from './types';

export interface CourierConfig {
  apiKey?: string;
  apiSecret?: string;
}

export class CourierLogisticsAdapter implements ICourierLogisticsAdapter {
  readonly provider = 'SHIPROCKET_COURIER';
  private config: CourierConfig;
  private trackingRegistry: Map<string, ShipmentDetails> = new Map();

  constructor(config: CourierConfig = {}) {
    this.config = config;
    this.seedTrackingData();
  }

  private seedTrackingData(): void {
    this.trackingRegistry.set('SR-998241029US', {
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
    });

    this.trackingRegistry.set('SR-884102910US', {
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
          activity: 'Delivered - Signed by Alex M.',
        },
      ],
    });

    this.trackingRegistry.set('SR-773910284US', {
      carrier: 'Shiprocket Surface',
      awbNumber: 'SR-773910284US',
      status: 'NDR_EXCEPTION',
      estimatedDelivery: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
      lastLocation: 'Denver Local Delivery Depot',
      events: [
        {
          timestamp: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
          location: 'Denver Hub',
          activity: 'Out for delivery',
        },
        {
          timestamp: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
          location: 'Denver, CO',
          activity: 'Delivery failed: Customer unavailable / Gate locked (NDR)',
        },
      ],
    });
  }

  async trackShipment(awbNumber: string): Promise<ShipmentDetails> {
    const shipment = this.trackingRegistry.get(awbNumber);
    if (shipment) {
      return shipment;
    }

    // Default synthesized fallback for dynamic AWBs
    return {
      carrier: 'Partner Courier Network',
      awbNumber,
      status: 'IN_TRANSIT',
      estimatedDelivery: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      lastLocation: 'Central Logistics Terminal',
      events: [
        {
          timestamp: new Date().toISOString(),
          location: 'Central Logistics Terminal',
          activity: 'In Transit to Destination Delivery Station',
        },
      ],
    };
  }

  async scheduleNdrReattempt(payload: NdrReattemptPayload): Promise<CommerceActionResult> {
    const shipment = this.trackingRegistry.get(payload.awbNumber);
    const referenceId = `ndr_${crypto.randomBytes(6).toString('hex')}`;

    if (shipment) {
      shipment.status = 'OUT_FOR_DELIVERY';
      shipment.events = shipment.events || [];
      shipment.events.push({
        timestamp: new Date().toISOString(),
        location: shipment.lastLocation || 'Local Depot',
        activity: `NDR Re-attempt scheduled for ${payload.preferredDate}. Instructions: "${payload.remarks}"`,
      });
      shipment.estimatedDelivery = payload.preferredDate;
    }

    return {
      success: true,
      action: 'NDR_REATTEMPT',
      awbNumber: payload.awbNumber,
      referenceId,
      message: `Carrier re-attempt confirmed for ${payload.preferredDate}. Reference: ${referenceId}`,
      updatedStatus: 'OUT_FOR_DELIVERY',
    };
  }
}
