import Link from 'next/link';
import { MessageCircle, ArrowRight, MessageSquare, Eye } from 'lucide-react';
import type { DiscoursePost } from '@snomed/types';

const DISCOURSE_BASE = process.env.DISCOURSE_URL ?? 'https://forums.snomed.org';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TopicRow({ post }: { post: DiscoursePost }) {
  return (
    <a
      href={post.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 px-5 py-3.5 hover:bg-snomed-blue-light/30 transition-colors group"
    >
      <MessageSquare
        size={15}
        className="flex-shrink-0 mt-0.5 text-snomed-grey/30 group-hover:text-snomed-blue transition-colors"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-snomed-grey group-hover:text-snomed-blue transition-colors line-clamp-1">
          {post.title}
        </p>
        <div className="mt-1 flex items-center gap-3 text-xs text-snomed-grey/50">
          <span className="flex items-center gap-1">
            <MessageCircle size={10} aria-hidden="true" />
            {post.postsCount} {post.postsCount === 1 ? 'post' : 'posts'}
          </span>
          <span className="flex items-center gap-1">
            <Eye size={10} aria-hidden="true" />
            {post.views.toLocaleString()}
          </span>
          <span>{relativeTime(post.lastPostedAt)}</span>
        </div>
      </div>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Main widget — server component (no 'use client' needed)
// ---------------------------------------------------------------------------

interface Props {
  topics: DiscoursePost[];
  categorySlug: string;
  spaceName: string;
}

export function ForumWidget({ topics, categorySlug, spaceName }: Props) {
  const categoryUrl = `${DISCOURSE_BASE}/c/${categorySlug}`;

  return (
    <section className="rounded-xl border border-snomed-border bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-snomed-border flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <MessageCircle size={18} className="text-snomed-blue" aria-hidden="true" />
          <h2 className="font-semibold text-snomed-grey">Discussions</h2>
        </div>
        <a
          href={categoryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-snomed-blue hover:underline"
          aria-label={`View all ${spaceName} discussions on forums.snomed.org`}
        >
          View all <ArrowRight size={12} aria-hidden="true" />
        </a>
      </div>

      {/* Topics list */}
      <div className="divide-y divide-snomed-border">
        {topics.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-snomed-grey/50">No recent discussions</p>
            <a
              href={categoryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs text-snomed-blue hover:underline"
            >
              Visit the forum →
            </a>
          </div>
        ) : (
          topics.map((post) => <TopicRow key={post.id} post={post} />)
        )}
      </div>
    </section>
  );
}
