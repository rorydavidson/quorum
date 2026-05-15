'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { createAuthoredDocument } from '@/lib/api-client';
import type { DocumentType, SpaceSection } from '@snomed/types';

interface Props {
  spaceId: string;
  sections?: SpaceSection[];
  onClose: () => void;
}

const DOC_TYPES: { value: DocumentType; label: string; description: string }[] = [
  { value: 'agenda', label: 'Agenda', description: 'Meeting agenda document' },
  { value: 'minutes', label: 'Minutes', description: 'Meeting minutes and notes' },
  { value: 'resolution', label: 'Resolution', description: 'Formal resolution document' },
  { value: 'general', label: 'General', description: 'General purpose document' },
];

export function CreateDocumentDialog({ spaceId, sections, onClose }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState<DocumentType>('general');
  const [sectionId, setSectionId] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!title.trim()) return;

      setCreating(true);
      setError(null);
      try {
        const doc = await createAuthoredDocument(spaceId, title.trim(), docType, sectionId || undefined);
        router.push(`/spaces/${spaceId}/authored/${doc.id}`);
      } catch (err) {
        setError((err as Error).message);
        setCreating(false);
      }
    },
    [spaceId, title, docType, sectionId, router],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-snomed-border">
          <h2 className="text-lg font-semibold text-snomed-grey">New Document</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-md text-snomed-grey/50 hover:bg-gray-100 hover:text-snomed-grey transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
          <div>
            <label htmlFor="doc-title" className="block text-sm font-medium text-snomed-grey mb-1.5">
              Title
            </label>
            <input
              id="doc-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title"
              autoFocus
              required
              className="w-full h-10 px-3 rounded-lg border border-snomed-border text-sm text-snomed-grey placeholder:text-snomed-grey/40 focus:outline-none focus:ring-2 focus:ring-snomed-blue/30 focus:border-snomed-blue"
            />
          </div>

          <div>
            <label htmlFor="doc-type" className="block text-sm font-medium text-snomed-grey mb-1.5">
              Type
            </label>
            <select
              id="doc-type"
              value={docType}
              onChange={(e) => setDocType(e.target.value as DocumentType)}
              className="w-full h-10 px-3 rounded-lg border border-snomed-border text-sm text-snomed-grey focus:outline-none focus:ring-2 focus:ring-snomed-blue/30 focus:border-snomed-blue"
            >
              {DOC_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {sections && sections.length > 0 && (
            <div>
              <label htmlFor="doc-section" className="block text-sm font-medium text-snomed-grey mb-1.5">
                Section <span className="text-snomed-grey/40 font-normal">(optional)</span>
              </label>
              <select
                id="doc-section"
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-snomed-border text-sm text-snomed-grey focus:outline-none focus:ring-2 focus:ring-snomed-blue/30 focus:border-snomed-blue"
              >
                <option value="">No section</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-lg text-sm text-snomed-grey/70 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !title.trim()}
              className="h-10 px-5 rounded-lg text-sm font-medium bg-snomed-blue text-white hover:bg-snomed-blue-dark transition-colors disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
