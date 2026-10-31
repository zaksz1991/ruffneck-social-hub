import { describe, expect, it } from 'vitest';
import { publicImageUrl } from './instagram-dispatch';

describe('Instagram publishing media validation', () => {
  it('accepts one public HTTPS image URL', () => {
    expect(publicImageUrl(['https://cdn.example.com/post.jpg'])).toBe('https://cdn.example.com/post.jpg');
    expect(publicImageUrl([{ url: 'https://cdn.example.com/post.jpg' }])).toBe('https://cdn.example.com/post.jpg');
  });
  it('rejects non-HTTPS, credentialed, empty and multiple media references', () => {
    expect(publicImageUrl(['http://cdn.example.com/post.jpg'])).toBeNull();
    expect(publicImageUrl(['https://user:pass@cdn.example.com/post.jpg'])).toBeNull();
    expect(publicImageUrl([])).toBeNull();
    expect(publicImageUrl(['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'])).toBeNull();
    expect(publicImageUrl([{ url: 'not-a-url' }])).toBeNull();
  });
});

import { afterEach, vi } from 'vitest';
import { encryptProviderSecret } from '@/lib/integrations/token-crypto';
import { dispatchFacebookImage, type InstagramJob } from './instagram-dispatch';

describe('Facebook Page publishing', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('publishes a single HTTPS image through the Page photos endpoint', async () => {
    const key = Buffer.alloc(32, 7);
    vi.stubEnv('SOCIAL_TOKEN_ENCRYPTION_KEY', key.toString('base64'));
    const encrypted = encryptProviderSecret('page-secret-token', key);
    const job: InstagramJob = {
      job_id: 'job-1', social_account_id: 'account-1', provider: 'facebook',
      provider_account_id: '123456789', caption: 'Launch announcement',
      media_refs: ['https://cdn.example.com/launch.jpg'],
      ciphertext: encrypted.ciphertext, iv: encrypted.iv, auth_tag: encrypted.authTag,
      token_expires_at: null, attempts: 1, max_attempts: 3,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://graph.facebook.com/v26.0/123456789/photos');
      expect(init?.method).toBe('POST');
      const form = init?.body as URLSearchParams;
      expect(form.get('url')).toBe('https://cdn.example.com/launch.jpg');
      expect(form.get('caption')).toBe('Launch announcement');
      expect(form.get('access_token')).toBe('page-secret-token');
      return new Response(JSON.stringify({ id: 'photo-1', post_id: 'post-1' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await dispatchFacebookImage(job, 'v26.0');
    expect(result).toEqual({ kind: 'published', providerPostId: 'post-1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not automatically retry an uncertain provider response', async () => {
    const key = Buffer.alloc(32, 8);
    vi.stubEnv('SOCIAL_TOKEN_ENCRYPTION_KEY', key.toString('base64'));
    const encrypted = encryptProviderSecret('page-secret-token', key);
    const job: InstagramJob = {
      job_id: 'job-2', social_account_id: 'account-2', provider: 'facebook',
      provider_account_id: '987654321', caption: 'A post',
      media_refs: ['https://cdn.example.com/post.jpg'],
      ciphertext: encrypted.ciphertext, iv: encrypted.iv, auth_tag: encrypted.authTag,
      token_expires_at: null, attempts: 1, max_attempts: 3,
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 2 } }), { status: 500 })));
    const result = await dispatchFacebookImage(job, 'v26.0');
    expect(result.kind).toBe('review');
    if (result.kind === 'review') expect(result.safe).toContain('avoid a duplicate post');
  });
});


import { dispatchLinkedInText } from './instagram-dispatch';

describe('LinkedIn organization text publishing', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('publishes an approved text-only post to the organization feed', async () => {
    const key = Buffer.alloc(32, 9);
    vi.stubEnv('SOCIAL_TOKEN_ENCRYPTION_KEY', key.toString('base64'));
    const encrypted = encryptProviderSecret('linkedin-access-token', key);
    const job: InstagramJob = {
      job_id: 'li-job-1', social_account_id: 'li-account-1', provider: 'linkedin',
      provider_account_id: '123456789', caption: 'A company update', media_refs: [],
      ciphertext: encrypted.ciphertext, iv: encrypted.iv, auth_tag: encrypted.authTag,
      token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), attempts: 1, max_attempts: 3,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.linkedin.com/rest/posts');
      expect(init?.method).toBe('POST');
      const headers = new Headers(init?.headers);
      expect(headers.get('LinkedIn-Version')).toBe('202610');
      expect(headers.get('authorization')).toBe('Bearer linkedin-access-token');
      const body = JSON.parse(String(init?.body));
      expect(body.author).toBe('urn:li:organization:123456789');
      expect(body.commentary).toBe('A company update');
      expect(body.lifecycleState).toBe('PUBLISHED');
      return new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:987654' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await dispatchLinkedInText(job, '202610');
    expect(result).toEqual({ kind: 'published', providerPostId: 'urn:li:share:987654' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects attached media and expired tokens without calling LinkedIn', async () => {
    const key = Buffer.alloc(32, 10);
    vi.stubEnv('SOCIAL_TOKEN_ENCRYPTION_KEY', key.toString('base64'));
    const encrypted = encryptProviderSecret('linkedin-access-token', key);
    const job: InstagramJob = {
      job_id: 'li-job-2', social_account_id: 'li-account-2', provider: 'linkedin',
      provider_account_id: '123456789', caption: 'A post', media_refs: ['https://cdn.example.com/a.jpg'],
      ciphertext: encrypted.ciphertext, iv: encrypted.iv, auth_tag: encrypted.authTag,
      token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), attempts: 1, max_attempts: 3,
    };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await dispatchLinkedInText(job, '202610')).kind).toBe('review');
    expect(fetchMock).not.toHaveBeenCalled();
    job.media_refs = [];
    job.token_expires_at = new Date(Date.now() - 60_000).toISOString();
    expect((await dispatchLinkedInText(job, '202610')).kind).toBe('review');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('moves uncertain provider responses to manual review instead of retrying', async () => {
    const key = Buffer.alloc(32, 11);
    vi.stubEnv('SOCIAL_TOKEN_ENCRYPTION_KEY', key.toString('base64'));
    const encrypted = encryptProviderSecret('linkedin-access-token', key);
    const job: InstagramJob = {
      job_id: 'li-job-3', social_account_id: 'li-account-3', provider: 'linkedin',
      provider_account_id: '123456789', caption: 'A post', media_refs: [],
      ciphertext: encrypted.ciphertext, iv: encrypted.iv, auth_tag: encrypted.authTag,
      token_expires_at: null, attempts: 1, max_attempts: 3,
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'temporary failure' }), { status: 503 })));
    const result = await dispatchLinkedInText(job, '202610');
    expect(result.kind).toBe('review');
  });
});
