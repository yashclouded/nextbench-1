import { ChevronLeft, ShieldCheck, MoreVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import Avatar from '../ui/Avatar';
import { SelectionToolbar } from './SelectionToolbar';

// Three-dot pulse (brand-teal) per the chat visual addendum.
function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="w-1 h-1 rounded-full bg-brand-teal animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-1 h-1 rounded-full bg-brand-teal animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-1 h-1 rounded-full bg-brand-teal animate-bounce" style={{ animationDelay: '300ms' }} />
    </span>
  );
}

// Resolve club typers' names (WhatsApp-group convention). Names are fetched
// lazily and cached module-wide so repeated typing doesn't refetch.
const nameCache = new Map<string, string>();
function ClubTypingLabel({ typingUserIds }: { typingUserIds: string[] }) {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    const ids = typingUserIds.slice(0, 3);
    Promise.all(
      ids.map(async (uid) => {
        if (nameCache.has(uid)) return nameCache.get(uid)!;
        try {
          const snap = await getDoc(doc(db, 'users', uid));
          const name = (snap.exists() && snap.data().name) || 'Someone';
          nameCache.set(uid, name);
          return name;
        } catch {
          return 'Someone';
        }
      })
    ).then((resolved) => { if (alive) setNames(resolved); });
    return () => { alive = false; };
  }, [typingUserIds.join(',')]);

  const count = typingUserIds.length;
  let label: string;
  if (count === 0) label = '';
  else if (count === 1) label = `${names[0] || 'Someone'} is typing`;
  else if (count === 2) label = `${names[0] || 'Someone'} and ${names[1] || 'someone'} are typing`;
  else label = 'Several people are typing';
  return <span className="truncate">{label}</span>;
}

interface ChatHeaderProps {
  collectionPath: 'chatRooms' | 'clubs';
  roomId: string;
  title: string;
  subtitle?: string;
  avatar?: string | null;
  otherUser?: any;
  otherPresence?: any;
  recipientId?: string;
  onBack?: () => void;
  showOptions?: boolean;
  setShowOptions?: (show: boolean) => void;
  isSelectMode: boolean;
  selectedCount: number;
  onBulkDelete: () => void;
  onCancelSelect: () => void;
  typingUserIds?: string[];
  clubMembers?: string[];
}

export function ChatHeader({
  collectionPath,
  roomId,
  title,
  subtitle,
  avatar,
  otherUser,
  otherPresence,
  recipientId,
  onBack,
  showOptions,
  setShowOptions,
  isSelectMode,
  selectedCount,
  onBulkDelete,
  onCancelSelect,
  typingUserIds = [],
  clubMembers,
}: ChatHeaderProps) {
  const navigate = useNavigate();
  const isTyping = typingUserIds.length > 0;

  return (
    <div
      className="px-6 py-4 border-b border-luxury-ink/5 flex items-center justify-between z-30 shrink-0"
      style={{ backgroundColor: 'var(--color-surface-elevated)' }}
    >
      <div className="flex items-center gap-4 min-w-0">
        {onBack && (
          <button onClick={onBack} className="p-2 text-luxury-ink/60 hover:text-luxury-ink hover:bg-surface-soft rounded-full transition-colors active:scale-90" title="Back">
            <ChevronLeft size={20} />
          </button>
        )}
        <div
          className="flex items-center gap-4 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => {
            if (collectionPath === 'clubs') {
              navigate(`/club/${roomId}`);
            } else if (recipientId) {
              navigate(`/profile/${recipientId}`);
            }
          }}
        >
          <Avatar
            src={avatar}
            name={title}
            size={40}
            className="ring-1 ring-inset ring-luxury-ink/[0.06]"
          />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-luxury-ink truncate flex items-center gap-1.5">
              {title}
              {collectionPath === 'chatRooms' && otherUser?.verified && <ShieldCheck size={14} className="text-brand-teal" />}
            </h2>
            {collectionPath === 'chatRooms' && (
              isTyping ? (
                <p className="text-[10px] font-semibold text-brand-teal flex items-center gap-1">
                  <TypingDots /> typing…
                </p>
              ) : (
                <p className="text-[10px] font-semibold text-luxury-ink/40">
                  {otherPresence?.status === 'online' ? (
                    <span className="text-brand-teal flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-brand-teal" /> Active Now</span>
                  ) : (
                    otherPresence?.label || 'Offline'
                  )}
                </p>
              )
            )}
            {collectionPath === 'clubs' && (
              isTyping ? (
                <p className="text-[10px] font-semibold text-brand-teal flex items-center gap-1 truncate">
                  <TypingDots /> <ClubTypingLabel typingUserIds={typingUserIds} />
                </p>
              ) : (
                subtitle && <p className="text-[10px] text-luxury-ink/40 truncate">{subtitle}</p>
              )
            )}
          </div>
        </div>
      </div>

      {/* Header Actions */}
      <div className="flex items-center gap-2">
        {isSelectMode ? (
          <SelectionToolbar
            count={selectedCount}
            onDelete={onBulkDelete}
            onCancel={onCancelSelect}
          />
        ) : (
          <>
            {setShowOptions && (
              <button onClick={() => setShowOptions(!showOptions)} className={`p-2 rounded-full transition-colors ${showOptions ? 'bg-surface-soft text-luxury-ink' : 'text-luxury-ink/60 hover:text-luxury-ink hover:bg-surface-soft'}`} title="Options">
                <MoreVertical size={20} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
