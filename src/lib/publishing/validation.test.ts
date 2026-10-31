import { describe, expect, it } from 'vitest';
import { validateScheduleInput } from './validation';

const contentId = '0f8fad5b-d9cb-469f-a165-70867728950e';
const accountId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('validateScheduleInput', () => {
  it('accepts a valid brand-local date and time', () => {
    expect(validateScheduleInput(contentId, accountId, '2027-01-15T09:30')).toEqual({
      ok: true,
      value: { contentId, socialAccountId: accountId, scheduledLocal: '2027-01-15T09:30' },
    });
  });

  it('rejects a malformed content id', () => {
    expect(validateScheduleInput('bad', accountId, '2027-01-15T09:30')).toEqual({
      ok: false,
      reason: 'content',
    });
  });

  it('rejects an invalid calendar date', () => {
    expect(validateScheduleInput(contentId, accountId, '2027-02-30T09:30')).toEqual({
      ok: false,
      reason: 'datetime',
    });
  });

  it('rejects values with seconds or timezone suffixes', () => {
    expect(validateScheduleInput(contentId, accountId, '2027-01-15T09:30:00Z')).toEqual({
      ok: false,
      reason: 'datetime',
    });
  });
});
