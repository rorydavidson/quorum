import type { DiscoursePost } from '@snomed/types';

// ---------------------------------------------------------------------------
// Discourse public API client
// Forums at https://forums.snomed.org are publicly readable — no auth required.
// ---------------------------------------------------------------------------

const DISCOURSE_BASE = process.env.DISCOURSE_URL ?? 'https://forums.snomed.org';

/**
 * Returns true when mock mode should be used.
 * Controlled by DISCOURSE_MOCK=true env var (set automatically by the test
 * setup so tests never hit the real network).
 */
function isMockMode(): boolean {
  return process.env.DISCOURSE_MOCK === 'true';
}

// ---------------------------------------------------------------------------
// Mock data — used in test mode and when the env var is set
// ---------------------------------------------------------------------------

const MOCK_POSTS: DiscoursePost[] = [
  {
    id: 101,
    title: 'SNOMED CT Release Schedule 2025 — Discussion',
    slug: 'snomed-ct-release-schedule-2025-discussion',
    postsCount: 12,
    replyCount: 9,
    views: 348,
    createdAt: '2025-01-15T09:00:00.000Z',
    lastPostedAt: '2025-02-10T14:22:00.000Z',
    url: `${DISCOURSE_BASE}/t/snomed-ct-release-schedule-2025-discussion/101`,
  },
  {
    id: 102,
    title: 'Governance Review — Proposed Changes to Voting Procedures',
    slug: 'governance-review-proposed-changes-to-voting-procedures',
    postsCount: 7,
    replyCount: 5,
    views: 210,
    createdAt: '2025-02-01T11:30:00.000Z',
    lastPostedAt: '2025-02-20T08:45:00.000Z',
    url: `${DISCOURSE_BASE}/t/governance-review-proposed-changes-to-voting-procedures/102`,
  },
  {
    id: 103,
    title: 'Welcome to the Board Members Forum',
    slug: 'welcome-to-the-board-members-forum',
    postsCount: 3,
    replyCount: 1,
    views: 512,
    createdAt: '2024-12-01T08:00:00.000Z',
    lastPostedAt: '2024-12-05T10:15:00.000Z',
    url: `${DISCOURSE_BASE}/t/welcome-to-the-board-members-forum/103`,
  },
];

// ---------------------------------------------------------------------------
// Discourse API response shape (subset we care about)
// ---------------------------------------------------------------------------

interface RawTopic {
  id: number;
  title: string;
  slug: string;
  posts_count: number;
  reply_count: number;
  views: number;
  created_at: string;
  last_posted_at: string;
}

interface DiscourseLatestResponse {
  topic_list?: {
    topics?: RawTopic[];
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the latest topics from a Discourse category.
 *
 * Returns an empty array if:
 *  - `categorySlug` is empty
 *  - the network request fails (graceful degradation)
 *  - the API returns an unexpected shape
 *
 * In mock mode (DISCOURSE_MOCK=true) returns the hardcoded MOCK_POSTS.
 */
export async function getDiscourseTopics(
  categorySlug: string,
  limit = 5,
): Promise<DiscoursePost[]> {
  if (!categorySlug) return [];

  if (isMockMode()) {
    return MOCK_POSTS.slice(0, limit);
  }

  const url = `${DISCOURSE_BASE}/c/${encodeURIComponent(categorySlug)}/l/latest.json?per_page=${limit}`;

  let raw: DiscourseLatestResponse;
  try {
    const res = await fetch(url, {
      headers: {
        // Discourse expects a valid User-Agent; browsers set this automatically
        'User-Agent': 'Quorum-Portal/1.0 (SNOMED International governance portal)',
        'Accept': 'application/json',
      },
      // Upstream is a public API — cache for 2 minutes to avoid hammering it
      // (Next.js fetch cache semantics don't apply here; this is Node fetch)
    });

    if (!res.ok) {
      console.warn(`[discourse] API returned ${res.status} for category "${categorySlug}"`);
      return [];
    }

    raw = await res.json() as DiscourseLatestResponse;
  } catch (err) {
    console.warn(`[discourse] Failed to fetch topics for category "${categorySlug}":`, err);
    return [];
  }

  const topics: RawTopic[] = raw?.topic_list?.topics ?? [];

  return topics.slice(0, limit).map((t) => ({
    id: t.id,
    title: t.title,
    slug: t.slug,
    postsCount: t.posts_count,
    replyCount: t.reply_count,
    views: t.views,
    createdAt: t.created_at,
    lastPostedAt: t.last_posted_at,
    url: `${DISCOURSE_BASE}/t/${t.slug}/${t.id}`,
  }));
}
