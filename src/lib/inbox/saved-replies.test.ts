import { describe, expect, it } from 'vitest';
import { savedReplyAppliesTo, validateSavedReplyInput } from './saved-replies';

describe('saved reply validation', () => {
  it('accepts a trimmed workspace-wide reply', () => {
    expect(validateSavedReplyInput({ providerScope: 'all', title: '  Welcome  ', body: '  Thanks for contacting us.  ' })).toEqual({
      ok: true, value: { providerScope: 'all', title: 'Welcome', body: 'Thanks for contacting us.' },
    });
  });
  it('rejects unsupported provider scopes', () => {
    expect(validateSavedReplyInput({ providerScope: 'linkedin', title: 'Welcome', body: 'Hello' })).toEqual({ ok: false, reason: 'provider' });
  });
  it('enforces title length', () => {
    expect(validateSavedReplyInput({ providerScope: 'facebook', title: 'x', body: 'Hello' })).toEqual({ ok: false, reason: 'title' });
    expect(validateSavedReplyInput({ providerScope: 'facebook', title: 'x'.repeat(81), body: 'Hello' })).toEqual({ ok: false, reason: 'title' });
  });
  it('enforces the provider message length bound', () => {
    expect(validateSavedReplyInput({ providerScope: 'instagram', title: 'Reply', body: '' })).toEqual({ ok: false, reason: 'body' });
    expect(validateSavedReplyInput({ providerScope: 'instagram', title: 'Reply', body: 'x'.repeat(2001) })).toEqual({ ok: false, reason: 'body' });
  });
  it('matches shared and provider-specific scopes', () => {
    expect(savedReplyAppliesTo('all', 'instagram')).toBe(true);
    expect(savedReplyAppliesTo('facebook', 'instagram')).toBe(false);
    expect(savedReplyAppliesTo('facebook', 'facebook')).toBe(true);
  });
});
