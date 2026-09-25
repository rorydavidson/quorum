'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Info } from 'lucide-react';
import type { AuditLog } from '@snomed/types';
import { AdminHeader } from './AdminHeader';
import type { ShowToast } from './useToast';

// Known audit actions/entity types for the filter dropdowns (stable enums in the BFF).
const AUDIT_ACTIONS = [
  'CREATE_SPACE', 'UPDATE_SPACE', 'DELETE_SPACE',
  'CREATE_SECTION', 'UPDATE_SECTION', 'DELETE_SECTION',
  'UPLOAD_DOCUMENT', 'DELETE_DOCUMENT', 'CREATE_FOLDER', 'CREATE_OFFICIAL_RECORD',
  'CREATE_EVENT_AGENDA', 'UPDATE_EVENT_AGENDA', 'DELETE_EVENT_AGENDA', 'UPDATE_EVENT_DOC',
  'UPDATE_CATEGORY_ORDER', 'RESTORE_BACKUP', 'RESET_SITE',
];
const AUDIT_ENTITY_TYPES = ['SPACE', 'SECTION', 'DOCUMENT', 'FILE', 'EVENT', 'CATEGORY', 'SITE'];
const PAGE_SIZE = 100;

interface AuditFilters {
  action: string;
  entityType: string;
  user: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: AuditFilters = { action: '', entityType: '', user: '', from: '', to: '' };

function hasAnyFilter(f: AuditFilters): boolean {
  return !!(f.action || f.entityType || f.user || f.from || f.to);
}

function auditQueryString(filters: AuditFilters, extra: Record<string, string | number> = {}): string {
  const p = new URLSearchParams();
  if (filters.action) p.set('action', filters.action);
  if (filters.entityType) p.set('entityType', filters.entityType);
  if (filters.user) p.set('user', filters.user);
  if (filters.from) p.set('from', filters.from);
  if (filters.to) p.set('to', filters.to);
  for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Pretty-prints the JSON details column; falls back to the raw text if it is not JSON. */
function formatDetails(details: string): string {
  try {
    return JSON.stringify(JSON.parse(details), null, 2);
  } catch {
    return details;
  }
}

function actionBadgeCls(action: string): string {
  if (action.startsWith('DELETE')) return 'bg-red-50 text-red-700';
  if (action.startsWith('CREATE') || action.includes('UPLOAD')) return 'bg-green-50 text-green-700';
  return 'bg-snomed-blue-light text-snomed-blue';
}

const filterInputCls =
  'rounded-lg border border-snomed-border bg-white px-3 py-2 text-sm text-snomed-grey placeholder:text-snomed-grey/40 focus:outline-none focus:ring-2 focus:ring-snomed-blue/30 focus:border-snomed-blue min-h-[40px]';

interface Props {
  tabs: React.ReactNode;
  showToast: ShowToast;
}

/** Filterable, paginated audit trail with CSV export. */
export function AuditLogView({ tabs, showToast }: Props) {
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  /**
   * Fetches a page for the given filters. Passing filters explicitly (rather
   * than reading state) means "Clear" can reset and refetch in one step
   * without racing the state update.
   */
  const fetchLogs = useCallback(
    async (f: AuditFilters, append: boolean, currentCount: number) => {
      setLoading(true);
      const offset = append ? currentCount : 0;
      try {
        const res = await fetch(`/api/admin/audit-logs${auditQueryString(f, { limit: PAGE_SIZE, offset })}`);
        if (!res.ok) throw new Error('fetch failed');
        const data = (await res.json()) as AuditLog[];
        setLogs((prev) => (append ? [...prev, ...data] : data));
        setHasMore(data.length === PAGE_SIZE);
      } catch {
        showToast('Failed to fetch audit logs.', 'error');
      } finally {
        setLoading(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    void fetchLogs(EMPTY_FILTERS, false, 0);
  }, [fetchLogs]);

  const apply = () => void fetchLogs(filters, false, 0);
  const clear = () => {
    setFilters(EMPTY_FILTERS);
    void fetchLogs(EMPTY_FILTERS, false, 0);
  };
  const loadMore = () => void fetchLogs(filters, true, logs.length);

  const setFilter = (patch: Partial<AuditFilters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <div>
      <AdminHeader tabs={tabs}>
        <a
          href={`/api/admin/audit-logs/export${auditQueryString(filters)}`}
          className="flex items-center gap-2 rounded-lg border border-snomed-border bg-white px-4 py-2 text-sm font-medium text-snomed-grey hover:bg-gray-50 transition-colors min-h-[40px]"
        >
          <Download size={16} />
          Export CSV
        </a>
        <button
          onClick={apply}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-snomed-border bg-white px-4 py-2 text-sm font-medium text-snomed-grey hover:bg-gray-50 transition-colors min-h-[40px] disabled:opacity-50"
        >
          Refresh
        </button>
      </AdminHeader>

      <div className="space-y-3">
        {/* Filter bar */}
        <div className="rounded-xl border border-snomed-border bg-white shadow-sm p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-snomed-grey/50">Action</label>
              <select
                value={filters.action}
                onChange={(e) => setFilter({ action: e.target.value })}
                className={filterInputCls}
              >
                <option value="">All actions</option>
                {AUDIT_ACTIONS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-snomed-grey/50">Entity</label>
              <select
                value={filters.entityType}
                onChange={(e) => setFilter({ entityType: e.target.value })}
                className={filterInputCls}
              >
                <option value="">All entities</option>
                {AUDIT_ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-snomed-grey/50">User</label>
              <input
                type="text"
                value={filters.user}
                onChange={(e) => setFilter({ user: e.target.value })}
                placeholder="Name contains…"
                className={filterInputCls}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-snomed-grey/50">From</label>
              <input
                type="date"
                value={filters.from}
                onChange={(e) => setFilter({ from: e.target.value })}
                className={filterInputCls}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-snomed-grey/50">To</label>
              <input
                type="date"
                value={filters.to}
                onChange={(e) => setFilter({ to: e.target.value })}
                className={filterInputCls}
              />
            </div>
            <button
              onClick={apply}
              disabled={loading}
              className="rounded-lg bg-snomed-blue px-4 py-2 text-sm font-medium text-white hover:bg-snomed-blue-dark transition-colors min-h-[40px] disabled:opacity-50"
            >
              Apply
            </button>
            {hasAnyFilter(filters) && (
              <button
                onClick={clear}
                className="rounded-lg border border-snomed-border bg-white px-4 py-2 text-sm font-medium text-snomed-grey hover:bg-gray-50 transition-colors min-h-[40px]"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-snomed-border bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-snomed-border">
                  <th className="px-5 py-3 font-semibold text-snomed-grey/60 uppercase text-[10px] tracking-wider">Timestamp</th>
                  <th className="px-5 py-3 font-semibold text-snomed-grey/60 uppercase text-[10px] tracking-wider">User</th>
                  <th className="px-5 py-3 font-semibold text-snomed-grey/60 uppercase text-[10px] tracking-wider">Action</th>
                  <th className="px-5 py-3 font-semibold text-snomed-grey/60 uppercase text-[10px] tracking-wider">Entity</th>
                  <th className="px-0 py-3 font-semibold text-snomed-grey/60 uppercase text-[10px] tracking-wider w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-snomed-border">
                {loading && logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-snomed-grey/50">Loading logs...</td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-snomed-grey/50">No audit logs found.</td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-5 py-4 whitespace-nowrap text-xs text-snomed-grey/70">
                        {new Date(log.timestamp).toLocaleString('en-GB', {
                          day: '2-digit', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <p className="font-medium text-snomed-grey text-xs">{log.userName}</p>
                        <p className="text-[10px] text-snomed-grey/40 font-mono">{log.userId.slice(0, 8)}...</p>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide ${actionBadgeCls(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-xs text-snomed-grey font-medium">{log.entityType}</p>
                        <p className="text-[10px] text-snomed-grey/40 font-mono truncate max-w-[120px]" title={log.entityId}>
                          {log.entityId}
                        </p>
                      </td>
                      <td className="px-2 py-4 text-right">
                        {log.details && (
                          <div className="relative group/details">
                            <Info size={14} className="text-snomed-grey/30 hover:text-snomed-blue cursor-help" />
                            <div className="absolute right-full bottom-0 mr-3 hidden group-hover/details:block z-50 w-64 p-3 bg-white border border-snomed-border rounded-lg shadow-xl text-[10px] font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                              {formatDetails(log.details)}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {hasMore && (
          <div className="flex justify-center pt-1">
            <button
              onClick={loadMore}
              disabled={loading}
              className="rounded-lg border border-snomed-border bg-white px-5 py-2 text-sm font-medium text-snomed-grey hover:bg-gray-50 transition-colors min-h-[40px] disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
