'use client';

import { useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, CheckCircle, AlertCircle, X } from 'lucide-react';
import { uploadFileToSpace } from '@/lib/api-client';

interface Props {
  spaceId: string;
  sectionId?: string;
  folderId?: string | null;
}

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; filename: string; percent: number }
  | { status: 'success'; filename: string }
  | { status: 'error'; message: string };

export function UploadButton({ spaceId, sectionId, folderId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [state, setState] = useState<UploadState>({ status: 'idle' });

  const handleClick = useCallback(() => {
    if (state.status === 'uploading') return;
    setState({ status: 'idle' });
    inputRef.current?.click();
  }, [state.status]);

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // Reset the input so the same file can be re-selected after an error
      e.target.value = '';

      setState({ status: 'uploading', filename: file.name, percent: 0 });

      try {
        await uploadFileToSpace(spaceId, file, sectionId, folderId ?? undefined, ({ percent }) => {
          setState({ status: 'uploading', filename: file.name, percent });
        });
        setState({ status: 'success', filename: file.name });
        // Refresh the server component so the new file appears in the list
        router.refresh();
        // Auto-clear success banner after 4 s
        setTimeout(() => setState({ status: 'idle' }), 4000);
      } catch (err) {
        setState({ status: 'error', message: (err as Error).message });
      }
    },
    [spaceId, router]
  );

  const dismiss = useCallback(() => setState({ status: 'idle' }), []);

  return (
    <div className="flex flex-col gap-2">
      {/* Hidden file input — accepts any file type */}
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        aria-hidden="true"
        onChange={handleChange}
      />

      {/* Upload trigger button */}
      <button
        onClick={handleClick}
        disabled={state.status === 'uploading'}
        className="inline-flex items-center gap-2 rounded-lg bg-snomed-blue px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-snomed-blue/90 active:bg-snomed-blue/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-snomed-blue focus-visible:ring-offset-2"
      >
        <Upload size={16} aria-hidden="true" />
        {state.status === 'uploading' ? 'Uploading…' : 'Upload document'}
      </button>

      {/* Uploading — progress bar */}
      {state.status === 'uploading' && (
        <div className="rounded-lg border border-snomed-border bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-snomed-grey truncate max-w-[220px]">
              {state.filename}
            </span>
            <span className="text-xs text-snomed-grey/60 tabular-nums ml-2">{state.percent}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-snomed-blue transition-all duration-200"
              style={{ width: `${state.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Success banner */}
      {state.status === 'success' && (
        <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 shadow-sm">
          <CheckCircle size={16} className="flex-shrink-0 mt-0.5 text-green-600" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-green-800">Uploaded successfully</p>
            <p className="text-xs text-green-700/80 truncate">{state.filename}</p>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="flex-shrink-0 text-green-600/60 hover:text-green-700 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Error banner */}
      {state.status === 'error' && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 shadow-sm">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-red-600" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-red-800">Upload failed</p>
            <p className="text-xs text-red-700/80">{state.message}</p>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="flex-shrink-0 text-red-600/60 hover:text-red-700 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
