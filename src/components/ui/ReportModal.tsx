import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Flag, AlertTriangle, Loader2 } from 'lucide-react';
import { REPORT_REASONS, reportContent, ReportContentType, ReportReason } from '../../lib/reports';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  contentType: ReportContentType;
  contentId: string;
}

export default function ReportModal({ isOpen, onClose, contentType, contentId }: ReportModalProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !reason || submitting) return;

    setSubmitting(true);
    try {
      await reportContent(user.uid, contentType, contentId, reason, notes);
      showToast('Report submitted. Thank you for keeping our community safe! 🛡️', 'success');
      onClose();
      setReason('');
      setNotes('');
    } catch {
      showToast('Failed to submit report', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-110 flex items-center justify-center p-4 backdrop-blur-sm"
        style={{ background: 'var(--color-overlay)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          className="w-full max-w-md relative rounded-3xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
          style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Warning header */}
          <div className="h-2 w-full bg-linear-to-r from-amber-400 via-red-400 to-amber-400 shrink-0" />
          
          <div className="p-8 overflow-y-auto">
            <button onClick={onClose} className="absolute top-6 right-6 p-2 text-luxury-ink/40 hover:text-luxury-ink transition-colors z-10 bg-surface-card rounded-full">
              <X size={20} />
            </button>

            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                <Flag size={20} className="text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-luxury-ink">Report Content</h3>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-luxury-ink/40 mb-6 ml-13">
              Help keep our community safe
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/40 ml-1">
                  Reason for reporting
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {REPORT_REASONS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setReason(r.id)}
                      className={`text-left px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                        reason === r.id
                          ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                          : 'hover:bg-surface-soft border border-transparent text-luxury-ink/70'
                      }`}
                      style={reason !== r.id ? { background: 'var(--color-surface-soft)' } : undefined}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/40 ml-1">
                  Additional details (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Any additional context..."
                  className="w-full rounded-xl py-3 px-4 text-sm font-medium resize-none theme-input"
                />
              </div>

              {/* Safety message */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
                <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
                  If someone is in immediate danger, please contact local emergency services. Reports are reviewed by our team within 24 hours.
                </p>
              </div>

              <button
                type="submit"
                disabled={!reason || submitting}
                className="w-full py-4 bg-red-500 text-white text-[11px] font-bold uppercase tracking-[0.2em] shadow-lg hover:bg-red-600 transition-colors rounded-xl disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <><Loader2 size={16} className="animate-spin" /> Submitting...</>
                ) : (
                  <><Flag size={14} /> Submit Report</>
                )}
              </button>
            </form>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
