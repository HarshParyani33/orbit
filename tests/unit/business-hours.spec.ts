import { describe, it, expect } from 'vitest';
import { BusinessHoursService } from '../../apps/api/src/organizations/business-hours.service';

describe('BusinessHoursService — Multi-Tenant Operating Schedule Engine', () => {
  const service = new BusinessHoursService();

  it('provides default business schedule with standard business days', () => {
    const schedule = service.getDefaultSchedule();
    expect(schedule.enabled).toBe(true);
    expect(schedule.timezone).toBe('UTC');
    expect(schedule.schedule).toHaveLength(7);

    // Monday (1) should be open 09:00 - 18:00
    const monday = schedule.schedule.find((s) => s.dayOfWeek === 1);
    expect(monday?.closed).toBe(false);
    expect(monday?.openTime).toBe('09:00');
    expect(monday?.closeTime).toBe('18:00');

    // Sunday (0) should be closed
    const sunday = schedule.schedule.find((s) => s.dayOfWeek === 0);
    expect(sunday?.closed).toBe(true);
  });

  it('accurately identifies time inside operating business hours', () => {
    const schedule = service.getDefaultSchedule();

    // Monday at 14:30 UTC
    const mondayAfternoon = new Date('2026-11-23T14:30:00Z');
    const result = service.isWithinBusinessHours(schedule, mondayAfternoon);
    expect(result.isWithin).toBe(true);
  });

  it('accurately flags outside hours for closed days (e.g. Sunday)', () => {
    const schedule = service.getDefaultSchedule();

    // Sunday at 14:00 UTC
    const sundayAfternoon = new Date('2026-11-22T14:00:00Z');
    const result = service.isWithinBusinessHours(schedule, sundayAfternoon);
    expect(result.isWithin).toBe(false);
    expect(result.reason).toBe('Closed today');
  });

  it('accurately flags outside hours before opening or after closing', () => {
    const schedule = service.getDefaultSchedule();

    // Monday at 08:30 UTC (before 09:00)
    const earlyMonday = new Date('2026-11-23T08:30:00Z');
    const earlyResult = service.isWithinBusinessHours(schedule, earlyMonday);
    expect(earlyResult.isWithin).toBe(false);
    expect(earlyResult.reason).toContain('Outside hours');

    // Monday at 19:00 UTC (after 18:00)
    const lateMonday = new Date('2026-11-23T19:00:00Z');
    const lateResult = service.isWithinBusinessHours(schedule, lateMonday);
    expect(lateResult.isWithin).toBe(false);
    expect(lateResult.reason).toContain('Outside hours');
  });

  it('allows all requests when business hours enforcement is disabled', () => {
    const schedule = service.getDefaultSchedule();
    schedule.enabled = false;

    // Sunday night
    const sundayNight = new Date('2026-11-22T23:59:00Z');
    const result = service.isWithinBusinessHours(schedule, sundayNight);
    expect(result.isWithin).toBe(true);
  });
});
