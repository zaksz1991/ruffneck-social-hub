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
