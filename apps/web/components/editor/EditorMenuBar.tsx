'use client';

import { useState, useCallback } from 'react';
import { ArrowLeft, Save, History, Check, Printer } from 'lucide-react';
import Link from 'next/link';
import { DocumentStatusBadge } from './DocumentStatusBadge';
import type { DocumentStatus } from '@snomed/types';

interface Props {
  spaceId: string;
  title: string;
  status: DocumentStatus;
  saving: boolean;
  onSave: () => void;
  onSaveVersion: () => void;
  onToggleHistory: () => void;
  onTitleChange: (title: string) => void;
  onStatusChange?: (status: DocumentStatus) => void;
  readOnly: boolean;
}

export function EditorMenuBar({
  spaceId,
  title,
  status,
  saving,
  onSave,
  onSaveVersion,
  onToggleHistory,
  onTitleChange,
  onStatusChange,
  readOnly,
}: Props) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);

  const commitTitle = useCallback(() => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== title) {
      onTitleChange(trimmed);
    } else {
      setTitleDraft(title);
    }
  }, [titleDraft, title, onTitleChange]);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-snomed-border bg-white flex-shrink-0">
      <Link
        href={`/spaces/${spaceId}/authored`}
        className="flex items-center justify-center w-9 h-9 rounded-lg text-snomed-grey/50 hover:bg-gray-100 hover:text-snomed-grey transition-colors"
        title="Back to documents"
      >
        <ArrowLeft size={18} />
      </Link>

      <div className="flex-1 min-w-0 flex items-center gap-3">
        {editingTitle && !readOnly ? (
          <input
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTitle();
              if (e.key === 'Escape') {
                setTitleDraft(title);
                setEditingTitle(false);
              }
            }}
            autoFocus
            className="text-lg font-semibold text-snomed-grey bg-transparent border-b-2 border-snomed-blue outline-none w-full max-w-md"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              if (!readOnly) {
                setTitleDraft(title);
                setEditingTitle(true);
              }
            }}
            className="text-lg font-semibold text-snomed-grey truncate hover:text-snomed-blue transition-colors text-left"
          >
            {title}
          </button>
        )}
        <DocumentStatusBadge status={status} onStatusChange={onStatusChange} />
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          type="button"
          onClick={() => window.print()}
          title="Print / Save as PDF"
          className="flex items-center justify-center w-10 h-10 rounded-lg text-snomed-grey/60 hover:bg-gray-100 hover:text-snomed-grey transition-colors"
        >
          <Printer size={18} />
        </button>

        <button
          type="button"
          onClick={onToggleHistory}
          title="Version history"
          className="flex items-center justify-center w-10 h-10 rounded-lg text-snomed-grey/60 hover:bg-gray-100 hover:text-snomed-grey transition-colors"
        >
          <History size={18} />
        </button>

        {!readOnly && (
          <>
            <button
              type="button"
              onClick={onSaveVersion}
              title="Save version"
              className="flex items-center gap-1.5 h-10 px-3 rounded-lg text-sm text-snomed-grey/70 hover:bg-gray-100 hover:text-snomed-grey transition-colors"
            >
              <Check size={15} />
              <span className="hidden sm:inline">Version</span>
            </button>

            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="flex items-center gap-1.5 h-10 px-4 rounded-lg text-sm font-medium bg-snomed-blue text-white hover:bg-snomed-blue-dark transition-colors disabled:opacity-50"
            >
              <Save size={15} />
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
