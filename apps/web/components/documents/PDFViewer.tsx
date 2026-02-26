'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Use the bundled worker via CDN — avoids webpack worker config complexity
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  /** Inline stream URL (no ?download=1) — used to fetch the PDF content. */
  url: string;
  /** Force-download URL (with ?download=1) — used for the Download button. */
  downloadUrl: string;
  filename: string;
  onClose: () => void;
}

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function PDFViewer({ url, downloadUrl, filename, onClose }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomIndex, setZoomIndex] = useState(2); // default: 1.0 (100%)
  const [loadError, setLoadError] = useState(false);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  // One ref per rendered page wrapper — used for scroll-to-page
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  const scale = ZOOM_STEPS[zoomIndex];

  // ---------------------------------------------------------------------------
  // Document load callbacks
  // ---------------------------------------------------------------------------

  const onDocumentLoad = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
    setCurrentPage(1);
    pageRefs.current = new Array(n).fill(null);
  }, []);

  const onDocumentError = useCallback(() => {
    setLoadError(true);
  }, []);

  // ---------------------------------------------------------------------------
  // Page tracking — update the toolbar counter as the user scrolls
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const scrollEl = scrollAreaRef.current;
    if (!scrollEl || numPages === 0) return;

    function handleScroll() {
      const scrollTop = scrollEl!.scrollTop;
      let closestPage = 1;
      let closestDist = Infinity;

      pageRefs.current.forEach((el, i) => {
        if (!el) return;
        const dist = Math.abs(el.offsetTop - scrollTop);
        if (dist < closestDist) {
          closestDist = dist;
          closestPage = i + 1;
        }
      });

      setCurrentPage(closestPage);
    }

    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, [numPages]);

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------

  const zoomIn = useCallback(
    () => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1)),
    []
  );
  const zoomOut = useCallback(() => setZoomIndex((i) => Math.max(0, i - 1)), []);

  /** Smooth-scroll within the scroll container to a specific page wrapper. */
  const scrollToPage = useCallback((pageNum: number) => {
    const el = pageRefs.current[pageNum - 1];
    const scrollEl = scrollAreaRef.current;
    if (el && scrollEl) {
      // offsetTop is relative to the scroll container
      const offsetTop = el.offsetTop - 24; // 24px = py-6 top padding gap
      scrollEl.scrollTo({ top: offsetTop, behavior: 'smooth' });
    }
  }, []);

  const prevPage = useCallback(() => {
    setCurrentPage((p) => {
      const target = Math.max(1, p - 1);
      scrollToPage(target);
      return target;
    });
  }, [scrollToPage]);

  const nextPage = useCallback(() => {
    setCurrentPage((p) => {
      const target = Math.min(numPages, p + 1);
      scrollToPage(target);
      return target;
    });
  }, [numPages, scrollToPage]);

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts (arrow keys, +/-, Esc) while the viewer is open
  // ---------------------------------------------------------------------------

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't intercept inside inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextPage();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') prevPage();
      if (e.key === '+' || e.key === '=') zoomIn();
      if (e.key === '-') zoomOut();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, nextPage, prevPage, zoomIn, zoomOut]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    /* Full-screen overlay */
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-label={`Viewing ${filename}`}
    >
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 h-14 bg-white border-b border-snomed-border">
        {/* Filename */}
        <span className="text-sm font-medium text-snomed-grey truncate max-w-[180px] sm:max-w-xs lg:max-w-md">
          {filename}
        </span>

        {/* Controls */}
        <div className="flex items-center gap-0.5">
          {/* Page navigation — jumps to page via smooth scroll */}
          {numPages > 0 && (
            <div className="flex items-center gap-0.5 mr-2">
              <button
                onClick={prevPage}
                disabled={currentPage <= 1}
                aria-label="Previous page"
                className="flex items-center justify-center w-9 h-9 rounded-lg text-snomed-grey disabled:opacity-30 hover:bg-gray-100 active:bg-gray-200 transition-colors"
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <span className="text-xs text-snomed-grey/70 whitespace-nowrap px-1 tabular-nums select-none">
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

          {/* Zoom out */}
          <button
            onClick={zoomOut}
            disabled={zoomIndex === 0}
            aria-label="Zoom out"
            className="flex items-center justify-center w-9 h-9 rounded-lg text-snomed-grey disabled:opacity-30 hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <ZoomOut size={18} aria-hidden="true" />
          </button>

          <span className="text-xs text-snomed-grey/70 w-10 text-center tabular-nums select-none">
            {Math.round(scale * 100)}%
          </span>

          {/* Zoom in */}
          <button
            onClick={zoomIn}
            disabled={zoomIndex === ZOOM_STEPS.length - 1}
            aria-label="Zoom in"
            className="flex items-center justify-center w-9 h-9 rounded-lg text-snomed-grey disabled:opacity-30 hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <ZoomIn size={18} aria-hidden="true" />
          </button>

          {/* Download — uses the force-attachment URL; browser opens save-as dialog */}
          <a
            href={downloadUrl}
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

      {/* ── Scrollable PDF area — all pages rendered vertically ─────────────── */}
      <div
        ref={scrollAreaRef}
        className="flex-1 overflow-y-auto overflow-x-auto bg-gray-700 py-6"
      >
        {loadError ? (
          <div className="flex flex-col items-center justify-center text-white gap-3 py-20">
            <p className="text-base font-medium">Failed to load document</p>
            <a
              href={downloadUrl}
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
            {/* All pages stacked vertically — natural scroll on all devices including iPadOS */}
            <div className="flex flex-col items-center gap-4 px-4">
              {Array.from({ length: numPages }, (_, i) => (
                <div
                  key={i}
                  ref={(el) => {
                    pageRefs.current[i] = el;
                  }}
                >
                  <Page
                    pageNumber={i + 1}
                    scale={scale}
                    renderTextLayer
                    renderAnnotationLayer
                    className="shadow-2xl"
                    loading={<PageSkeleton scale={scale} />}
                  />
                </div>
              ))}
            </div>
          </Document>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loaders
// ---------------------------------------------------------------------------

/** Shown while the PDF document is still being parsed. */
function PDFSkeleton() {
  return (
    <div className="flex flex-col items-center gap-4 px-4" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-white animate-pulse rounded shadow-2xl"
          style={{ width: 612, maxWidth: '90vw', height: 792 }}
        />
      ))}
    </div>
  );
}

/** Shown while an individual page is rendering (after the document is parsed). */
function PageSkeleton({ scale }: { scale: number }) {
  return (
    <div
      className="bg-white animate-pulse rounded shadow-2xl"
      style={{ width: Math.round(612 * scale), height: Math.round(792 * scale) }}
      aria-hidden="true"
    />
  );
}
