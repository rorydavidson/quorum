'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table as TiptapTable } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TiptapLink from '@tiptap/extension-link';
import TiptapImage from '@tiptap/extension-image';
import TiptapUnderline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import { EditorToolbar } from './EditorToolbar';
import { EditorMenuBar } from './EditorMenuBar';
import { VersionHistory } from './VersionHistory';
import {
  saveDocumentContent,
  acquireDocumentLock,
  releaseDocumentLock,
  createDocumentVersion,
  updateDocumentStatus,
} from '@/lib/api-client';
import type { DocumentStatus, PortalDocument } from '@snomed/types';

interface Props {
  document: PortalDocument;
  spaceId: string;
  canEdit: boolean;
}

export function Editor({ document: initialDoc, spaceId, canEdit }: Props) {
  const [doc, setDoc] = useState(initialDoc);
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const [hasLock, setHasLock] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docIdRef = useRef(doc.id);

  const readOnly = !canEdit || doc.status === 'approved' || doc.status === 'archived';

  const editor = useEditor({
    extensions: [
      StarterKit,
      TiptapTable.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TiptapLink.configure({ openOnClick: false }),
      TiptapImage,
      TiptapUnderline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
      CharacterCount,
    ],
    content: doc.contentHtml || '',
    editable: !readOnly && hasLock,
    onUpdate: () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        handleSave();
      }, 5000);
    },
  });

  // Acquire lock on mount
  useEffect(() => {
    if (readOnly) return;

    let cancelled = false;
    const currentDocId = doc.id;

    acquireDocumentLock(spaceId, currentDocId)
      .then(() => {
        if (!cancelled) {
          setHasLock(true);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setLockError(err.message);
        }
      });

    return () => {
      cancelled = true;
      releaseDocumentLock(spaceId, currentDocId).catch(() => {});
    };
  }, [spaceId, doc.id, readOnly]);

  // Update editor editable state when lock changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly && hasLock);
    }
  }, [editor, readOnly, hasLock]);

  // Release lock on page unload
  useEffect(() => {
    if (!hasLock) return;

    const onBeforeUnload = () => {
      navigator.sendBeacon(
        `/api/authored-docs/${spaceId}/${doc.id}/lock`,
      );
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasLock, spaceId, doc.id]);

  const handleSave = useCallback(async () => {
    if (!editor || readOnly || !hasLock) return;
    setSaving(true);
    try {
      const html = editor.getHTML();
      const updated = await saveDocumentContent(
        spaceId,
        doc.id,
        '',
        html,
        undefined,
      );
      setDoc((prev) => ({ ...prev, ...updated }));
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  }, [editor, spaceId, doc.id, readOnly, hasLock]);

  const handleSaveVersion = useCallback(async () => {
    if (!editor || readOnly) return;
    await handleSave();
    const summary = window.prompt('Version description (optional)');
    try {
      await createDocumentVersion(spaceId, doc.id, summary ?? undefined);
    } catch (err) {
      console.error('Version create failed:', err);
    }
  }, [editor, spaceId, doc.id, readOnly, handleSave]);

  const handleTitleChange = useCallback(
    async (newTitle: string) => {
      try {
        const updated = await saveDocumentContent(
          spaceId,
          doc.id,
          '',
          editor?.getHTML() ?? '',
          newTitle,
        );
        setDoc((prev) => ({ ...prev, ...updated }));
      } catch (err) {
        console.error('Title update failed:', err);
      }
    },
    [spaceId, doc.id, editor],
  );

  const handleStatusChange = useCallback(
    async (newStatus: DocumentStatus) => {
      try {
        if (editor && hasLock && !readOnly) {
          await handleSave();
        }
        const updated = await updateDocumentStatus(spaceId, doc.id, newStatus);
        setDoc((prev) => ({ ...prev, ...updated }));
      } catch (err) {
        console.error('Status change failed:', err);
      }
    },
    [spaceId, doc.id, editor, hasLock, readOnly, handleSave],
  );

  const handleRestoreVersion = useCallback(
    (contentHtml: string) => {
      if (!editor || readOnly) return;
      editor.commands.setContent(contentHtml);
      handleSave();
    },
    [editor, readOnly, handleSave],
  );

  if (lockError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800 max-w-md text-center">
          {lockError}
        </div>
        <a
          href={`/spaces/${spaceId}/authored`}
          className="text-sm text-snomed-blue hover:underline"
        >
          Back to documents
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div data-print-hide>
        <EditorMenuBar
          spaceId={spaceId}
          title={doc.title}
          status={doc.status}
          saving={saving}
          onSave={handleSave}
          onSaveVersion={handleSaveVersion}
          onToggleHistory={() => setShowHistory((v) => !v)}
          onTitleChange={handleTitleChange}
          onStatusChange={canEdit ? handleStatusChange : undefined}
          readOnly={readOnly}
        />
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-y-auto">
          <div data-print-hide>
            <EditorToolbar editor={editor} />
          </div>

          <div className="flex-1 px-4 py-6 lg:px-8 cursor-text" onClick={() => editor?.commands.focus()}>
            <div className="max-w-4xl mx-auto">
              <EditorContent editor={editor} />
            </div>
          </div>

          {editor && (
            <div data-print-hide className="px-4 py-2 border-t border-snomed-border text-xs text-snomed-grey/50 flex-shrink-0">
              {editor.storage.characterCount.words()} words · {editor.storage.characterCount.characters()} characters
            </div>
          )}
        </div>

        {showHistory && (
          <VersionHistory
            spaceId={spaceId}
            docId={doc.id}
            onRestore={handleRestoreVersion}
            onClose={() => setShowHistory(false)}
          />
        )}
      </div>
    </div>
  );
}
