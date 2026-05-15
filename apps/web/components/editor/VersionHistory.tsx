'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { getDocumentVersion } from '@/lib/api-client';
import type { DocumentVersion } from '@snomed/types';

interface Props {
  spaceId: string;
  docId: string;
  onRestore: (contentHtml: string) => void;
  onClose: () => void;
}

export function VersionHistory({ spaceId, docId, onRestore, onClose }: Props) {
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/authored-docs/${spaceId}/${docId}/versions`)
      .then((res) => res.json())
      .then((data: DocumentVersion[]) => setVersions(data))
      .catch(() => setVersions([]))
      .finally(() => setLoading(false));
  }, [spaceId, docId]);

  const handleRestore = useCallback(
    async (versionId: number) => {
      if (!window.confirm('Restore this version? Current content will be replaced.')) return;
      try {
        const version = await getDocumentVersion(spaceId, docId, versionId);
        if (version.contentHtml) {
          onRestore(version.contentHtml);
        }
      } catch (err) {
        console.error('Failed to load version:', err);
      }
    },
    [spaceId, docId, onRestore],
  );

  return (
    <aside className="w-72 border-l border-snomed-border bg-white overflow-y-auto flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-snomed-border">
        <h3 className="text-sm font-semibold text-snomed-grey">Version History</h3>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center w-8 h-8 rounded-md text-snomed-grey/50 hover:bg-gray-100 hover:text-snomed-grey transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {loading ? (
        <div className="px-4 py-8 text-center text-sm text-snomed-grey/50">
          Loading…
        </div>
      ) : versions.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-snomed-grey/50">
          No versions saved yet
        </div>
      ) : (
        <ul className="divide-y divide-snomed-border">
          {versions.map((v) => (
            <li key={v.id} className="px-4 py-3 hover:bg-gray-50 group">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-snomed-grey">
                    v{v.versionNumber}
                  </p>
                  <p className="text-xs text-snomed-grey/50 mt-0.5">
                    {v.createdByName}
                  </p>
                  <p className="text-xs text-snomed-grey/40 mt-0.5">
                    {new Date(v.createdAt).toLocaleString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  {v.changeSummary && (
                    <p className="text-xs text-snomed-grey/60 mt-1 italic">
                      {v.changeSummary}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRestore(v.id)}
                  title="Restore this version"
                  className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-8 h-8 rounded-md text-snomed-grey/50 hover:bg-snomed-blue-light hover:text-snomed-blue transition-all"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
