import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, ZoomIn, ZoomOut, ChevronUp, ChevronDown, 
  Maximize2, Minimize2, FileText
} from 'lucide-react';

interface PdfViewerProps {
  isOpen: boolean;
  onClose: () => void;
  pdfUrl: string;
  totalPages: number;
  title?: string;
}

const ZOOM_LEVELS = [50, 75, 100, 125, 150, 200];

function getPdfPageUrl(url: string, page: number, width: number = 1200): string {
  return url.replace('/upload/', `/upload/pg_${page},w_${width},f_jpg,q_auto/`);
}

export default function PdfViewer({ isOpen, onClose, pdfUrl, totalPages, title }: PdfViewerProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomIndex, setZoomIndex] = useState(2); // 100% default
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pageInput, setPageInput] = useState('1');
  const [loadedPages, setLoadedPages] = useState<Set<number>>(new Set([1]));

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrollingProgrammatically = useRef(false);

  const zoom = ZOOM_LEVELS[zoomIndex];

  // Preload nearby pages
  useEffect(() => {
    if (!isOpen) return;
    const pagesToLoad = new Set(loadedPages);
    for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 3); i++) {
      pagesToLoad.add(i);
    }
    if (pagesToLoad.size !== loadedPages.size) {
      setLoadedPages(pagesToLoad);
    }
  }, [currentPage, isOpen, totalPages]);

  // Detect current page from scroll position
  useEffect(() => {
    if (!isOpen) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (isScrollingProgrammatically.current) return;
      
      const containerRect = container.getBoundingClientRect();
      const containerCenter = containerRect.top + containerRect.height / 3;
      
      let closestPage = 1;
      let closestDistance = Infinity;

      pageRefs.current.forEach((el, page) => {
        const rect = el.getBoundingClientRect();
        const distance = Math.abs(rect.top - containerCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPage = page;
        }
      });

      if (closestPage !== currentPage) {
        setCurrentPage(closestPage);
        setPageInput(String(closestPage));
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [isOpen, currentPage]);

  // Jump to page
  const jumpToPage = useCallback((page: number) => {
    const clamped = Math.max(1, Math.min(totalPages, page));
    setCurrentPage(clamped);
    setPageInput(String(clamped));

    // Ensure page is loaded
    setLoadedPages(prev => {
      const next = new Set(prev);
      next.add(clamped);
      return next;
    });

    // Scroll to page after a tick (to allow render)
    setTimeout(() => {
      const el = pageRefs.current.get(clamped);
      if (el && scrollContainerRef.current) {
        isScrollingProgrammatically.current = true;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => { isScrollingProgrammatically.current = false; }, 500);
      }
    }, 50);
  }, [totalPages]);

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(pageInput);
    if (!isNaN(num)) jumpToPage(num);
  };

  const zoomIn = () => setZoomIndex(i => Math.min(ZOOM_LEVELS.length - 1, i + 1));
  const zoomOut = () => setZoomIndex(i => Math.max(0, i - 1));

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Listen for fullscreen exit
  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) setIsFullscreen(false);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); jumpToPage(currentPage + 1); }
      if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); jumpToPage(currentPage - 1); }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomIn(); }
      if (e.key === '-') { e.preventDefault(); zoomOut(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, currentPage, jumpToPage, onClose]);

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setCurrentPage(1);
      setPageInput('1');
      setZoomIndex(2);
      setLoadedPages(new Set([1, 2, 3]));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-200 flex items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-6"
      onClick={onClose}
    >
      <div 
        ref={containerRef}
        className="w-full h-full sm:max-w-3xl sm:max-h-[90vh] sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl"
        style={{ background: 'var(--color-surface-base, #1a1a2e)' }}
        onClick={(e) => e.stopPropagation()}
      >
      {/* ─── Toolbar ─── */}
      <div className="flex items-center justify-between px-3 sm:px-5 py-2.5 border-b shrink-0 select-none" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-card)' }}>
        {/* Left: title */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <FileText size={18} className="text-brand-teal shrink-0" />
          <span className="text-sm font-semibold text-luxury-ink truncate">
            {title || 'PDF Document'}
          </span>
        </div>

        {/* Center: page nav + zoom */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Page navigation */}
          <button 
            onClick={() => jumpToPage(currentPage - 1)} 
            disabled={currentPage <= 1}
            className="p-1.5 rounded-lg hover:bg-surface-soft text-luxury-ink/60 hover:text-luxury-ink disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronUp size={16} />
          </button>

          <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1.5">
            <input
              type="text"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={() => { const n = parseInt(pageInput); if (!isNaN(n)) jumpToPage(n); else setPageInput(String(currentPage)); }}
              className="w-10 text-center text-sm font-semibold text-luxury-ink bg-surface-soft border border-luxury-ink/10 rounded-lg py-1 focus:outline-none focus:border-brand-teal transition-colors"
            />
            <span className="text-sm text-luxury-ink/40 font-medium">/ {totalPages}</span>
          </form>

          <button 
            onClick={() => jumpToPage(currentPage + 1)} 
            disabled={currentPage >= totalPages}
            className="p-1.5 rounded-lg hover:bg-surface-soft text-luxury-ink/60 hover:text-luxury-ink disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronDown size={16} />
          </button>

          {/* Divider */}
          <div className="w-px h-5 bg-luxury-ink/10 mx-1 hidden sm:block" />

          {/* Zoom controls */}
          <button 
            onClick={zoomOut} 
            disabled={zoomIndex <= 0}
            className="p-1.5 rounded-lg hover:bg-surface-soft text-luxury-ink/60 hover:text-luxury-ink disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ZoomOut size={16} />
          </button>
          <span className="text-xs font-bold text-luxury-ink/50 w-10 text-center tabular-nums">{zoom}%</span>
          <button 
            onClick={zoomIn} 
            disabled={zoomIndex >= ZOOM_LEVELS.length - 1}
            className="p-1.5 rounded-lg hover:bg-surface-soft text-luxury-ink/60 hover:text-luxury-ink disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ZoomIn size={16} />
          </button>
        </div>

        {/* Right: fullscreen + close */}
        <div className="flex items-center gap-1 flex-1 justify-end">
          <button 
            onClick={toggleFullscreen}
            className="p-2 rounded-lg hover:bg-surface-soft text-luxury-ink/60 hover:text-luxury-ink transition-colors hidden sm:flex"
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button 
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-red-500/10 text-luxury-ink/60 hover:text-red-500 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ─── Pages ─── */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-auto"
        style={{ background: 'var(--color-surface-base, #2a2a3e)' }}
      >
        <div className="flex flex-col items-center py-4 sm:py-6 gap-3 sm:gap-4">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
            const isLoaded = loadedPages.has(page);
            const imgWidth = Math.round(800 * (zoom / 100));
            
            return (
              <div
                key={page}
                ref={(el) => { if (el) pageRefs.current.set(page, el); }}
                className="relative shadow-xl rounded-sm overflow-hidden transition-all duration-200"
                style={{ 
                  width: `min(${imgWidth}px, calc(100vw - 2rem))`,
                  background: '#fff',
                }}
              >
                {isLoaded ? (
                  <img
                    src={getPdfPageUrl(pdfUrl, page, Math.max(800, imgWidth))}
                    alt={`Page ${page}`}
                    className="w-full h-auto block"
                    draggable={false}
                    loading={page <= 3 ? 'eager' : 'lazy'}
                    onLoad={() => {
                      // When a page loads, preload the next one
                      if (page < totalPages) {
                        setLoadedPages(prev => {
                          const next = new Set(prev);
                          next.add(page + 1);
                          return next;
                        });
                      }
                    }}
                  />
                ) : (
                  <div 
                    className="flex items-center justify-center text-luxury-ink/30 text-sm"
                    style={{ aspectRatio: '8.5/11', width: '100%' }}
                  >
                    Loading page {page}...
                  </div>
                )}

                {/* Page number label */}
                <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] font-bold px-2 py-0.5 rounded backdrop-blur-sm pointer-events-none">
                  {page}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </div>
    </div>,
    document.body
  );
}

// ─── PDF Preview with Full Viewer ───────────────────────
export function PdfPreview({ pdfUrl, totalPages, title }: { pdfUrl: string; totalPages: number; title?: string }) {
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const previewUrl = pdfUrl.replace('/upload/', '/upload/pg_1,w_600,f_jpg,q_auto/');

  return (
    <>
      <div 
        className="mt-2 mb-6 w-full rounded-2xl overflow-hidden border border-luxury-ink/10 bg-surface-base cursor-pointer group relative"
        onClick={(e) => { e.stopPropagation(); setIsViewerOpen(true); }}
      >
        {/* Preview image of page 1 */}
        <div className="relative">
          <img
            src={previewUrl}
            alt="PDF preview"
            className="w-full h-auto max-h-100 object-contain bg-white"
            draggable={false}
          />
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          
          {/* Open viewer overlay */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div 
              className="backdrop-blur-sm px-5 py-3 rounded-xl shadow-xl flex items-center gap-2.5 font-semibold text-sm"
              style={{ background: 'var(--color-surface-elevated)', color: 'var(--color-luxury-ink)' }}
            >
              <FileText size={18} className="text-brand-teal" />
              View PDF
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <FileText size={14} className="text-brand-teal shrink-0" />
          <span className="text-xs font-semibold text-luxury-ink/60 truncate">
            {totalPages} {totalPages === 1 ? 'page' : 'pages'}
          </span>
          <span className="ml-auto text-[11px] font-bold text-brand-teal">TAP TO VIEW</span>
        </div>
      </div>

      <PdfViewer
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        pdfUrl={pdfUrl}
        totalPages={totalPages}
        title={title}
      />
    </>
  );
}
