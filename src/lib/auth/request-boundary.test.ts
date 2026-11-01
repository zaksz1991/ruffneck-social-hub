import { describe, expect, it } from 'vitest';
import { getRequestBoundaryDecision } from './request-boundary';

describe('request boundary policy', () => {
  it('delegates API authentication to route handlers, including machine endpoints', () => {
    for (const path of [
      '/api/cron/publishing',
      '/api/webhooks/instagram',
      '/api/analytics/export',
      '/api/publishing/export',
      '/api/integrations/facebook/callback',
      '/api/integrations/instagram/callback',
      '/api/health',
    ]) {
      expect(getRequestBoundaryDecision(path, false)).toBe('delegate-api');
    }
  });

  it('allows login, signup, auth callbacks and invitation pages without a session', () => {
    for (const path of ['/login', '/signup', '/auth/confirm', '/auth/callback', '/invite/token']) {
      expect(getRequestBoundaryDecision(path, false)).toBe('allow-public-page');
    }
  });

  it('redirects anonymous users away from protected pages', () => {
    expect(getRequestBoundaryDecision('/', false)).toBe('redirect-to-login');
    expect(getRequestBoundaryDecision('/publishing', false)).toBe('redirect-to-login');
    expect(getRequestBoundaryDecision('/team', false)).toBe('redirect-to-login');
  });

  it('keeps authenticated users on protected pages and redirects them away from auth screens', () => {
    expect(getRequestBoundaryDecision('/', true)).toBe('allow-authenticated-page');
    expect(getRequestBoundaryDecision('/analytics', true)).toBe('allow-authenticated-page');
    expect(getRequestBoundaryDecision('/login', true)).toBe('redirect-to-home');
    expect(getRequestBoundaryDecision('/signup', true)).toBe('redirect-to-home');
  });
});
