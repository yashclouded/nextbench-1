// src/components/layout/RightSidebarDrawer.tsx
import React, { useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import SuggestedUsers from '../ui/SuggestedUsers';
import { useAuth } from '../../lib/AuthContext';

export default function RightSidebarDrawer() {
  const [open, setOpen] = useState(false);
  const { user, userData } = useAuth();
  const hasPlusButton = user && userData?.verified;

  return (
    <>
      {/* Floating trigger button — only on < lg screens */}
      <button
        onClick={() => setOpen(true)}
        className={`fixed z-40 lg:hidden w-11 h-11 rounded-full bg-brand-teal text-white shadow-lg flex items-center justify-center active:scale-95 transition-all duration-300 ${
          hasPlusButton 
            ? 'bottom-24 right-4 max-sm:bottom-[168px] max-sm:right-[22px]' 
            : 'bottom-24 right-4'
        }`}
        aria-label="Open trending panel"
      >
        <Sparkles size={18} />
      </button>

      {/* Drawer */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm lg:hidden"
              onClick={() => setOpen(false)}
            />

            {/* Panel */}
            <motion.div
              key="panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              drag="x"
              dragDirectionLock
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0, right: 0.5 }}
              onDragEnd={(e, { offset, velocity }) => {
                if (offset.x > 100 || velocity.x > 300) {
                  setOpen(false);
                }
              }}
              className="fixed top-0 right-0 bottom-0 z-50 w-300px lg:hidden overflow-y-auto no-scrollbar"
              style={{ background: 'var(--color-surface-card)', borderLeft: '1px solid var(--color-border)', touchAction: 'pan-y' }}
            >
              {/* Header */}
              <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-card)' }}>
                <span className="text-sm font-bold text-luxury-ink">Discover</span>
                <button onClick={() => setOpen(false)} className="p-1.5 rounded-full hover:bg-surface-soft transition-colors">
                  <X size={18} className="text-luxury-ink/50" />
                </button>
              </div>

              {/* Reuse SuggestedUsers — it already contains TrendingSidebar */}
              <SuggestedUsers />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
