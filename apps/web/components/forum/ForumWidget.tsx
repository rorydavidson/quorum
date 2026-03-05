import { MessageCircle, ArrowRight, MessageSquare, Eye, Reply, User } from 'lucide-react';
import type { DiscoursePost } from '@snomed/types';

const DISCOURSE_BASE = process.env.DISCOURSE_URL ?? 'https://forums.snomed.org';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo`;
}

function formatViews(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Column header (matches TopicRow layout)
// ---------------------------------------------------------------------------

function TopicListHeader() {
  return (
    <div
      className="hidden sm:grid grid-cols-[1fr_3rem_3rem_3.5rem] items-center gap-2 px-5 py-2 border-b border-snomed-border bg-snomed-bg"
      aria-hidden="true"
    >
      <span className="text-[11px] font-medium uppercase tracking-wide text-snomed-grey/40">
        Topic
      </span>
      <span className="text-[11px] font-medium uppercase tracking-wide text-snomed-grey/40 text-center">
        Replies
      </span>
      <span className="text-[11px] font-medium uppercase tracking-wide text-snomed-grey/40 text-center">
        Views
      </span>
      <span className="text-[11px] font-medium uppercase tracking-wide text-snomed-grey/40 text-right">
        Activity
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Topic row
// ---------------------------------------------------------------------------

function TopicRow({ post }: { post: DiscoursePost }) {
  return (
    <a
      href={post.url}
      target="_blank"
      rel="noopener noreferrer"
      className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_3rem_3rem_3.5rem] items-center gap-x-2 px-5 py-3.5 hover:bg-snomed-blue-light/30 transition-colors group"
    >
      {/* Left: icon + title + author */}
      <div className="flex items-center gap-3 min-w-0">
        <MessageSquare
          size={14}
          className="flex-shrink-0 text-snomed-grey/25 group-hover:text-snomed-blue transition-colors"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-snomed-grey group-hover:text-snomed-blue transition-colors line-clamp-1 leading-snug">
            {post.title}
          </p>
          {post.createdBy && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-snomed-grey/45">
              <User size={9} aria-hidden="true" />
              <span>{post.createdBy}</span>
            </p>
          )}
        </div>
      </div>

      {/* Stats — hidden on small screens (show condensed below title instead) */}
      {/* Replies */}
      <div
        className="hidden sm:flex items-center justify-center gap-1 text-xs text-snomed-grey/50"
        title={`${post.replyCount} ${post.replyCount === 1 ? 'reply' : 'replies'}`}
      >
        <Reply size={11} aria-hidden="true" />
        <span>{post.replyCount}</span>
      </div>

      {/* Views */}
      <div
        className="hidden sm:flex items-center justify-center gap-1 text-xs text-snomed-grey/50"
        title={`${post.views.toLocaleString()} views`}
      >
        <Eye size={11} aria-hidden="true" />
        <span>{formatViews(post.views)}</span>
      </div>

      {/* Activity */}
      <div
        className="hidden sm:flex justify-end text-xs text-snomed-grey/50 tabular-nums"
        title={`Last activity ${new Date(post.lastPostedAt).toLocaleDateString()}`}
      >
        {relativeTime(post.lastPostedAt)}
      </div>

      {/* Mobile-only condensed stats */}
      <div className="sm:hidden flex items-center gap-3 text-xs text-snomed-grey/45 flex-shrink-0">
        <span className="flex items-center gap-0.5">
          <Reply size={10} aria-hidden="true" />
          {post.replyCount}
        </span>
        <span className="flex items-center gap-0.5">
          <Eye size={10} aria-hidden="true" />
          {formatViews(post.views)}
        </span>
        <span>{relativeTime(post.lastPostedAt)}</span>
      </div>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Main widget — server component
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

      {/* Column headers + topics */}
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
        <>
          <TopicListHeader />
          <div className="divide-y divide-snomed-border">
            {topics.map((post) => (
              <TopicRow key={post.id} post={post} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
