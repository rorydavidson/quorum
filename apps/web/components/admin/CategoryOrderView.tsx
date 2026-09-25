'use client';

import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { csrfFetch } from '@/lib/csrf';
import { AdminHeader } from './AdminHeader';
import type { ShowToast } from './useToast';

interface CategoryEntry {
  name: string;
  /** null = not yet ordered; sorts after all numbered categories. */
  sortOrder: number | null;
}

interface Props {
  tabs: React.ReactNode;
  showToast: ShowToast;
}

/** Sets the display order of hierarchy categories on the Spaces page. */
export function CategoryOrderView({ tabs, showToast }: Props) {
  const [entries, setEntries] = useState<CategoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/categories');
        if (res.ok && !cancelled) {
          setEntries((await res.json()) as CategoryEntry[]);
        }
      } catch {
        if (!cancelled) showToast('Failed to load category order.', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  async function save() {
    setSaving(true);
    try {
      const ordered = entries
        .filter((c) => c.sortOrder !== null)
        .map((c) => ({ name: c.name, sortOrder: c.sortOrder as number }));
      const res = await csrfFetch('/api/admin/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: ordered }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? 'Save failed');
      }
      showToast('Category order saved.', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <AdminHeader tabs={tabs}>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-snomed-blue px-4 py-2.5 text-sm font-medium text-white hover:bg-snomed-dark-blue transition-colors min-h-[44px] disabled:opacity-50"
        >
          <Save size={16} />
          {saving ? 'Saving…' : 'Save Order'}
        </button>
      </AdminHeader>

      <div className="rounded-xl border border-snomed-border bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-snomed-border bg-gray-50">
          <p className="text-sm text-snomed-grey/60">
            Set the display order for space groups on the Spaces page. Lower numbers appear first.
            Leave a field blank to place that category after all numbered ones, sorted alphabetically.
          </p>
        </div>
        {loading && entries.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-snomed-grey/50">Loading categories…</div>
        ) : entries.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-snomed-grey/50">
            No categories found. Add spaces with hierarchy categories first.
          </div>
        ) : (
          <div className="divide-y divide-snomed-border">
            {entries.map((cat, i) => (
              <div key={cat.name} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 text-sm font-medium text-snomed-grey">{cat.name}</div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-snomed-grey/50">Sort order</label>
                  <input
                    type="number"
                    min={0}
                    value={cat.sortOrder ?? ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                      setEntries((prev) => prev.map((c, j) => (j === i ? { ...c, sortOrder: val } : c)));
                    }}
                    placeholder="—"
                    className="w-24 rounded-lg border border-snomed-border bg-white px-3 py-2 text-sm text-snomed-grey text-right placeholder:text-snomed-grey/40 focus:outline-none focus:ring-2 focus:ring-snomed-blue/30 focus:border-snomed-blue transition-colors"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
