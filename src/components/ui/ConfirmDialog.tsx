// src/components/ui/ConfirmDialog.tsx
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-200 flex items-center justify-center p-4 backdrop-blur-sm"
          style={{ background: 'var(--color-overlay-heavy)' }}
          onClick={onCancel}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl shadow-2xl p-6"
            style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)' }}
          >
            <div className="flex items-start gap-3 mb-5">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${danger ? 'bg-red-500/10 text-red-500' : 'bg-brand-teal/10 text-brand-teal'}`}>
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-[16px] font-bold text-luxury-ink leading-tight">{title}</h3>
                <p className="text-[13px] text-luxury-ink/50 mt-1 leading-relaxed">{message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 rounded-xl text-[13px] font-semibold text-luxury-ink/60 hover:bg-surface-soft transition-colors"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-colors ${danger ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-brand-teal hover:bg-brand-teal/90 text-white'}`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}