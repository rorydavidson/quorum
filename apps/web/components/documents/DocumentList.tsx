'use client';

import { useState, useCallback, lazy, Suspense } from 'react';
import { Download, FileSearch, Star, ArrowLeft, Trash2, Archive, BookMarked } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { DriveFile } from '@snomed/types';
import { DocumentTypeIcon, mimeTypeLabel } from './DocumentTypeIcon';
import { fileDownloadUrl, fileForceDownloadUrl, deleteFileFromSpace, createOfficialRecord } from '@/lib/api-client';
import { UploadButton } from './UploadButton';
import { NewFolderButton } from './NewFolderButton';

// Dynamically import PDFViewer — react-pdf is large and SSR-incompatible
const PDFViewer = lazy(() =>
  import('./PDFViewer').then((m) => ({ default: m.PDFViewer }))
);

interface Props {
  spaceId: string;
  sectionId?: string;
  files: DriveFile[];
  /** Show the upload button — only true when the session user is in uploadGroups */
  canUpload?: boolean;
  /** Show per-document "Make Official Record" button — only true for portal_admin */
  canCreateOfficialRecord?: boolean;
}

function isViewable(file: DriveFile): boolean {
  return (
    file.mimeType === 'application/pdf' ||
    file.mimeType.startsWith('application/vnd.google-apps.document') ||
    file.mimeType.startsWith('application/vnd.google-apps.spreadsheet') ||
    file.mimeType.startsWith('application/vnd.google-apps.presentation')
  );
}

function isFolder(file: DriveFile): boolean {
  return file.mimeType === 'application/vnd.google-apps.folder';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatSize(mb?: number): string {
  if (mb === undefined) return '—';
  if (mb < 1) return `${Math.round(mb * 1000)} KB`;
  return `${mb.toFixed(1)} MB`;
}

export function DocumentList({ spaceId, sectionId, files, canUpload = false, canCreateOfficialRecord = false }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderId = searchParams.get('folderId');
  const viewFileId = searchParams.get('view');

  const [officialOnly, setOfficialOnly] = useState(false);
  const [creatingRecordId, setCreatingRecordId] = useState<string | null>(null);

  const hasOfficialRecords = files.some((f) => f.isOfficialRecord);
  const visibleFiles = officialOnly ? files.filter((f) => f.isOfficialRecord) : files;

  // Find the file to view from the current list if a 'view' param is present
  const viewingFile = viewFileId ? files.find((f) => f.id === viewFileId) : null;

  const openViewer = useCallback((file: DriveFile) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', file.id);
    router.push(`?${params.toString()}`);
  }, [router, searchParams]);

  const closeViewer = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('view');
    router.push(`?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const handleRowClick = useCallback((file: DriveFile) => {
    if (isFolder(file)) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('folderId', file.id);
      params.delete('view'); // clear view when navigating
      router.push(`?${params.toString()}`);
    } else if (isViewable(file)) {
      openViewer(file);
    } else {
      // For non-viewable files (Word, Excel, etc.), trigger a direct download
      window.location.href = fileForceDownloadUrl(spaceId, file.id);
    }
  }, [router, searchParams, openViewer, spaceId]);

  const handleDelete = useCallback(async (file: DriveFile) => {
    if (!window.confirm(`Are you sure you want to delete "${file.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteFileFromSpace(spaceId, file.id);
      router.refresh();
    } catch (err) {
      console.error('Delete error:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete file');
    }
  }, [spaceId, router]);

  const handleCreateOfficialRecord = useCallback(async (file: DriveFile) => {
    if (!window.confirm(
      `Create an Official Record of "${file.name}"?\n\n` +
      `A date-stamped copy will be saved as an immutable Official Record. ` +
      `The original document is not modified.`
    )) return;

    setCreatingRecordId(file.id);
    try {
      await createOfficialRecord(spaceId, file.id, file.name);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create Official Record');
    } finally {
      setCreatingRecordId(null);
    }
  }, [spaceId, router]);

  if (files.length === 0) {
    return (
      <>
        {canUpload && (
          <div className="mb-4 flex items-center justify-end gap-2 flex-wrap">
            {folderId && (
              <button
                onClick={() => router.back()}
                className="mr-auto flex items-center gap-2 text-sm font-medium text-snomed-blue hover:text-snomed-dark-blue transition-colors"
              >
                <ArrowLeft size={16} />
                Back to parent
              </button>
            )}
            <NewFolderButton spaceId={spaceId} sectionId={sectionId} folderId={folderId} />
            <UploadButton spaceId={spaceId} sectionId={sectionId} folderId={folderId} />
          </div>
        )}
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <FileSearch size={48} className="mb-4 text-snomed-grey/30" />
          <p className="text-base font-medium text-snomed-grey">No documents found</p>
          <p className="mt-1 text-sm text-snomed-grey/60">
            {canUpload
              ? 'Upload a document or create a folder to get started.'
              : 'This space doesn\u2019t have any documents yet.'}
          </p>
        </div>
      </>
    );
  }

  if (officialOnly && visibleFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Archive size={48} className="mb-4 text-amber-300" />
        <p className="text-base font-medium text-snomed-grey">No Official Records yet</p>
        <p className="mt-1 text-sm text-snomed-grey/60">
          Official Records are created per-document by admins using the{' '}
          <BookMarked size={12} className="inline" aria-hidden="true" /> button.
        </p>
        <button
          onClick={() => setOfficialOnly(false)}
          className="mt-4 text-sm text-snomed-blue hover:underline"
        >
          Show all documents
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {folderId && (
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-sm font-medium text-snomed-blue hover:text-snomed-dark-blue transition-colors"
            >
              <ArrowLeft size={16} />
              Back to parent
            </button>
          )}

          {/* Official Records filter — only shown when there are some */}
          {hasOfficialRecords && (
            <button
              onClick={() => setOfficialOnly((v) => !v)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors min-h-[32px] ${
                officialOnly
                  ? 'border-amber-300 bg-amber-50 text-amber-700'
                  : 'border-snomed-border bg-white text-snomed-grey/60 hover:text-snomed-grey'
              }`}
            >
              <Star size={11} />
              Official Records only
            </button>
          )}
        </div>

        {/* Folder + Upload buttons — shown only when the user has upload permission */}
        {canUpload && (
          <div className="flex items-center gap-2">
            <NewFolderButton spaceId={spaceId} sectionId={sectionId} folderId={folderId} />
            <UploadButton spaceId={spaceId} sectionId={sectionId} folderId={folderId} />
          </div>
        )}
      </div>

      {/* Desktop: table */}
      <div className="hidden sm:block overflow-x-auto rounded-lg border border-snomed-border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-snomed-border bg-gray-50/50">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-snomed-grey/50">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-snomed-grey/50 w-28">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-snomed-grey/50 w-36">
                Modified
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-snomed-grey/50 w-24">
                Size
              </th>
              <th className="px-4 py-3 w-16" />
              {canUpload && <th className="px-4 py-3 w-16" />}
              {canCreateOfficialRecord && <th className="px-4 py-3 w-16" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-snomed-border">
            {visibleFiles.map((file) => (
              <tr
                key={file.id}
                className="hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer"
                onClick={() => handleRowClick(file)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <DocumentTypeIcon
                      mimeType={file.mimeType}
                      size={18}
                      className="flex-shrink-0 text-snomed-blue"
                    />
                    <span className="font-medium text-snomed-grey truncate max-w-xs">
                      {file.name}
                    </span>
                    {file.isOfficialRecord && (
                      <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                        <Star size={10} aria-hidden="true" />
                        Official Record
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-snomed-grey/60">
                  {mimeTypeLabel(file.mimeType)}
                </td>
                <td className="px-4 py-3 text-snomed-grey/60 tabular-nums">
                  {formatDate(file.modifiedTime)}
                </td>
                <td className="px-4 py-3 text-snomed-grey/60 tabular-nums">
                  {formatSize(file.size)}
                </td>
                <td
                  className="px-4 py-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* ?download=1 forces Content-Disposition: attachment — reliable on Safari / iPadOS */}
                  <a
                    href={fileForceDownloadUrl(spaceId, file.id)}
                    aria-label={`Download ${file.name}`}
                    className="flex items-center justify-center w-9 h-9 rounded-lg text-snomed-grey/50 hover:text-snomed-blue hover:bg-snomed-blue-light active:bg-snomed-blue-light transition-colors"
                  >
                    <Download size={16} aria-hidden="true" />
                  </a>
                </td>
                {canUpload && (
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleDelete(file)}
                      aria-label={`Delete ${file.name}`}
                      className="flex items-center justify-center w-9 h-9 rounded-lg text-snomed-grey/50 hover:text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </td>
                )}
                {canCreateOfficialRecord && !file.isOfficialRecord && !isFolder(file) && (
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleCreateOfficialRecord(file)}
                      disabled={creatingRecordId === file.id}
                      aria-label={`Create Official Record of ${file.name}`}
                      title="Create Official Record"
                      className="flex items-center justify-center w-9 h-9 rounded-lg text-snomed-grey/50 hover:text-amber-600 hover:bg-amber-50 active:bg-amber-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <BookMarked size={16} aria-hidden="true" />
                    </button>
                  </td>
                )}
                {canCreateOfficialRecord && (file.isOfficialRecord || isFolder(file)) && (
                  <td className="px-4 py-3" />
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sm:hidden space-y-2">
        {visibleFiles.map((file) => (
          <div
            key={file.id}
            className="flex items-start gap-3 rounded-lg border border-snomed-border bg-white p-4 shadow-sm active:bg-gray-50 transition-colors cursor-pointer"
            onClick={() => handleRowClick(file)}
          >
            <DocumentTypeIcon
              mimeType={file.mimeType}
              size={20}
              className="flex-shrink-0 mt-0.5 text-snomed-blue"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-snomed-grey truncate">{file.name}</p>
              <p className="mt-0.5 text-xs text-snomed-grey/60">
                {mimeTypeLabel(file.mimeType)} · {formatDate(file.modifiedTime)} · {formatSize(file.size)}
              </p>
              {file.isOfficialRecord && (
                <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                  <Star size={10} aria-hidden="true" />
                  Official Record
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <a
                href={fileForceDownloadUrl(spaceId, file.id)}
                aria-label={`Download ${file.name}`}
                onClick={(e) => e.stopPropagation()}
                className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg text-snomed-grey/50 hover:text-snomed-blue hover:bg-snomed-blue-light active:bg-snomed-blue-light transition-colors"
              >
                <Download size={18} aria-hidden="true" />
              </a>
              {canUpload && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(file);
                  }}
                  aria-label={`Delete ${file.name}`}
                  className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg text-snomed-grey/50 hover:text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors"
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              )}
              {canCreateOfficialRecord && !file.isOfficialRecord && !isFolder(file) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCreateOfficialRecord(file);
                  }}
                  disabled={creatingRecordId === file.id}
                  aria-label={`Create Official Record of ${file.name}`}
                  title="Create Official Record"
                  className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg text-snomed-grey/50 hover:text-amber-600 hover:bg-amber-50 active:bg-amber-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <BookMarked size={18} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* PDF Viewer overlay */}
      {
        viewingFile && (
          <Suspense fallback={null}>
            <PDFViewer
              url={fileDownloadUrl(spaceId, viewingFile.id)}
              downloadUrl={fileForceDownloadUrl(spaceId, viewingFile.id)}
              filename={viewingFile.name}
              onClose={closeViewer}
            />
          </Suspense>
        )
      }
    </>
  );
}
