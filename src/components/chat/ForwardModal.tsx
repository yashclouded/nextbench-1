import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Send, Users, User, CheckCircle2, Circle } from 'lucide-react';
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { useUserClubs } from '../../lib/clubs';
import { getOptimizedImageUrl } from '../../lib/utils';
import type { Message } from '../../hooks/useChatEngine';

type ConvCollection = 'chatRooms' | 'clubs';

interface ForwardTarget {
  id: string;
  collection: ConvCollection;
  name: string;
  avatar?: string | null;
}

interface ForwardModalProps {
  isOpen: boolean;
  sources: Message[];
  onForward: (sources: Message[], targets: { collection: ConvCollection; roomId: string }[]) => Promise<{ ok: number; failed: number }>;
  onClose: () => void;
}

export function ForwardModal({ isOpen, sources, onForward, onClose }: ForwardModalProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { clubs } = useUserClubs(user?.uid);

  const [dmTargets, setDmTargets] = useState<ForwardTarget[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Map<string, ConvCollection>>(new Map());
  const [sending, setSending] = useState(false);

  // Load the user's DM rooms once when the modal opens.
  useEffect(() => {
    if (!isOpen || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'chatRooms'), where('participants', 'array-contains', user.uid)));
        const rows = await Promise.all(
          snap.docs.map(async (d) => {
            const data = d.data() as any;
            const otherId = (data.participants as string[]).find((p) => p !== user.uid);
            let name = 'Unknown User';
            let avatar: string | null = null;
            if (otherId) {
              try {
                const uDoc = await getDoc(doc(db, 'users', otherId));
                if (uDoc.exists()) { name = uDoc.data().name || 'Unknown User'; avatar = uDoc.data().profilePicture || null; }
              } catch { /* ignore */ }
            }
            return { id: d.id, collection: 'chatRooms' as const, name, avatar };
          })
        );
        if (!cancelled) setDmTargets(rows);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [isOpen, user?.uid]);

  // Reset selection when closed.
  useEffect(() => { if (!isOpen) { setSelected(new Map()); setSearch(''); } }, [isOpen]);

  const clubTargets: ForwardTarget[] = useMemo(
    () => clubs.map((c) => ({ id: c.id, collection: 'clubs' as const, name: c.name, avatar: c.avatar })),
    [clubs]
  );

  const allTargets = useMemo(() => {
    const merged = [...dmTargets, ...clubTargets];
    if (!search.trim()) return merged;
    const q = search.toLowerCase();
    return merged.filter((t) => t.name.toLowerCase().includes(q));
  }, [dmTargets, clubTargets, search]);

  const toggle = (t: ForwardTarget) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(t.id)) next.delete(t.id);
      else next.set(t.id, t.collection);
      return next;
    });
  };

  const handleForward = async () => {
    if (selected.size === 0 || sending) return;
    setSending(true);
    try {
      const targets = Array.from(selected.entries()).map(([roomId, collection]) => ({ collection, roomId }));
      const { ok, failed } = await onForward(sources, targets);
      if (failed > 0) {
        showToast(`Forwarded to ${ok} · ${failed} failed`, ok > 0 ? 'info' : 'error');
      } else {
        showToast(`Forwarded to ${ok} conversation${ok === 1 ? '' : 's'}`, 'success');
      }
      onClose();
    } catch {
      showToast('Failed to forward', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-luxury-ink/20 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="theme-card rounded-3xl w-full max-w-md shadow-2xl border border-luxury-ink/5 max-h-[70vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-luxury-ink/5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-luxury-ink">Forward to</h3>
                <button onClick={onClose} className="p-2 text-luxury-ink/40 hover:text-luxury-ink rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-luxury-ink/20" size={16} />
                <input
                  type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search conversations..."
                  className="w-full bg-surface-base border border-luxury-ink/5 rounded-xl py-3.5 pl-11 pr-4 focus:outline-none focus:border-brand-teal text-sm font-medium"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {allTargets.length === 0 ? (
                <div className="py-10 text-center text-luxury-ink/30 text-sm">No conversations</div>
              ) : (
                allTargets.map((t) => {
                  const checked = selected.has(t.id);
                  return (
                    <button
                      key={`${t.collection}-${t.id}`}
                      onClick={() => toggle(t)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left ${checked ? 'bg-brand-pink/8' : 'hover:bg-surface-soft'}`}
                    >
                      {checked ? <CheckCircle2 size={20} className="text-brand-mint shrink-0" /> : <Circle size={20} className="text-luxury-ink/20 shrink-0" />}
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center overflow-hidden border border-luxury-ink/5 shrink-0 ${t.collection === 'clubs' ? 'bg-linear-to-br from-brand-teal/15 to-brand-pink/15' : 'bg-brand-teal/5'}`}>
                        {t.avatar ? (
                          <img src={getOptimizedImageUrl(t.avatar)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : t.collection === 'clubs' ? (
                          <Users size={18} className="text-brand-teal" />
                        ) : (
                          <User size={18} className="text-brand-teal" />
                        )}
                      </div>
                      <span className="flex-1 min-w-0 truncate text-sm font-semibold text-luxury-ink">{t.name}</span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="p-4 border-t border-luxury-ink/5">
              <button
                onClick={handleForward}
                disabled={selected.size === 0 || sending}
                className="w-full py-3.5 bg-luxury-ink text-surface-base rounded-full font-bold text-sm hover:bg-brand-teal transition-all shadow-lg disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {sending ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Send size={16} /> Forward{selected.size > 0 ? ` to ${selected.size}` : ''}</>}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
