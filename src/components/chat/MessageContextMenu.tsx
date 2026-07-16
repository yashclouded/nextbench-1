import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Reply, Info, Trash2, Pin, CheckCircle2, Forward } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Message } from '../../hooks/useChatEngine';

// Resolve + list the names of members who have read a message (Info modal).
const seenNameCache = new Map<string, string>();
function SeenByRow({ readBy, isClub }: { readBy: string[]; isClub: boolean }) {
  const [names, setNames] = React.useState<string[]>([]);
  React.useEffect(() => {
    let alive = true;
    Promise.all(
      readBy.slice(0, 20).map(async (uid) => {
        if (seenNameCache.has(uid)) return seenNameCache.get(uid)!;
        try {
          const snap = await getDoc(doc(db, 'users', uid));
          const name = (snap.exists() && snap.data().name) || 'Member';
          seenNameCache.set(uid, name);
          return name;
        } catch {
          return 'Member';
        }
      })
    ).then((n) => { if (alive) setNames(n); });
    return () => { alive = false; };
  }, [readBy.join(',')]);

  return (
    <div className="p-3 bg-surface-soft rounded-xl">
      <div className="flex items-center gap-1.5 mb-1">
        <CheckCircle2 size={14} className="text-brand-teal" />
        <span className="text-sm font-semibold text-luxury-ink/70">
          {readBy.length === 0 ? (isClub ? 'Not seen yet' : 'Delivered') : `Seen by ${readBy.length}`}
        </span>
      </div>
      {names.length > 0 && (
        <p className="text-xs text-luxury-ink/50 leading-relaxed">{names.join(', ')}</p>
      )}
    </div>
  );
}

interface MessageContextMenuProps {
  messages: Message[];
  user: any;
  isClub: boolean;
  isAdmin: boolean;
  onPin?: (msgId: string, text?: string) => void;
  // menu anchor state (owned by ChatView)
  selectedMessageId: string | null;
  setSelectedMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  menuPosition: { top?: number; bottom?: number; left?: number; right?: number } | null;
  // action targets
  setReplyingTo: React.Dispatch<React.SetStateAction<Message | null>>;
  setIsSelectMode: React.Dispatch<React.SetStateAction<boolean>>;
  toggleMessageSelection: (msgId: string) => void;
  msgInfoId: string | null;
  setMsgInfoId: React.Dispatch<React.SetStateAction<string | null>>;
  deleteConfirmMsgId: string | null;
  setDeleteConfirmMsgId: React.Dispatch<React.SetStateAction<string | null>>;
  deleteEveryoneConfirmMsgId: string | null;
  setDeleteEveryoneConfirmMsgId: React.Dispatch<React.SetStateAction<string | null>>;
  deleteForMe: (id: string) => Promise<void> | void;
  deleteForEveryone: (id: string) => Promise<void> | void;
  onCopyText: (text: string) => void;
  onForward: (msgId: string) => void;
}

export function MessageContextMenu({
  messages,
  user,
  isClub,
  isAdmin,
  onPin,
  selectedMessageId,
  setSelectedMessageId,
  menuPosition,
  setReplyingTo,
  setIsSelectMode,
  toggleMessageSelection,
  msgInfoId,
  setMsgInfoId,
  deleteConfirmMsgId,
  setDeleteConfirmMsgId,
  deleteEveryoneConfirmMsgId,
  setDeleteEveryoneConfirmMsgId,
  deleteForMe,
  deleteForEveryone,
  onCopyText,
  onForward,
}: MessageContextMenuProps) {
  return (
    <AnimatePresence>
      {/* Context Action Menu Overlay */}
      {selectedMessageId && menuPosition && (
        <div className="fixed inset-0 z-[1000]" onClick={() => setSelectedMessageId(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{ ...menuPosition }}
            className="absolute bg-surface-card border border-luxury-ink/10 rounded-2xl shadow-2xl py-1.5 min-w-[170px] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const targetMsg = messages.find((m) => m.id === selectedMessageId);
              if (!targetMsg || targetMsg.isDeletedForEveryone) return null;
              const isMe = targetMsg.senderId === user?.uid;

              return (
                <>
                  <button
                    onClick={() => {
                      setReplyingTo(targetMsg);
                      setSelectedMessageId(null);
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-luxury-ink/70 hover:bg-surface-soft transition-colors flex items-center gap-2.5"
                  >
                    <Reply size={14} /> Reply
                  </button>
                  <button
                    onClick={() => {
                      onForward(targetMsg.id);
                      setSelectedMessageId(null);
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-luxury-ink/70 hover:bg-surface-soft transition-colors flex items-center gap-2.5"
                  >
                    <Forward size={14} /> Forward
                  </button>
                  <button
                    onClick={() => {
                      setMsgInfoId(targetMsg.id);
                      setSelectedMessageId(null);
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-luxury-ink/70 hover:bg-surface-soft transition-colors flex items-center gap-2.5"
                  >
                    <Info size={14} /> Info
                  </button>
                  {targetMsg.text && (
                    <button
                      onClick={() => {
                        onCopyText(targetMsg.text!);
                        setSelectedMessageId(null);
                      }}
                      className="w-full px-4 py-2.5 text-left text-xs font-bold text-luxury-ink/70 hover:bg-surface-soft transition-colors flex items-center gap-2.5"
                    >
                      Copy text
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setIsSelectMode(true);
                      toggleMessageSelection(targetMsg.id);
                      setSelectedMessageId(null);
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-luxury-ink/70 hover:bg-surface-soft transition-colors flex items-center gap-2.5"
                  >
                    Select messages
                  </button>
                  <button
                    onClick={() => {
                      setDeleteConfirmMsgId(targetMsg.id);
                      setSelectedMessageId(null);
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-red-500 hover:bg-red-50 transition-colors flex items-center gap-2.5 border-t border-luxury-ink/5"
                  >
                    <X size={14} /> Delete for me
                  </button>
                  {(isMe || isAdmin) && (
                    <button
                      onClick={() => {
                        setDeleteEveryoneConfirmMsgId(targetMsg.id);
                        setSelectedMessageId(null);
                      }}
                      className="w-full px-4 py-2.5 text-left text-xs font-bold text-red-500 hover:bg-red-50 transition-colors flex items-center gap-2.5 border-t border-luxury-ink/5"
                    >
                      <Trash2 size={14} /> Delete for everyone
                    </button>
                  )}
                  {onPin && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPin(targetMsg.id, targetMsg.text || '📷 Image');
                        setSelectedMessageId(null);
                      }}
                      className="w-full px-4 py-2.5 text-left text-xs font-bold text-luxury-ink/70 hover:bg-surface-soft transition-colors flex items-center gap-2.5 border-t border-luxury-ink/5"
                    >
                      <Pin size={14} /> Pin message
                    </button>
                  )}
                </>
              );
            })()}
          </motion.div>
        </div>
      )}

      {/* Delete Confirmation Dialog Modals */}
      {deleteConfirmMsgId && (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs" onClick={() => setDeleteConfirmMsgId(null)}>
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-surface-card rounded-3xl w-full max-w-sm p-6 shadow-2xl border border-luxury-ink/5"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-luxury-ink mb-2">Delete Message</h3>
            <p className="text-xs text-luxury-ink/65 mb-6">Are you sure you want to delete this message for yourself? Other chat members will still see it.</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteConfirmMsgId(null)} className="px-5 py-2.5 rounded-full text-xs font-bold text-luxury-ink/50 hover:bg-surface-soft">Cancel</button>
              <button type="button" onClick={async () => { await deleteForMe(deleteConfirmMsgId); setDeleteConfirmMsgId(null); }} className="px-5 py-2.5 bg-red-500 text-white rounded-full text-xs font-bold hover:bg-red-600 shadow-lg">Delete</button>
            </div>
          </motion.div>
        </div>
      )}

      {deleteEveryoneConfirmMsgId && (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs" onClick={() => setDeleteEveryoneConfirmMsgId(null)}>
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-surface-card rounded-3xl w-full max-w-sm p-6 shadow-2xl border border-luxury-ink/5"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-red-500 mb-2">Delete for Everyone</h3>
            <p className="text-xs text-luxury-ink/65 mb-6">This message will be permanently deleted for all chat members. This cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteEveryoneConfirmMsgId(null)} className="px-5 py-2.5 rounded-full text-xs font-bold text-luxury-ink/50 hover:bg-surface-soft">Cancel</button>
              <button type="button" onClick={async () => { await deleteForEveryone(deleteEveryoneConfirmMsgId); setDeleteEveryoneConfirmMsgId(null); }} className="px-5 py-2.5 bg-red-500 text-white rounded-full text-xs font-bold hover:bg-red-600 shadow-lg">Delete for everyone</button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Message Info Modal */}
      {msgInfoId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1000] flex items-center justify-center p-4" onClick={() => setMsgInfoId(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-surface-card w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-luxury-ink/5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-brand-teal/10 flex items-center justify-center text-brand-teal">
                <Info size={20} />
              </div>
              <div>
                <h3 className="font-bold text-luxury-ink">Message Info</h3>
                <p className="text-xs text-luxury-ink/60">Delivery details</p>
              </div>
            </div>

            {(() => {
              const msg = messages.find(m => m.id === msgInfoId);
              if (!msg) return null;
              const isMe = msg.senderId === user?.uid;
              const sentTime = msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Just now';

              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-surface-soft rounded-xl">
                    <span className="text-sm font-semibold text-luxury-ink/70">Sent at</span>
                    <span className="text-sm font-medium text-luxury-ink">{sentTime}</span>
                  </div>
                  {isMe && (
                    <div className="flex items-center justify-between p-3 bg-surface-soft rounded-xl">
                      <span className="text-sm font-semibold text-luxury-ink/70">Status</span>
                      <span className="text-sm font-medium text-brand-teal flex items-center gap-1.5">
                        <CheckCircle2 size={16} />
                        {msg.status === 'pending' ? 'Sending...' : msg.status === 'failed' ? 'Failed' : isClub ? 'Sent to Club' : 'Delivered / Seen'}
                      </span>
                    </div>
                  )}
                  {isMe && msg.status !== 'pending' && msg.status !== 'failed' && (
                    <SeenByRow readBy={(msg.readBy || []).filter((uid) => uid !== user?.uid)} isClub={isClub} />
                  )}
                </div>
              );
            })()}

            <button
              onClick={() => setMsgInfoId(null)}
              className="w-full mt-6 py-3 bg-luxury-ink text-surface-base rounded-xl text-sm font-bold hover:bg-luxury-ink/90 transition-colors"
            >
              Close
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
