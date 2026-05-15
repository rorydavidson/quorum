'use client';

import { useState, useRef, useEffect } from 'react';
import type { DocumentStatus } from '@snomed/types';

const STATUS_STYLES: Record<DocumentStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 ring-gray-300',
  review: 'bg-amber-50 text-amber-700 ring-amber-300',
  approved: 'bg-green-50 text-green-700 ring-green-300',
  archived: 'bg-slate-100 text-slate-500 ring-slate-300',
};

const STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: 'Draft',
  review: 'In Review',
  approved: 'Approved',
  archived: 'Archived',
};

const TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  draft: ['review', 'approved'],
  review: ['draft', 'approved'],
  approved: ['draft', 'archived'],
  archived: ['draft'],
};

interface Props {
  status: DocumentStatus;
  onStatusChange?: (status: DocumentStatus) => void;
}

export function DocumentStatusBadge({ status, onStatusChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const targets = TRANSITIONS[status];
  const interactive = onStatusChange && targets.length > 0;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => interactive && setOpen(!open)}
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status]} ${interactive ? 'cursor-pointer hover:ring-2 transition-all' : 'cursor-default'}`}
      >
        {STATUS_LABELS[status]}
        {interactive && (
          <svg className="ml-1 h-3 w-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {open && interactive && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[140px] rounded-lg border border-snomed-border bg-white shadow-lg py-1">
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-snomed-grey/40">
            Move to
          </div>
          {targets.map((target) => (
            <button
              key={target}
              type="button"
              onClick={() => {
                setOpen(false);
                onStatusChange(target);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-snomed-grey hover:bg-snomed-blue-light/30 transition-colors"
            >
              <span className={`inline-block w-2 h-2 rounded-full ring-1 ring-inset ${STATUS_STYLES[target]}`} />
              {STATUS_LABELS[target]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
