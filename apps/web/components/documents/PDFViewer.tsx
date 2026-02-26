'use client';

import { useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Use the bundled worker via CDN — avoids webpack worker config complexity
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  url: string;
  filename: string;
  onClose: () => void;
}

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function PDFViewer({ url, filename, onClose }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomIndex, setZoomIndex] = useState(2); // default: 1.0
  const [loadError, setLoadError] = useState(false);

  const scale = ZOOM_STEPS[zoomIndex];

  const onDocumentLoad = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setCurrentPage(1);
  }, []);

  const onDocumentError = useCallback(() => {
    setLoadError(true);
  }, []);

  const prevPage = () => setCurrentPage((p) => Math.max(1, p - 1));
  const nextPage = () => setCurrentPage((p) => Math.min(numPages, p + 1));
  const zoomIn = () => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1));
  const zoomOut = () => setZoomIndex((i) => Math.max(0, i - 1));

  return (
    /* Full-screen overlay */
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-label={`Viewing ${filename}`}
    >
      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 h-14 bg-white border-b border-snomed-border">
        {/* Filename */}
        <span className="text-sm font-medium text-snomed-grey truncate max-w-xs lg:max-w-md">
          {filename}
        </span>

        {/* Controls */}
        <div className="flex items-center gap-1">
          {/* Page navigation */}
          {numPages > 0 && (
            <div className="flex items-center gap-1 mr-2">
              <button
                onClick={prevPage}
                disabled={currentPage <= 1}
                aria-label="Previous page"
                className="flex items-center justify-center w-9 h-9 rounded-lg text-snomed-grey disabled:opacity-30 hover:bg-gray-100 active:bg-gray-200 transition-colors"
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <span className="text-xs text-snomed-grey/70 whitespace-nowrap px-1 tabular-nums">
                {currentPage} / {numPages}
              </span>
              <button
                onClick={nextPage}
                disabled={currentPage >= numPages}
                aria-label="Next page"
                className="flex items-center justify-center w-9 h-9 rounded-lg text-snomed-grey disabled:opacity-30 hover:bg-gray-100 active:bg-gray-200 transition-colors"
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Zoom */}
          <button
            onClick={zoomOut}
            disabled={zoomIndex === 0}
            aria-label="Zoom out"
            className="flex items-center justify-center w-9 h-9 rounded-lg text-snomed-grey disabled:opacity-30 hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <ZoomOut size={18} aria-hidden="true" />
          </button>
          <span className="text-xs text-snomed-grey/70 w-10 text-center tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={zoomIn}
            disabled={zoomIndex === ZOOM_STEPS.length - 1}
            aria-label="Zoom in"
            className="flex items-center justify-center w-9 h-9 rounded-lg text-snomed-grey disabled:opacity-30 hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <ZoomIn size={18} aria-hidden="true" />
          </button>

          {/* Download */}
          <a
            href={url}
            download={filename}
            aria-label="Download file"
            className="flex items-center justify-center w-9 h-9 rounded-lg text-snomed-grey hover:bg-gray-100 active:bg-gray-200 transition-colors ml-1"
          >
            <Download size={18} aria-hidden="true" />
          </a>

          {/* Close */}
          <button
            onClick={onClose}
            aria-label="Close viewer"
            className="flex items-center justify-center w-9 h-9 rounded-lg text-snomed-grey hover:bg-gray-100 active:bg-gray-200 transition-colors ml-1"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* PDF canvas area */}
      <div className="flex-1 overflow-auto flex justify-center bg-gray-700 py-6 px-4">
        {loadError ? (
          <div className="flex flex-col items-center justify-center text-white gap-3 py-20">
            <p className="text-base font-medium">Failed to load PDF</p>
            <a
              href={url}
              download={filename}
              className="text-sm underline text-snomed-blue"
            >
              Download instead
            </a>
          </div>
        ) : (
          <Document
            file={url}
            onLoadSuccess={onDocumentLoad}
            onLoadError={onDocumentError}
            loading={<PDFSkeleton />}
          >
            <Page
              pageNumber={currentPage}
              scale={scale}
              renderTextLayer
              renderAnnotationLayer
              className="shadow-2xl"
            />
          </Document>
        )}
      </div>
    </div>
  );
}

function PDFSkeleton() {
  return (
    <div className="w-[612px] max-w-full bg-white animate-pulse rounded shadow-2xl" style={{ height: 792 }} />
  );
}
