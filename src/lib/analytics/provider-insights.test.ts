import { describe, expect, it } from 'vitest';
import {
  buildFacebookPostInsightsUrls,
  buildInstagramMediaInsightsUrl,
  normalizeFacebookPostInsights,
  normalizeInstagramMediaInsights,
} from './provider-insights';

describe('provider insights normalization', () => {
  it('normalizes Instagram lifetime media metrics without assuming impressions still exists', () => {
    const metrics = normalizeInstagramMediaInsights({ data: [
      { name: 'views', values: [{ value: 1200 }] },
      { name: 'reach', values: [{ value: 900 }] },
      { name: 'likes', values: [{ value: 25 }] },
      { name: 'comments', values: [{ value: 4 }] },
      { name: 'saved', values: [{ value: 8 }] },
      { name: 'shares', values: [{ value: 3 }] },
    ] });
    expect(metrics).toEqual({ impressions: 1200, reach: 900, likes: 25, comments: 4, shares: 3, saves: 8, clicks: 0 });
  });

  it('normalizes Facebook media views and post summary fields', () => {
    const metrics = normalizeFacebookPostInsights({ data: [
      { name: 'post_media_view', values: [{ value: 400 }] },
      { name: 'post_total_media_view_unique', values: [{ value: 310 }] },
      { name: 'post_reactions_by_type_total', values: [{ value: { like: 10, love: 2, care: 1 } }] },
      { name: 'post_clicks', values: [{ value: 19 }] },
    ] }, {
      comments: { summary: { total_count: 7 } },
      reactions: { summary: { total_count: 13 } },
      shares: { count: 5 },
    });
    expect(metrics).toEqual({ impressions: 400, reach: 310, likes: 13, comments: 7, shares: 5, saves: 0, clicks: 19 });
  });

  it('rejects unexpected provider identifiers and API versions', () => {
    expect(() => buildInstagramMediaInsightsUrl({ mediaId: '123;access_token=leak', graphVersion: 'v26.0' })).toThrow();
    expect(() => buildInstagramMediaInsightsUrl({ mediaId: '123', graphVersion: 'latest' })).toThrow();
    expect(() => buildFacebookPostInsightsUrls({ postId: '123', graphVersion: 'v26.0' })).toThrow();
  });

  it('builds the documented Graph endpoints and current metric names', () => {
    const instagram = buildInstagramMediaInsightsUrl({ mediaId: '123456', graphVersion: 'v26.0' });
    expect(instagram.hostname).toBe('graph.instagram.com');
    expect(instagram.searchParams.get('metric')).toBe('views,reach,likes,comments,saved,shares');
    const facebook = buildFacebookPostInsightsUrls({ postId: '123_456', graphVersion: 'v26.0' });
    expect(facebook.insights.searchParams.get('metric')).toContain('post_media_view');
    expect(facebook.insights.searchParams.get('metric')).toContain('post_clicks');
    expect(facebook.insights.searchParams.get('period')).toBe('lifetime');
    expect(facebook.post.searchParams.get('fields')).toContain('comments.limit(0).summary(true)');
  });
});
