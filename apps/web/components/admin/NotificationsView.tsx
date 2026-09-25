'use client';

import { useEffect, useState } from 'react';
import { BellRing, Send } from 'lucide-react';
import type { SpaceConfig, SpaceSubscriber } from '@snomed/types';
import { csrfFetch } from '@/lib/csrf';
import { AdminHeader } from './AdminHeader';
import type { ShowToast } from './useToast';

interface Props {
  tabs: React.ReactNode;
  spaces: SpaceConfig[];
  showToast: ShowToast;
}

/** SQLite returns "YYYY-MM-DD HH:MM:SS" without a zone; treat it as UTC. */
function formatSubscribedAt(raw: string): string {
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Who has opted in to "Notify me" per space, plus an SMTP delivery test. */
export function NotificationsView({ tabs, spaces, showToast }: Props) {
  const [subscribers, setSubscribers] = useState<SpaceSubscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/subscriptions');
        if (!res.ok) throw new Error('load failed');
        const data = (await res.json()) as { subscriptions: SpaceSubscriber[] };
        if (!cancelled) setSubscribers(data.subscriptions);
      } catch {
        if (!cancelled) showToast('Failed to load subscriptions.', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  async function sendTestEmail() {
    setSendingTest(true);
    try {
      const res = await csrfFetch('/api/admin/notifications/test', { method: 'POST' });
      const data = (await res.json()) as { sent?: boolean; smtpConfigured?: boolean; to?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Test failed');
      if (!data.smtpConfigured) {
        showToast('SMTP is not configured — the server logged the email instead of sending it (mock mode).', 'error');
      } else if (data.sent) {
        showToast(`Test email sent to ${data.to}. Check your inbox (and spam).`, 'success');
      } else {
        showToast('SMTP send failed — check the server logs for the SMTP error.', 'error');
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSendingTest(false);
    }
  }

  const spaceName = (id: string) => spaces.find((s) => s.id === id)?.name ?? id;

  return (
    <div>
      <AdminHeader tabs={tabs}>
        <button
          onClick={sendTestEmail}
          disabled={sendingTest}
          title="Email a test notification to your own address to verify SMTP delivery"
          className="flex items-center gap-2 rounded-lg bg-snomed-blue px-4 py-2.5 text-sm font-medium text-white hover:bg-snomed-blue-dark transition-colors min-h-[44px] disabled:opacity-50"
        >
          <Send size={16} />
          {sendingTest ? 'Sending…' : 'Send test email'}
        </button>
      </AdminHeader>

      <div className="space-y-4">
        <div className="rounded-xl border border-snomed-border bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-snomed-border bg-gray-50 flex items-center gap-2">
            <BellRing size={15} className="text-snomed-blue" aria-hidden="true" />
            <p className="text-sm text-snomed-grey/60">
              Members who clicked <strong>Notify me</strong> — they are emailed when a new document,
              Official Record, or meeting document lands in the space. Subscriptions are included in
              site Export/Import.
            </p>
          </div>
          {loading ? (
            <div className="px-5 py-12 text-center text-sm text-snomed-grey/50">Loading subscriptions…</div>
          ) : subscribers.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-snomed-grey/50">
              No one has subscribed to notifications yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-snomed-border text-left text-[10px] uppercase tracking-wide text-snomed-grey/50">
                  <th className="px-5 py-2 font-semibold">Space</th>
                  <th className="px-5 py-2 font-semibold">Email</th>
                  <th className="px-5 py-2 font-semibold text-right">Subscribed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-snomed-border">
                {subscribers.map((sub) => (
                  <tr key={`${sub.spaceId}:${sub.userId}`} className="hover:bg-gray-50">
                    <td className="px-5 py-2.5 text-snomed-grey">{spaceName(sub.spaceId)}</td>
                    <td className="px-5 py-2.5 text-snomed-grey/80">{sub.email}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-snomed-grey/50">
                      {formatSubscribedAt(sub.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
