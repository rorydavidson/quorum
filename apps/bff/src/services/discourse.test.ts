/**
 * discourse.test.ts — unit tests for the Discourse service
 *
 * DISCOURSE_MOCK=true is set in test-setup.ts, so discourse.ts operates in
 * mock mode. No network requests are made.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { getDiscourseTopics } from './discourse.js';

// Sanity check: mock mode must be active
beforeAll(() => {
  expect(process.env.DISCOURSE_MOCK).toBe('true');
});

// ---------------------------------------------------------------------------
// getDiscourseTopics
// ---------------------------------------------------------------------------

describe('getDiscourseTopics()', () => {
  it('returns a non-empty array of DiscoursePost objects for any slug', async () => {
    const posts = await getDiscourseTopics('any-category');
    expect(posts.length).toBeGreaterThan(0);
  });

  it('every post satisfies the DiscoursePost shape', async () => {
    const posts = await getDiscourseTopics('any-category');
    for (const p of posts) {
      expect(typeof p.id).toBe('number');
      expect(typeof p.title).toBe('string');
      expect(typeof p.slug).toBe('string');
      expect(typeof p.postsCount).toBe('number');
      expect(typeof p.replyCount).toBe('number');
      expect(typeof p.views).toBe('number');
      expect(typeof p.createdAt).toBe('string');
      expect(typeof p.lastPostedAt).toBe('string');
      expect(typeof p.url).toBe('string');
    }
  });

  it('returns an empty array when categorySlug is empty string', async () => {
    const posts = await getDiscourseTopics('');
    expect(posts).toHaveLength(0);
  });

  it('createdAt and lastPostedAt are valid ISO 8601 strings', async () => {
    const posts = await getDiscourseTopics('any-category');
    for (const p of posts) {
      expect(new Date(p.createdAt).toISOString()).toBe(p.createdAt);
      expect(new Date(p.lastPostedAt).toISOString()).toBe(p.lastPostedAt);
    }
  });

  it('url contains the topic slug and id', async () => {
    const posts = await getDiscourseTopics('any-category');
    for (const p of posts) {
      expect(p.url).toContain(String(p.id));
      expect(p.url).toContain(p.slug);
    }
  });

  it('url points to forums.snomed.org', async () => {
    const posts = await getDiscourseTopics('any-category');
    for (const p of posts) {
      expect(p.url).toMatch(/^https:\/\/forums\.snomed\.org/);
    }
  });

  it('respects the limit parameter', async () => {
    const posts = await getDiscourseTopics('any-category', 2);
    expect(posts.length).toBeLessThanOrEqual(2);
  });

  it('returns the same mock data regardless of category slug (mock mode)', async () => {
    const a = await getDiscourseTopics('board-members');
    const b = await getDiscourseTopics('working-group');
    expect(a).toEqual(b);
  });
});
