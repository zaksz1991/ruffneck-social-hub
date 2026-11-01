import { describe, expect, it } from 'vitest';
import {
  buildFacebookPostInsightsUrls,
  buildInstagramMediaInsightsUrl,
  buildLinkedInOrganizationPostInsightsUrl,
  normalizeFacebookPostInsights,
  normalizeInstagramMediaInsights,
  normalizeLinkedInOrganizationPostInsights,
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


  it('normalizes official LinkedIn organization share statistics and preserves a documented negative like count', () => {
    const metrics = normalizeLinkedInOrganizationPostInsights({ elements: [{
      organizationalEntity: 'urn:li:organization:2414183',
      share: 'urn:li:share:7132564752928563200',
      totalShareStatistics: {
        impressionCount: 5287, uniqueImpressionsCount: 4900, likeCount: -1,
        commentCount: 24, shareCount: 5, clickCount: 78,
      },
    }] }, 'urn:li:share:7132564752928563200');
    expect(metrics).toEqual({ impressions: 5287, reach: 4900, likes: -1, comments: 24, shares: 5, saves: 0, clicks: 78 });
  });

  it('builds official LinkedIn share and UGC-post statistics URLs with strict URN validation', () => {
    const share = buildLinkedInOrganizationPostInsightsUrl({
      organizationUrn: 'urn:li:organization:2414183',
      postUrn: 'urn:li:share:7132564752928563200', apiVersion: '202610',
    });
    expect(share.origin).toBe('https://api.linkedin.com');
    expect(share.pathname).toBe('/rest/organizationalEntityShareStatistics');
    expect(share.searchParams.get('q')).toBe('organizationalEntity');
    expect(share.searchParams.get('organizationalEntity')).toBe('urn:li:organization:2414183');
    expect(share.searchParams.get('shares')).toBe('List(urn:li:share:7132564752928563200)');

    const ugc = buildLinkedInOrganizationPostInsightsUrl({
      organizationUrn: 'urn:li:organization:2414183',
      postUrn: 'urn:li:ugcPost:1000000', apiVersion: '202610',
    });
    expect(ugc.searchParams.get('ugcPosts[0]')).toBe('urn:li:ugcPost:1000000');
    expect(() => buildLinkedInOrganizationPostInsightsUrl({ organizationUrn: 'urn:li:organization:bad', postUrn: 'urn:li:share:1', apiVersion: '202610' })).toThrow();
    expect(() => buildLinkedInOrganizationPostInsightsUrl({ organizationUrn: 'urn:li:organization:1', postUrn: 'https://evil.test', apiVersion: '202610' })).toThrow();
    expect(() => buildLinkedInOrganizationPostInsightsUrl({ organizationUrn: 'urn:li:organization:1', postUrn: 'urn:li:share:1', apiVersion: 'v2026.10' })).toThrow();
  });

  it('treats an empty LinkedIn element list as a valid zero-engagement post', () => {
    expect(normalizeLinkedInOrganizationPostInsights({ elements: [] }, 'urn:li:share:123')).toEqual({
      impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0,
    });
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
