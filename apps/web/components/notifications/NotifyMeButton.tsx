'use client';

import { useEffect, useState } from 'react';
import { Bell, BellRing, Loader2 } from 'lucide-react';
import {
  getSubscribedSpaceIds,
  subscribeToSpaceNotifications,
  unsubscribeFromSpaceNotifications,
} from '@/lib/api-client';

/**
 * Per-space "Notify me" toggle. Subscribes the current user to email
 * notifications when new documents / Official Records / meeting docs land in
 * this space. State is fetched on mount and toggled optimistically.
 */
export function NotifyMeButton({ spaceId }: { spaceId: string }) {
  const [subscribed, setSubscribed] = useState<boolean | null>(null); // null = loading
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    getSubscribedSpaceIds()
      .then((ids) => { if (active) setSubscribed(ids.includes(spaceId)); })
      .catch(() => { if (active) setSubscribed(false); });
    return () => { active = false; };
  }, [spaceId]);

  const toggle = async () => {
    if (subscribed === null || pending) return;
    const next = !subscribed;
    setPending(true);
    setSubscribed(next); // optimistic
    try {
      if (next) await subscribeToSpaceNotifications(spaceId);
      else await unsubscribeFromSpaceNotifications(spaceId);
    } catch (err) {
      setSubscribed(!next); // revert
      alert(err instanceof Error ? err.message : 'Could not update notifications');
    } finally {
      setPending(false);
    }
  };

  const isOn = subscribed === true;

  return (
    <button
      onClick={toggle}
      disabled={subscribed === null || pending}
      aria-pressed={isOn}
      title={isOn ? 'You will be emailed about new activity in this space' : 'Get emailed about new activity in this space'}
      className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors min-h-[44px] disabled:opacity-60 ${
        isOn
          ? 'border-snomed-blue bg-snomed-blue-light text-snomed-blue'
          : 'border-snomed-border bg-white text-snomed-grey hover:bg-gray-50'
      }`}
    >
      {subscribed === null || pending ? (
        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
      ) : isOn ? (
        <BellRing size={16} aria-hidden="true" />
      ) : (
        <Bell size={16} aria-hidden="true" />
      )}
      <span className="hidden sm:inline">{isOn ? 'Notifications on' : 'Notify me'}</span>
    </button>
  );
}
