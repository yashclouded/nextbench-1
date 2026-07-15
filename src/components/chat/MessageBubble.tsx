import React, { useState, useEffect } from 'react';
import { X, SmilePlus, CheckCircle2, Circle, RefreshCw, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import Avatar from '../ui/Avatar';
import SmartImage from '../ui/SmartImage';
import VoiceMessageBubble from '../ui/VoiceMessageBubble';
import MessageReactions from '../ui/MessageReactions';
import LinkifiedText from '../ui/LinkifiedText';
import { Message } from '../../hooks/useChatEngine';

function ClubSenderAvatar({ msg }: { msg: Message }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{ name: string, avatar: string | null } | null>(null);

  useEffect(() => {
    if (msg.senderName) return; // Already have it!
    let isMounted = true;
    getDoc(doc(db, 'users', msg.senderId)).then(snap => {
      if (snap.exists() && isMounted) {
        setProfile({ name: snap.data().name || 'Member', avatar: snap.data().profilePicture || null });
      }
    });
    return () => { isMounted = false; };
  }, [msg.senderId, msg.senderName]);

  const name = msg.senderName || profile?.name || 'Member';
  const avatar = msg.senderAvatar !== undefined ? msg.senderAvatar : profile?.avatar;

  return (
    <div
      className="shrink-0 self-end mb-1 cursor-pointer hover:opacity-80 transition-opacity"
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/profile/${msg.senderId}`);
      }}
    >
      <Avatar src={avatar} name={name} size={28} />
    </div>
  );
}

function ClubSenderName({ msg }: { msg: Message }) {
  const navigate = useNavigate();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (msg.senderName) return; // Already have it!
    let isMounted = true;
    getDoc(doc(db, 'users', msg.senderId)).then(snap => {
      if (snap.exists() && isMounted) {
        setName(snap.data().name || 'Member');
      }
    });
    return () => { isMounted = false; };
  }, [msg.senderId, msg.senderName]);

  const displayName = msg.senderName || name || 'Member';

  return (
    <span
      className="cursor-pointer hover:underline"
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/profile/${msg.senderId}`);
      }}
    >
      {displayName}
    </span>
  );
}

interface MessageBubbleProps {
  msg: Message;
  user: any;
  isSelectMode: boolean;
  isSelected: boolean;
  toggleMessageSelection: (msgId: string) => void;
  activeReactionMsgId: string | null;
  setActiveReactionMsgId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedMessageId: string | null;
  setSelectedMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setMenuPosition: React.Dispatch<React.SetStateAction<{ top?: number; bottom?: number; left?: number; right?: number } | null>>;
  replyingTo: Message | null;
  setReplyingTo: React.Dispatch<React.SetStateAction<Message | null>>;
  setDeleteConfirmMsgId: React.Dispatch<React.SetStateAction<string | null>>;
  setDeleteEveryoneConfirmMsgId: React.Dispatch<React.SetStateAction<string | null>>;
  onPin?: (msgId: string, text?: string) => void;
  collectionPath: 'chatRooms' | 'clubs';
  roomId: string;
  showLightbox: (urls: string[]) => void;
  resendMessage: (tempId: string) => void;
  removeFailedMessage: (tempId: string) => void;
  isAdmin: boolean;
}

// Memoized message item to prevent re-rendering the message list when typing in the composer
export const MessageBubble = React.memo(function MessageBubble({
  msg,
  user,
  isSelectMode,
  isSelected,
  toggleMessageSelection,
  activeReactionMsgId,
  setActiveReactionMsgId,
  selectedMessageId,
  setSelectedMessageId,
  setMenuPosition,
  replyingTo,
  setReplyingTo,
  setDeleteConfirmMsgId,
  setDeleteEveryoneConfirmMsgId,
  onPin,
  collectionPath,
  roomId,
  showLightbox,
  resendMessage,
  removeFailedMessage,
  isAdmin,
}: MessageBubbleProps) {
  const isMe = msg.senderId === user?.uid;
  const isDeleted = msg.isDeletedForEveryone;
  const isOptimistic = msg.status === 'pending';
  const isFailed = msg.status === 'failed';

  return (
    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} pb-2 relative group`}>
      {/* Bubble Row */}
      <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} items-center gap-1.5 w-full`}>
        {/* Bulk Select Checkbox */}
        {isSelectMode && (
          <button onClick={() => toggleMessageSelection(msg.id)} className="p-2 shrink-0">
            {isSelected ? <CheckCircle2 className="text-brand-teal" size={18} /> : <Circle className="text-luxury-ink/20" size={18} />}
          </button>
        )}

        {/* Inline Quick Reaction Trigger */}
        {!isSelectMode && !isDeleted && !isOptimistic && !isFailed && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveReactionMsgId(activeReactionMsgId === msg.id ? null : msg.id);
              setSelectedMessageId(null);
              setMenuPosition(null);
            }}
            className={`opacity-0 group-hover:opacity-100 p-1.5 rounded-full hover:bg-surface-soft text-luxury-ink/30 hover:text-brand-teal transition-all shrink-0 ${isMe ? 'order-first' : 'order-last'}`}
            title="React"
          >
            <SmilePlus size={15} />
          </button>
        )}

        {/* Sender Avatar (Group Chats Only) */}
        {collectionPath === 'clubs' && !isMe && !isDeleted && (
          <ClubSenderAvatar msg={msg} />
        )}

        {/* Message Bubble Box */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (isSelectMode) {
              toggleMessageSelection(msg.id);
              return;
            }
            if (isOptimistic || isFailed) return;

            // Anchor Context Menu
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const pos = spaceBelow < 200
              ? { bottom: window.innerHeight - rect.top + 4, ...(isMe ? { right: window.innerWidth - rect.right } : { left: rect.left }) }
              : { top: rect.bottom + 4, ...(isMe ? { right: window.innerWidth - rect.right } : { left: rect.left }) };
            setMenuPosition(selectedMessageId === msg.id ? null : pos);
            setSelectedMessageId(selectedMessageId === msg.id ? null : msg.id);
            setActiveReactionMsgId(null);
          }}
          className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm font-medium cursor-pointer relative shadow-xs border ${
            isDeleted
              ? 'bg-surface-soft border-luxury-ink/5 text-luxury-ink/30 italic'
              : isMe
              ? 'bg-brand-teal text-white border-brand-teal/20 rounded-tr-xs'
              : 'bg-surface-card text-luxury-ink border-luxury-ink/5 rounded-tl-xs'
          } ${isOptimistic ? 'opacity-50' : ''} ${isFailed ? 'border-red-400 bg-red-50/10' : ''}`}
        >
          {/* Sender Name (Group Chats Only) */}
          {collectionPath === 'clubs' && !isMe && !isDeleted && (
            <div className="text-[11px] font-bold text-brand-teal mb-1 leading-tight tracking-wide">
              <ClubSenderName msg={msg} />
            </div>
          )}

          {/* Reply Preview */}
          {!isDeleted && msg.replyToText && (
            <div className={`text-xs mb-2 p-2 rounded-lg border-l-2 ${isMe ? 'bg-black/10 border-white/40' : 'bg-surface-soft border-brand-teal'}`}>
              <p className="opacity-70 line-clamp-1">{msg.replyToText}</p>
            </div>
          )}

          {isDeleted ? (
            <p className="flex items-center gap-1.5">
              <X size={12} /> This message was deleted
            </p>
          ) : (
            <>
              {/* Image attachment */}
              {msg.image && (
                <div className={`relative overflow-hidden bg-black/5 rounded-lg -mx-4 ${((collectionPath === 'clubs' && !isMe) || msg.replyToText) ? 'mt-2' : '-mt-3'} w-[280px] max-w-full ${msg.text ? 'mb-2' : '-mb-3'}`}>
                  {(() => {
                    const isObj = typeof msg.image === 'object' && msg.image !== null;
                    const imageUrl = isObj ? msg.image.url : msg.image;
                    const imageW = isObj ? msg.image.w : undefined;
                    const imageH = isObj ? msg.image.h : undefined;
                    return (
                      <SmartImage
                        src={imageUrl}
                        alt="Chat Attachment"
                        w={imageW}
                        h={imageH}
                        ratio={imageW && imageH ? undefined : 3/4}
                        fit="cover"
                        className="hover:opacity-90 transition-opacity cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          showLightbox([imageUrl]);
                        }}
                      />
                    );
                  })()}
                </div>
              )}

              {/* Voice recording bubble */}
              {msg.type === 'voice' && msg.audioUrl && (
                <VoiceMessageBubble audioUrl={msg.audioUrl} duration={msg.duration} isSent={true} />
              )}

              {/* Message text */}
              {msg.text && (
                <div className="break-words whitespace-pre-wrap leading-relaxed">
                  <LinkifiedText text={msg.text} />
                </div>
              )}
            </>
          )}

          {/* Pending Spinner for Optimistic */}
          {isOptimistic && (
            <div className="absolute bottom-1 right-1 flex items-center justify-center bg-black/10 rounded-full p-0.5">
              <div className="w-2 h-2 border border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Failed status retry button */}
        {isFailed && (
          <div className="flex items-center gap-1.5 ml-2">
            <button onClick={(e) => { e.stopPropagation(); resendMessage(msg.id); }} className="p-2 text-brand-teal hover:bg-brand-teal/5 rounded-full transition-colors" title="Retry sending">
              <RefreshCw size={15} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); removeFailedMessage(msg.id); }} className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors" title="Delete drafts">
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>

      {/* Reactions list */}
      {!isDeleted && msg.reactions && (
        <div className={`mt-1 flex w-full ${isMe ? 'justify-end' : 'justify-start'}`}>
          <MessageReactions
            reactions={msg.reactions}
            messageId={msg.id}
            roomId={roomId}
            currentUserId={user?.uid || ''}
            isMe={isMe}
            collectionPath={collectionPath}
            isOpen={activeReactionMsgId === msg.id}
            onOpenChange={(open) => setActiveReactionMsgId(open ? msg.id : null)}
          />
        </div>
      )}
    </div>
  );
});
