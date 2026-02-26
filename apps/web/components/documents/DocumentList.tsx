'use client';

import { useState, useCallback, lazy, Suspense } from 'react';
import { Download, FileSearch, Star } from 'lucide-react';
import type { DriveFile } from '@snomed/types';
import { DocumentTypeIcon, mimeTypeLabel } from './DocumentTypeIcon';
import { fileDownloadUrl, fileForceDownloadUrl } from '@/lib/api-client';

// Dynamically import PDFViewer — react-pdf is large and SSR-incompatible
const PDFViewer = lazy(() =>
  import('./PDFViewer').then((m) => ({ default: m.PDFViewer }))
);

interface Props {
  spaceId: string;
  files: DriveFile[];
}

function isPdf(file: DriveFile): boolean {
  return (
    file.mimeType === 'application/pdf' ||
    file.mimeType.startsWith('application/vnd.google-apps.')
  );
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

export function DocumentList({ spaceId, files }: Props) {
  const [viewingFile, setViewingFile] = useState<DriveFile | null>(null);

  const openViewer = useCallback((file: DriveFile) => {
    setViewingFile(file);
  }, []);

  const closeViewer = useCallback(() => {
    setViewingFile(null);
  }, []);

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <FileSearch size={48} className="mb-4 text-snomed-grey/30" />
        <p className="text-base font-medium text-snomed-grey">No documents found</p>
        <p className="mt-1 text-sm text-snomed-grey/60">
          This space doesn&apos;t have any documents yet.
        </p>
      </div>
    );
  }

  return (
    <>
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
            </tr>
          </thead>
          <tbody className="divide-y divide-snomed-border">
            {files.map((file) => (
              <tr
                key={file.id}
                className="hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer"
                onClick={() => isPdf(file) && openViewer(file)}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: card list */}
      <div className="sm:hidden space-y-2">
        {files.map((file) => (
          <div
            key={file.id}
            className="flex items-start gap-3 rounded-lg border border-snomed-border bg-white p-4 shadow-sm active:bg-gray-50 transition-colors cursor-pointer"
            onClick={() => isPdf(file) && openViewer(file)}
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
            <a
              href={fileForceDownloadUrl(spaceId, file.id)}
              aria-label={`Download ${file.name}`}
              onClick={(e) => e.stopPropagation()}
              className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg text-snomed-grey/50 hover:text-snomed-blue hover:bg-snomed-blue-light active:bg-snomed-blue-light transition-colors"
            >
              <Download size={18} aria-hidden="true" />
            </a>
          </div>
        ))}
      </div>

      {/* PDF Viewer overlay */}
      {viewingFile && (
        <Suspense fallback={null}>
          <PDFViewer
            url={fileDownloadUrl(spaceId, viewingFile.id)}
            downloadUrl={fileForceDownloadUrl(spaceId, viewingFile.id)}
            filename={viewingFile.name}
            onClose={closeViewer}
          />
        </Suspense>
      )}
    </>
  );
}
