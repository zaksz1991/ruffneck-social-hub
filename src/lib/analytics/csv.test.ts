import { describe, expect, it } from 'vitest';
import { safeCsvCell, toCsv } from './csv';

describe('analytics CSV export', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(safeCsvCell('Page, "North"')).toBe('"Page, ""North"""');
    expect(safeCsvCell('line 1\nline 2')).toBe('"line 1\nline 2"');
  });
  it('neutralizes spreadsheet formulas', () => {
    expect(safeCsvCell('=HYPERLINK("https://bad")')).toBe('"\'=HYPERLINK(""https://bad"")"');
    expect(safeCsvCell('  +1+1')).toBe('"\'  +1+1"');
    expect(safeCsvCell('-1+2')).toBe('"\'-1+2"');
  });
  it('serializes rows as CRLF-separated CSV', () => {
    expect(toCsv([['a', 'b'], ['1', '2']])).toBe('"a","b"\r\n"1","2"');
  });
});
