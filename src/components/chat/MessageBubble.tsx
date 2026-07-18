import React, { useState, useEffect, Suspense, lazy } from 'react';
import { X, SmilePlus, CheckCircle2, Circle, RefreshCw, Trash2, CornerUpRight, Check, CheckCheck, FileText, Paperclip, Film, Mic, Image as ImageIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import Avatar from '../ui/Avatar';
import SmartImage from '../ui/SmartImage';
import VoiceMessageBubble from '../ui/VoiceMessageBubble';
import VideoPlayer from '../ui/VideoPlayer';
import MessageReactions from '../ui/MessageReactions';
import LinkifiedText from '../ui/LinkifiedText';
import { formatFileSize } from '../../lib/formatFileSize';
import { Message } from '../../hooks/useChatEngine';

const LazyPdfViewer = lazy(() => import('../ui/PdfViewer'));
import { firstUrl, getLinkPreview, LinkPreview } from '../../lib/linkPreview';
import { LinkPreviewCard } from './LinkPreviewCard';

// Lazily resolve an OpenGraph preview for the first URL in a message's text.
// Keyed on the URL; the lib-level Map cache dedupes across the session so a
// virtualized row remounting or an unrelated re-render doesn't refetch.
function useLinkPreview(text?: string): LinkPreview | null {
  const url = firstUrl(text);
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  useEffect(() => {
    if (!url) { setPreview(null); return; }
    let alive = true;
    getLinkPreview(url).then((p) => { if (alive) setPreview(p); });
    return () => { alive = false; };
  }, [url]);
  return preview;
}

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
  isHighlighted?: boolean;
  onJumpToMessage?: (msgId: string) => void;
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
  recipientId?: string;
}

// Memoized message item to prevent re-rendering the message list when typing in the composer
export const MessageBubble = React.memo(function MessageBubble({
  msg,
  user,
  isSelectMode,
  isSelected,
  isHighlighted,
  onJumpToMessage,
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
  recipientId,
}: MessageBubbleProps) {
  const isMe = msg.senderId === user?.uid;
  const isDeleted = msg.isDeletedForEveryone;
  const isOptimistic = msg.status === 'pending';
  const isFailed = msg.status === 'failed';
  // Read-receipt state for own, delivered messages.
  const showTicks = isMe && !isDeleted && !isOptimistic && !isFailed;
  const isDM = collectionPath === 'chatRooms';
  const readByOthers = (msg.readBy || []).filter((uid) => uid !== user?.uid);
  const dmRead = isDM && !!recipientId && (msg.readBy || []).includes(recipientId);
  const clubSeen = !isDM && readByOthers.length > 0;
  // Resolve a link preview only for delivered, non-deleted text messages.
  const linkPreview = useLinkPreview(!isDeleted && !isOptimistic && !isFailed ? msg.text : undefined);

  // File/document: PDFs open in the in-app viewer; other files open in a new tab.
  const fileName = msg.file?.name || '';
  const isPdfFile = !!msg.file && (
    (msg.file.mime === 'application/pdf') || fileName.toLowerCase().endsWith('.pdf') || !!msg.file.pages
  );
  const [showPdf, setShowPdf] = useState(false);
  const openFile = () => {
    if (!msg.file?.url) return;
    if (isPdfFile) setShowPdf(true);
    else window.open(msg.file.url, '_blank', 'noopener,noreferrer');
  };

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
          className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm font-medium cursor-pointer relative shadow-xs border transition-shadow duration-300 ${
            isDeleted
              ? 'bg-surface-soft border-luxury-ink/5 text-luxury-ink/30 italic'
              : isMe
              ? 'bg-brand-teal text-white border-brand-teal/20 rounded-tr-xs'
              : 'bg-surface-card text-luxury-ink border-luxury-ink/5 rounded-tl-xs'
          } ${isOptimistic ? 'opacity-50' : ''} ${isFailed ? 'border-red-400 bg-red-50/10' : ''} ${isHighlighted ? 'ring-2 ring-brand-teal ring-offset-2 ring-offset-surface-base' : ''}`}
        >
          {/* Sender Name (Group Chats Only) */}
          {collectionPath === 'clubs' && !isMe && !isDeleted && (
            <div className="text-[11px] font-bold text-brand-teal mb-1 leading-tight tracking-wide">
              <ClubSenderName msg={msg} />
            </div>
          )}

          {/* Forwarded label */}
          {!isDeleted && msg.forwardedFrom && (
            <div className={`text-[10px] font-semibold italic mb-1 flex items-center gap-1 ${isMe ? 'text-white/60' : 'text-luxury-ink/40'}`}>
              <CornerUpRight size={11} /> Forwarded
            </div>
          )}

          {/* Reply Preview — WhatsApp style: colored bar, sender name, a type
              icon + thumbnail for media, and a short label. Tapping it jumps to
              the original message. */}
          {!isDeleted && msg.replyToId && (msg.replyToText || msg.replyToType) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (msg.replyToId) onJumpToMessage?.(msg.replyToId);
              }}
              className={`w-full text-left flex items-stretch gap-2 mb-2 rounded-lg overflow-hidden border-l-[3px] transition-colors ${
                isMe ? 'bg-black/10 border-white/50 hover:bg-black/15' : 'bg-surface-soft border-brand-teal hover:bg-brand-teal/5'
              }`}
            >
              <div className="flex-1 min-w-0 py-1.5 pl-2 pr-1">
                <div className={`text-[11px] font-bold truncate ${isMe ? 'text-white/90' : 'text-brand-teal'}`}>
                  {msg.replyToSenderId && msg.replyToSenderId === user?.uid ? 'You' : (msg.replyToSenderName || 'user')}
                </div>
                <div className={`text-xs truncate flex items-center gap-1 ${isMe ? 'text-white/70' : 'text-luxury-ink/55'}`}>
                  {msg.replyToType === 'image' && <ImageIcon size={12} className="shrink-0" />}
                  {msg.replyToType === 'video' && <Film size={12} className="shrink-0" />}
                  {msg.replyToType === 'voice' && <Mic size={12} className="shrink-0" />}
                  {msg.replyToType === 'file' && <Paperclip size={12} className="shrink-0" />}
                  <span className="truncate">
                    {msg.replyToType === 'image' ? (msg.replyToText && msg.replyToText !== 'Photo' ? msg.replyToText : 'Photo')
                      : msg.replyToType === 'video' ? (msg.replyToText && msg.replyToText !== 'Video' ? msg.replyToText : 'Video')
                      : msg.replyToType === 'voice' ? 'Voice message'
                      : msg.replyToText || 'Message'}
                  </span>
                </div>
              </div>
              {msg.replyToImage && (
                <div className="w-11 shrink-0 self-stretch bg-black/10 relative">
                  <img src={msg.replyToImage} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  {msg.replyToType === 'video' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <Film size={12} className="text-white" />
                    </div>
                  )}
                </div>
              )}
            </button>
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
                <VoiceMessageBubble audioUrl={msg.audioUrl} duration={msg.duration} isSent={isMe} />
              )}

              {/* Video attachment */}
              {msg.type === 'video' && msg.video?.url && (
                <div
                  className={`relative overflow-hidden rounded-lg -mx-4 ${((collectionPath === 'clubs' && !isMe) || msg.replyToText) ? 'mt-2' : '-mt-3'} w-[280px] max-w-full ${msg.text ? 'mb-2' : '-mb-3'}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <VideoPlayer src={msg.video.url} poster={msg.video.poster} className="w-full" />
                </div>
              )}

              {/* File / document card */}
              {msg.type === 'file' && msg.file?.url && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); openFile(); }}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 w-[240px] max-w-full text-left transition-colors ${msg.text ? 'mb-2' : ''} ${
                    isMe ? 'bg-black/10 border-white/20 hover:bg-black/15' : 'bg-surface-soft border-luxury-ink/10 hover:bg-surface-card'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isMe ? 'bg-white/15' : 'bg-brand-teal/10'}`}>
                    {isPdfFile ? <FileText size={20} className={isMe ? 'text-white' : 'text-brand-teal'} /> : <Paperclip size={20} className={isMe ? 'text-white' : 'text-brand-teal'} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold truncate ${isMe ? 'text-white' : 'text-luxury-ink'}`}>{msg.file.name}</p>
                    <p className={`text-[10px] font-medium mt-0.5 ${isMe ? 'text-white/70' : 'text-luxury-ink/50'}`}>
                      {isPdfFile ? `PDF${msg.file.pages ? ` · ${msg.file.pages} page${msg.file.pages > 1 ? 's' : ''}` : ''}` : (formatFileSize(msg.file.size) || 'File')}
                    </p>
                  </div>
                </button>
              )}

              {/* Message text */}
              {msg.text && (
                <div className="break-words whitespace-pre-wrap leading-relaxed">
                  <LinkifiedText text={msg.text} isMe={isMe} />
                </div>
              )}

              {/* Link preview card (first URL in the text) */}
              {linkPreview && <LinkPreviewCard preview={linkPreview} isMe={isMe} />}
            </>
          )}

          {/* Pending Spinner for Optimistic */}
          {isOptimistic && (
            <div className="absolute bottom-1 right-1 flex items-center justify-center bg-black/10 rounded-full p-0.5">
              <div className="w-2 h-2 border border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Read-receipt ticks (own messages) */}
          {showTicks && (
            <div className="flex justify-end mt-0.5 -mb-1" title={dmRead ? 'Read' : clubSeen ? 'Seen' : 'Sent'}>
              {isDM ? (
                dmRead ? (
                  <CheckCheck size={13} className="text-white/90" />
                ) : (
                  <Check size={13} className="text-white/50" />
                )
              ) : (
                clubSeen && <Check size={13} className="text-white/80" />
              )}
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

      {/* Reactions list + emoji picker. Always mounted for non-deleted messages
          so the picker can open even before the message has any reaction
          (MessageReactions renders nothing visible when reactions are empty and
          the bar is closed). */}
      {!isDeleted && !isOptimistic && !isFailed && (
        <div className={`flex w-full ${(msg.reactions && Object.keys(msg.reactions).length > 0) || activeReactionMsgId === msg.id ? 'mt-1' : ''} ${isMe ? 'justify-end' : 'justify-start'}`}>
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

      {/* In-app PDF viewer (opened by tapping a PDF file card). Mounted only
          when open so the code-split chunk loads on demand. */}
      {showPdf && msg.file?.url && (
        <Suspense fallback={null}>
          <LazyPdfViewer
            isOpen={showPdf}
            onClose={() => setShowPdf(false)}
            pdfUrl={msg.file.url}
            totalPages={msg.file.pages || 1}
            title={msg.file.name}
          />
        </Suspense>
      )}
    </div>
  );
});
