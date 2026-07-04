'use client';

import { useEffect, useState } from 'react';
import { Users, Eye, BarChart3, Loader2, ShieldCheck } from 'lucide-react';
import type { UsageMetrics } from '@snomed/types';
import { getAdminMetrics } from '@/lib/api-client';

function StatCard({ label, value, sub, icon }: { label: string; value: number; sub?: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-snomed-border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-snomed-grey/50">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-snomed-grey tabular-nums">{value.toLocaleString()}</p>
      {sub && <p className="mt-0.5 text-xs text-snomed-grey/50">{sub}</p>}
    </div>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function MetricsPanel({ spaceNames = {} }: { spaceNames?: Record<string, string> }) {
  const [metrics, setMetrics] = useState<UsageMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getAdminMetrics()
      .then((m) => { if (active) setMetrics(m); })
      .catch((e) => { if (active) setError((e as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-snomed-grey/50">
        <Loader2 size={22} className="animate-spin" aria-hidden="true" />
      </div>
    );
  }
  if (error || !metrics) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Could not load metrics: {error ?? 'unknown error'}
      </div>
    );
  }

  const maxDaily = Math.max(1, ...metrics.daily.map((d) => d.views));

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Active users · today" value={metrics.today.uniqueUsers} sub={`${metrics.today.views.toLocaleString()} views`} icon={<Users size={13} aria-hidden="true" />} />
        <StatCard label="Active users · 7d" value={metrics.last7d.uniqueUsers} sub={`${metrics.last7d.views.toLocaleString()} views`} icon={<Users size={13} aria-hidden="true" />} />
        <StatCard label="Active users · 30d" value={metrics.last30d.uniqueUsers} sub={`${metrics.last30d.views.toLocaleString()} views`} icon={<Users size={13} aria-hidden="true" />} />
        <StatCard label="Total page views" value={metrics.totals.views} sub={`${metrics.totals.uniqueUsers.toLocaleString()} users all-time`} icon={<Eye size={13} aria-hidden="true" />} />
      </div>

      {/* Daily views bar chart (last 30 days) */}
      <div className="rounded-xl border border-snomed-border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 size={16} className="text-snomed-blue" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-snomed-grey">Page views — last 30 days</h3>
        </div>
        <div className="flex h-40 items-end gap-1" role="img" aria-label="Daily page views for the last 30 days">
          {metrics.daily.map((d) => (
            <div
              key={d.date}
              className="group relative flex-1"
              title={`${d.date}: ${d.views} views, ${d.uniqueUsers} users`}
            >
              <div
                className="mx-auto w-full rounded-t bg-snomed-blue/80 transition-colors hover:bg-snomed-blue"
                style={{ height: `${Math.max(2, (d.views / maxDaily) * 100)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-snomed-grey/40">
          <span>{metrics.daily[0]?.date}</span>
          <span>{metrics.daily[metrics.daily.length - 1]?.date}</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Per space */}
        <div className="rounded-xl border border-snomed-border bg-white shadow-sm overflow-hidden">
          <div className="border-b border-snomed-border bg-gray-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-snomed-grey/60">
            Views by space
          </div>
          {metrics.perSpace.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-snomed-grey/50">No space views recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-snomed-border">
                {metrics.perSpace.map((s) => (
                  <tr key={s.spaceId} className="hover:bg-gray-50">
                    <td className="px-5 py-2.5 text-snomed-grey">{spaceNames[s.spaceId] ?? s.spaceId}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-snomed-grey/70">{s.views.toLocaleString()} views</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Top paths */}
        <div className="rounded-xl border border-snomed-border bg-white shadow-sm overflow-hidden">
          <div className="border-b border-snomed-border bg-gray-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-snomed-grey/60">
            Top pages
          </div>
          {metrics.topPaths.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-snomed-grey/50">No views recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-snomed-border">
                {metrics.topPaths.map((p) => (
                  <tr key={p.path} className="hover:bg-gray-50">
                    <td className="px-5 py-2.5 font-mono text-xs text-snomed-grey/80 truncate max-w-[220px]" title={p.path}>{p.path}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-snomed-grey/70">{p.views.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Privacy note */}
      <div className="flex items-start gap-2 rounded-xl border border-snomed-border bg-snomed-blue-light/40 px-4 py-3 text-xs text-snomed-grey/70">
        <ShieldCheck size={15} className="mt-0.5 flex-shrink-0 text-snomed-blue" aria-hidden="true" />
        <span>
          Aggregate, first-party analytics — no third-party trackers, and no record of
          which member viewed which page. Unique-user counts come from anonymous,
          irreversible visitor tokens.
        </span>
      </div>

      <p className="text-center text-[11px] text-snomed-grey/40">
        Generated {formatDateTime(metrics.generatedAt)}
      </p>
    </div>
  );
}
