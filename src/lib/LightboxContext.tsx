import React, { createContext, useContext, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronLeft, ChevronRight, Download, Share2 } from 'lucide-react';
import { useToast } from './ToastContext';

interface LightboxContextType {
  showLightbox: (images: string[], initialIndex?: number) => void;
  hideLightbox: () => void;
}

const LightboxContext = createContext<LightboxContextType | undefined>(undefined);

export const useLightbox = () => {
  const context = useContext(LightboxContext);
  if (!context) {
    throw new Error('useLightbox must be used within a LightboxProvider');
  }
  return context;
};

export const LightboxProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [images, setImages] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const { showToast } = useToast();

  const showLightbox = (imgs: string[], initialIndex = 0) => {
    setImages(imgs);
    setIndex(initialIndex);
    setScale(1);
    setIsOpen(true);
  };

  const hideLightbox = () => {
    setIsOpen(false);
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hideLightbox();
      else if (e.key === 'ArrowRight' && index < images.length - 1) {
        setIndex(prev => prev + 1);
        setScale(1);
      } else if (e.key === 'ArrowLeft' && index > 0) {
        setIndex(prev => prev - 1);
        setScale(1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, index, images]);

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (index < images.length - 1) {
      setIndex(prev => prev + 1);
      setScale(1);
    }
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (index > 0) {
      setIndex(prev => prev - 1);
      setScale(1);
    }
  };

  const handleDoubleTap = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale(prev => (prev > 1 ? 1 : 2.5));
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentUrl = images[index];
    if (!currentUrl) return;

    try {
      const response = await fetch(currentUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nextbench_image_${Date.now()}.${blob.type.split('/')[1] || 'jpg'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      showToast('Failed to download image', 'error');
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentUrl = images[index];
    if (!currentUrl) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'NextBench Image',
          url: currentUrl,
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          showToast('Failed to share image', 'error');
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(currentUrl);
        showToast('Image link copied to clipboard', 'success');
      } catch {
        showToast('Failed to copy image link', 'error');
      }
    }
  };

  return (
    <LightboxContext.Provider value={{ showLightbox, hideLightbox }}>
      {children}
      <AnimatePresence>
        {isOpen && images.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2000] flex flex-col bg-black/95 backdrop-blur-md select-none touch-none pb-safe"
            onClick={hideLightbox}
          >
            {/* Top Bar */}
            <div className="absolute top-0 left-0 right-0 z-[2010] flex items-center justify-between p-4 bg-linear-to-b from-black/60 to-transparent text-white pt-safe">
              <div className="text-xs font-bold uppercase tracking-widest opacity-80">
                {images.length > 1 ? `${index + 1} / ${images.length}` : 'Image Preview'}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleShare}
                  className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors active:scale-95"
                  title="Share"
                >
                  <Share2 size={20} />
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors active:scale-95"
                  title="Download"
                >
                  <Download size={20} />
                </button>
                <button
                  type="button"
                  onClick={hideLightbox}
                  className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors active:scale-95"
                  title="Close"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Main Area */}
            <div className="flex-1 w-full flex items-center justify-center relative overflow-hidden">
              {/* Navigation Arrows */}
              {index > 0 && (
                <button
                  type="button"
                  onClick={handlePrev}
                  className="absolute left-4 z-[2010] p-3 bg-black/40 hover:bg-black/60 text-white rounded-full transition-colors md:block hidden active:scale-95"
                >
                  <ChevronLeft size={24} />
                </button>
              )}
              {index < images.length - 1 && (
                <button
                  type="button"
                  onClick={handleNext}
                  className="absolute right-4 z-[2010] p-3 bg-black/40 hover:bg-black/60 text-white rounded-full transition-colors md:block hidden active:scale-95"
                >
                  <ChevronRight size={24} />
                </button>
              )}

              {/* Zoomable Image Container */}
              <motion.div
                key={images[index]}
                drag={scale > 1}
                dragConstraints={{ left: -300, right: 300, top: -300, bottom: 300 }}
                dragElastic={0.1}
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                className="max-w-full max-h-full flex items-center justify-center relative"
                onClick={e => e.stopPropagation()}
                onDoubleClick={handleDoubleTap}
              >
                {/* Swipe down to close container when not zoomed */}
                {scale === 1 ? (
                  <motion.div
                    drag="y"
                    dragConstraints={{ top: 0, bottom: 0 }}
                    dragElastic={0.6}
                    onDragEnd={(e, info) => {
                      if (Math.abs(info.offset.y) > 120) {
                        hideLightbox();
                      }
                    }}
                    className="max-w-[95vw] max-h-[85vh] cursor-grab active:cursor-grabbing flex items-center justify-center"
                  >
                    <img
                      src={images[index]}
                      alt="Fullscreen Preview"
                      className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
                      draggable="false"
                    />
                  </motion.div>
                ) : (
                  <div className="max-w-[95vw] max-h-[85vh] overflow-auto flex items-center justify-center">
                    <img
                      src={images[index]}
                      alt="Zoomed Preview"
                      className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
                      draggable="false"
                    />
                  </div>
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </LightboxContext.Provider>
  );
};
