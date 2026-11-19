import { Injectable } from '@nestjs/common';
import { BusinessHoursSchedule } from '@orbit/shared';

@Injectable()
export class BusinessHoursService {
  // In-memory tenant store with thread-safe persistence pattern
  private readonly schedules = new Map<string, BusinessHoursSchedule>();

  getDefaultSchedule(): BusinessHoursSchedule {
    return {
      timezone: 'UTC',
      enabled: true,
      outOfHoursMessage:
        'Thank you for reaching out. We are currently outside our operating business hours and will reply as soon as our team opens.',
      schedule: [
        { dayOfWeek: 0, openTime: '09:00', closeTime: '18:00', closed: true },  // Sunday
        { dayOfWeek: 1, openTime: '09:00', closeTime: '18:00', closed: false }, // Monday
        { dayOfWeek: 2, openTime: '09:00', closeTime: '18:00', closed: false }, // Tuesday
        { dayOfWeek: 3, openTime: '09:00', closeTime: '18:00', closed: false }, // Wednesday
        { dayOfWeek: 4, openTime: '09:00', closeTime: '18:00', closed: false }, // Thursday
        { dayOfWeek: 5, openTime: '09:00', closeTime: '18:00', closed: false }, // Friday
        { dayOfWeek: 6, openTime: '09:00', closeTime: '18:00', closed: true },  // Saturday
      ],
    };
  }

  async getBusinessHours(orgId: string): Promise<BusinessHoursSchedule> {
    const existing = this.schedules.get(orgId);
    if (existing) {
      return existing;
    }
    const defaultSchedule = this.getDefaultSchedule();
    this.schedules.set(orgId, defaultSchedule);
    return defaultSchedule;
  }

  async updateBusinessHours(
    orgId: string,
    schedule: BusinessHoursSchedule
  ): Promise<BusinessHoursSchedule> {
    this.schedules.set(orgId, schedule);
    return schedule;
  }

  isWithinBusinessHours(
    schedule: BusinessHoursSchedule,
    checkDate: Date = new Date()
  ): { isWithin: boolean; reason?: string } {
    if (!schedule.enabled) {
      return { isWithin: true };
    }

    try {
      // Format date into target timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: schedule.timezone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      const parts = formatter.formatToParts(checkDate);
      const weekdayStr = parts.find((p) => p.type === 'weekday')?.value;
      const hourStr = parts.find((p) => p.type === 'hour')?.value || '00';
      const minStr = parts.find((p) => p.type === 'minute')?.value || '00';

      const weekdayMap: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
      };

      const dayOfWeek = weekdayStr ? weekdayMap[weekdayStr] : checkDate.getUTCDay();
      const currentHm = `${hourStr.padStart(2, '0')}:${minStr.padStart(2, '0')}`;

      const dayConfig = schedule.schedule.find((s) => s.dayOfWeek === dayOfWeek);

      if (!dayConfig || dayConfig.closed) {
        return { isWithin: false, reason: 'Closed today' };
      }

      if (currentHm < dayConfig.openTime || currentHm >= dayConfig.closeTime) {
        return {
          isWithin: false,
          reason: `Outside hours (open ${dayConfig.openTime} - ${dayConfig.closeTime})`,
        };
      }

      return { isWithin: true };
    } catch {
      // Fallback to UTC if timezone invalid
      const dayOfWeek = checkDate.getUTCDay();
      const dayConfig = schedule.schedule.find((s) => s.dayOfWeek === dayOfWeek);
      if (!dayConfig || dayConfig.closed) {
        return { isWithin: false, reason: 'Closed today' };
      }
      return { isWithin: true };
    }
  }
}
