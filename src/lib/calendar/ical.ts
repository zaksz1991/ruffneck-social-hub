export type CalendarEvent = {
  id: string;
  title: string;
  brand: string;
  platform: string;
  account: string;
  scheduledAt: string;
  state: string;
};

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function utcStamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid calendar event date.');
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function foldLine(line: string): string {
  const chunks: string[] = [];
  let current = '';
  for (const character of line) {
    if (new TextEncoder().encode(current + character).length > 73) {
      chunks.push(current);
      current = ` ${character}`;
    } else current += character;
  }
  if (current) chunks.push(current);
  return chunks.join('\r\n');
}

export function buildCalendarIcs(events: CalendarEvent[], calendarName: string, generatedAt = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RuffNeck//Social Hub Calendar 2.5//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText(calendarName)}`,
    `DTSTAMP:${utcStamp(generatedAt.toISOString())}`,
  ];
  for (const event of events) {
    const cancelled = event.state === 'cancelled';
    lines.push(
      'BEGIN:VEVENT', `UID:${event.id}@ruffneck-social-hub`,
      `DTSTAMP:${utcStamp(generatedAt.toISOString())}`, `DTSTART:${utcStamp(event.scheduledAt)}`,
      `SUMMARY:${escapeText(event.title)}`,
      `DESCRIPTION:${escapeText(`${event.brand} | ${event.platform} | ${event.account} | ${event.state}`)}`,
      `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
