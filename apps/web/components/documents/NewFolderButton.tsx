'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FolderPlus, Check, X as XIcon } from 'lucide-react';
import { createFolderInSpace } from '@/lib/api-client';

interface Props {
  spaceId: string;
  sectionId?: string;
  folderId?: string | null;
}

export function NewFolderButton({ spaceId, sectionId, folderId }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleOpen = useCallback(() => {
    setOpen(true);
    setName('');
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const handleCancel = useCallback(() => {
    setOpen(false);
    setName('');
    setError(null);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      await createFolderInSpace(spaceId, name.trim(), sectionId, folderId);
      setOpen(false);
      setName('');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }, [spaceId, sectionId, folderId, name, creating, router]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleCreate();
      if (e.key === 'Escape') handleCancel();
    },
    [handleCreate, handleCancel],
  );

  if (open) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Folder name"
          maxLength={255}
          disabled={creating}
          className="rounded-lg border border-snomed-border px-3 py-2 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-snomed-blue disabled:opacity-60"
          aria-label="New folder name"
        />
        <button
          onClick={handleCreate}
          disabled={creating || !name.trim()}
          title="Create folder"
          aria-label="Confirm new folder"
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-snomed-blue text-white hover:bg-snomed-blue/90 active:bg-snomed-blue/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Check size={16} aria-hidden="true" />
        </button>
        <button
          onClick={handleCancel}
          title="Cancel"
          aria-label="Cancel new folder"
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-snomed-border bg-white text-snomed-grey hover:bg-gray-50 active:bg-gray-100 transition-colors"
        >
          <XIcon size={16} aria-hidden="true" />
        </button>
        {error && (
          <p className="w-full text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={handleOpen}
      className="inline-flex items-center gap-2 rounded-lg border border-snomed-border bg-white px-4 py-2 text-sm font-medium text-snomed-grey shadow-sm hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-snomed-blue focus-visible:ring-offset-2"
    >
      <FolderPlus size={16} aria-hidden="true" />
      New folder
    </button>
  );
}
