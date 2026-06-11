/**
 * MessageReactions.tsx
 * Drop into src/components/ui/MessageReactions.tsx
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Plus, Smile } from 'lucide-react';

type ReactionsMap = Record<string, string[]>;

interface MessageReactionsProps {
  reactions?: ReactionsMap;
  messageId: string;
  roomId: string;
  currentUserId: string;
  isMe: boolean;
  collectionPath?: 'chatRooms' | 'clubs';
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: 'Smileys',
    emojis: ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕'],
  },
  {
    label: 'Gestures',
    emojis: ['👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','👀','👁','👅','👄','💋'],
  },
  {
    label: 'Hearts',
    emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟'],
  },
  {
    label: 'Animals',
    emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒','🦅','🦆','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🕷','🦂','🐢','🐍','🦎','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮'],
  },
  {
    label: 'Food',
    emojis: ['🍎','🍊','🍋','🍇','🍓','🍒','🍑','🥭','🍍','🥝','🍅','🥑','🍆','🥦','🌽','🥕','🧅','🧄','🥔','🍠','🍞','🥐','🥖','🫓','🧀','🥚','🍳','🧇','🥞','🧈','🍖','🍗','🥩','🥓','🌭','🍔','🍟','🍕','🫔','🌮','🌯','🥙','🧆','🍿','🧂','🥫','🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍢','🍣','🍤','🍥','🥮','🍡','🥟','🥠','🥡','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','🍼','🥛','☕','🫖','🍵','🍶','🍾','🍷','🍸','🍹','🍺','🍻','🥂','🥃'],
  },
  {
    label: 'Objects',
    emojis: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🥍','🏏','🪃','🥅','⛳','🪁','🎣','🤿','🎽','🎿','🛷','🥌','🎯','🎮','🎲','♟','🎭','🎨','🖼','🎪','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🎸','🪕','🎻','🎬','📱','💻','⌨️','🖥','🖨','🖱','💾','💿','📀','📷','📸','📹','🎥','📽','🎞','📞','☎️','📟','📠','📺','📻','🧭','⏱','⏰','⏳','📡','🔋','🔌','💡','🔦','🕯','🪔','🧯','💰','💴','💵','💶','💷','💸','💳','🪙','💎','⚖️','🔧','🔨','⚒','🛠','⛏','🔩','🪛','💣','🪓','🔪','🗡','⚔️','🛡','🪚'],
  },
];

async function toggleReaction(
  emoji: string,
  messageId: string,
  roomId: string,
  userId: string,
  currentReactions: ReactionsMap,
  collectionPath: 'chatRooms' | 'clubs'
) {
  const msgRef = doc(db, collectionPath, roomId, 'messages', messageId);
  const existing = currentReactions[emoji] || [];
  const hasReacted = existing.includes(userId);
  const updated: ReactionsMap = { ...currentReactions };

  if (hasReacted) {
    const next = existing.filter(id => id !== userId);
    if (next.length === 0) delete updated[emoji];
    else updated[emoji] = next;
  } else {
    updated[emoji] = [...existing, userId];
  }

  await updateDoc(msgRef, { reactions: updated });
}

export default function MessageReactions({
  reactions = {},
  messageId,
  roomId,
  currentUserId,
  isMe,
  collectionPath = 'chatRooms',
  isOpen,
  onOpenChange,
}: MessageReactionsProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState(0);
  const [pickerPos, setPickerPos] = useState<{ top?: number; bottom?: number; left?: number; right?: number }>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const quickBarRef = useRef<HTMLDivElement>(null);

  const totalReactions = Object.values(reactions).reduce((sum, uids) => sum + uids.length, 0);
  const hasReactions = totalReactions > 0;

  useEffect(() => {
    if (!isOpen) setShowPicker(false);
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen && !showPicker) return;
    const handle = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !pickerRef.current?.contains(target) &&
        !quickBarRef.current?.contains(target)
      ) {
        onOpenChange(false);
        setShowPicker(false);
      }
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handle), 10);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handle); };
  }, [isOpen, showPicker, onOpenChange]);

  // Calculate picker position anchored to the quick bar
  const openPicker = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (quickBarRef.current) {
      const rect = quickBarRef.current.getBoundingClientRect();
      const pickerWidth = 320;
      const pickerHeight = 240; // approx
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      let top: number | undefined;
      let bottom: number | undefined;
      let left: number | undefined;
      let right: number | undefined;

      // Vertical: prefer above if not enough space below
      if (spaceBelow < pickerHeight + 12 && spaceAbove > pickerHeight) {
        bottom = window.innerHeight - rect.top + 8;
      } else {
        top = rect.bottom + 8;
      }

      // Horizontal: align to message side
      if (isMe) {
        right = window.innerWidth - rect.right;
        // clamp so it doesn't go off left edge
        if (right + pickerWidth > window.innerWidth) right = 8;
      } else {
        left = rect.left;
        // clamp so it doesn't go off right edge
        if ((left ?? 0) + pickerWidth > window.innerWidth) left = window.innerWidth - pickerWidth - 8;
      }

      setPickerPos({ top, bottom, left, right });
    }
    setShowPicker(true);
  };

  const handleQuickEmoji = async (emoji: string) => {
    await toggleReaction(emoji, messageId, roomId, currentUserId, reactions, collectionPath);
    onOpenChange(false);
  };

  const handlePickerEmoji = async (emoji: string) => {
    await toggleReaction(emoji, messageId, roomId, currentUserId, reactions, collectionPath);
    setShowPicker(false);
    onOpenChange(false);
  };

  return (
    <div
      ref={containerRef}
      className={`flex items-center gap-1.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* ── Existing reaction bubbles ── */}
      {hasReactions && (
        <div className={`flex flex-wrap gap-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
          {Object.entries(reactions).map(([emoji, uids]) => {
            if (uids.length === 0) return null;
            const iReacted = uids.includes(currentUserId);
            return (
              <button
                key={emoji}
                onClick={(e) => { e.stopPropagation(); toggleReaction(emoji, messageId, roomId, currentUserId, reactions, collectionPath); }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-sm border transition-all hover:scale-110 active:scale-95 ${
                  iReacted
                    ? 'bg-brand-teal/15 border-brand-teal/40 shadow-sm'
                    : 'bg-surface-card border-luxury-ink/10 hover:border-brand-teal/30'
                }`}
              >
                <span>{emoji}</span>
                {uids.length > 1 && (
                  <span className={`text-[10px] font-bold ${iReacted ? 'text-brand-teal' : 'text-luxury-ink/50'}`}>
                    {uids.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Quick emoji bar (inline, slides in) ── */}
      <AnimatePresence>
        {isOpen && !showPicker && (
          <motion.div
            ref={quickBarRef}
            initial={{ opacity: 0, scale: 0.85, x: isMe ? 10 : -10 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.85, x: isMe ? 10 : -10 }}
            transition={{ duration: 0.15, type: 'spring', stiffness: 400, damping: 28 }}
            className="flex items-center gap-0.5 bg-surface-card border border-luxury-ink/10 rounded-full px-2.5 py-1.5 shadow-xl z-50"
            onClick={e => e.stopPropagation()}
          >
            {QUICK_EMOJIS.map(emoji => (
              <button
                key={emoji}
                onClick={() => handleQuickEmoji(emoji)}
                className={`text-lg p-1 rounded-full hover:bg-surface-soft hover:scale-125 transition-all active:scale-95 ${
                  (reactions[emoji] || []).includes(currentUserId) ? 'bg-brand-teal/10' : ''
                }`}
              >
                {emoji}
              </button>
            ))}
            <button
              onClick={openPicker}
              className="p-1.5 rounded-full bg-surface-soft hover:bg-brand-teal/10 hover:text-brand-teal transition-all text-luxury-ink/40 ml-0.5"
            >
              <Plus size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Full emoji picker — anchored near quick bar ── */}
      <AnimatePresence>
        {showPicker && (
          <motion.div
            ref={pickerRef}
            initial={{ opacity: 0, scale: 0.92, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 6 }}
            transition={{ duration: 0.16 }}
            style={{ position: 'fixed', zIndex: 300, width: 320, ...pickerPos }}
            className="bg-surface-card border border-luxury-ink/10 rounded-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex gap-1 p-2 border-b border-luxury-ink/5 overflow-x-auto no-scrollbar">
              {EMOJI_GROUPS.map((group, idx) => (
                <button
                  key={group.label}
                  onClick={() => setPickerTab(idx)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                    pickerTab === idx ? 'bg-brand-teal/15 text-brand-teal' : 'text-luxury-ink/40 hover:bg-surface-soft'
                  }`}
                >
                  {group.label}
                </button>
              ))}
            </div>
            <div className="p-3 h-48 overflow-y-auto">
              <div className="grid grid-cols-8 gap-0.5">
                {EMOJI_GROUPS[pickerTab].emojis.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => handlePickerEmoji(emoji)}
                    className={`text-xl p-1.5 rounded-lg hover:bg-surface-soft hover:scale-125 transition-all active:scale-95 ${
                      (reactions[emoji] || []).includes(currentUserId) ? 'bg-brand-teal/10' : ''
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}