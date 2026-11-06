import { describe, expect, it } from 'vitest';
import { buildCalendarIcs } from './ical';

describe('iCalendar export', () => {
  it('creates valid UTC events and escapes calendar text', () => {
    const result = buildCalendarIcs([{
      id: 'job-1',
      title: 'Launch, phase 1; ready',
      brand: 'Brand',
      platform: 'linkedin',
      account: 'Company Page',
      scheduledAt: '2026-10-31T10:30:00.000Z',
      state: 'queued',
    }], 'Client Calendar', new Date('2026-10-30T00:00:00.000Z'));

    expect(result).toContain('BEGIN:VCALENDAR\r\n');
    expect(result).toContain('DTSTART:20261031T103000Z');
    expect(result).toContain('SUMMARY:Launch\\, phase 1\\; ready');
    expect(result).toContain('STATUS:CONFIRMED');
    expect(result.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('marks cancelled jobs and rejects invalid dates', () => {
    const event = {
      id: 'job-2',
      title: 'Cancelled',
      brand: 'Brand',
      platform: 'facebook',
      account: 'Page',
      scheduledAt: '2026-10-31T10:30:00Z',
      state: 'cancelled',
    };

    const result = buildCalendarIcs([event], 'Client Calendar');
    expect(result).toContain('STATUS:CANCELLED');
    expect(() => buildCalendarIcs([{ ...event, scheduledAt: 'bad-date' }], 'Client Calendar'))
      .toThrow(/invalid calendar event date/i);
  });
});
