import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Send,
  Camera,
  Zap,
  Mic,
  Trash2,
  Download,
  Flag,
  SmilePlus,
  Reply,
  ArrowDown,
  Play,
  Pause,
  CornerDownRight,
  CheckCircle2,
  Circle,
  AlertCircle,
  RefreshCw,
  MoreVertical,
  ChevronLeft,
  Crown,
  Ban,
  ShieldCheck,
  Info,
  Pin
} from 'lucide-react';

import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { useLightbox } from '../../lib/LightboxContext';
import { uploadChatImageDetailed } from '../../lib/storage';
import { uploadVoiceMessage } from '../../lib/voiceMessage';
import { stopAllVoicePlayback } from '../../hooks/useVoicePlayer';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';

import MentionInput from '../ui/MentionInput';
import Avatar from '../ui/Avatar';
import SmartImage from '../ui/SmartImage';
import VoiceRecordingControls from '../ui/VoiceRecordingControls';
import VoiceMessageBubble from '../ui/VoiceMessageBubble';
import MessageReactions from '../ui/MessageReactions';
import LinkifiedText from '../ui/LinkifiedText';
import { getOptimizedImageUrl } from '../../lib/utils';
import { useChatEngine, Message } from '../../hooks/useChatEngine';

const QUICK_MESSAGES = [
  'Is this still available?',
  'Can you meet on campus?',
  'What is the condition of the item?',
  'Would you take ₹XXX for it?',
  'Is the price negotiable?',
  'I\'m interested, can we chat?',
];

interface ChatViewProps {
  collectionPath: 'chatRooms' | 'clubs';
  roomId: string;
  title: string;
  subtitle?: string;
  avatar?: string | null;
  isBlocked?: boolean;
  isMember?: boolean;
  isAdmin?: boolean;
  canPost?: boolean;
  otherUser?: any;
  otherPresence?: any;
  onBack?: () => void;
  // Options
  showOptions?: boolean;
  setShowOptions?: (show: boolean) => void;
  showReport?: boolean;
  setShowReport?: (show: boolean) => void;
  recipientId?: string;
  pinnedMessageText?: string | null;
  onUnpin?: () => void;
  onPin?: (msgId: string, text?: string) => void;
}

export default function ChatView({
  collectionPath,
  roomId,
  title,
  subtitle,
  avatar,
  isBlocked = false,
  isMember = true,
  isAdmin = false,
  canPost = true,
  otherUser,
  otherPresence,
  onBack,
  showOptions = false,
  setShowOptions,
  showReport = false,
  setShowReport,
  recipientId,
  pinnedMessageText,
  onUnpin,
  onPin,
}: ChatViewProps) {
  const { user, userData } = useAuth();
  const { showToast } = useToast();
  const { showLightbox } = useLightbox();

  const [newMessage, setNewMessage] = useState('');
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [deleteConfirmMsgId, setDeleteConfirmMsgId] = useState<string | null>(null);
  const [deleteEveryoneConfirmMsgId, setDeleteEveryoneConfirmMsgId] = useState<string | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [menuPosition, setMenuPosition] = useState<{ top?: number; bottom?: number; left?: number; right?: number } | null>(null);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);

  // Voice recording state
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [voiceUploadProgress, setVoiceUploadProgress] = useState(0);
  const [voiceUploadError, setVoiceUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef(0);
  const prevScrollTopRef = useRef(0);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);

  const handleMessageSentCallback = useCallback(() => {
    setNewMessage('');
    setReplyingTo(null);
    setShowQuickReplies(false);
  }, []);

  const {
    messages,
    loading,
    hasMore,
    loadOlder,
    sendMessage,
    resendMessage,
    removeFailedMessage,
    deleteForMe,
    deleteForEveryone,
    sendVoiceMessage,
    markAsRead,
  } = useChatEngine({
    collectionPath,
    roomId,
    user,
    userData,
    recipientId,
    isBlocked,
    onMessageSent: handleMessageSentCallback,
  });

  const {
    isRecording,
    duration: recordingDuration,
    audioBlob,
    error: recorderError,
    startRecording,
    stopRecording,
    cancelRecording,
    clearBlob,
  } = useVoiceRecorder();

  // Mark chat as read on mount or when messages change
  useEffect(() => {
    if (isNearBottom && messages.length > 0) {
      markAsRead();
    }
  }, [messages.length, isNearBottom, markAsRead]);

  // Virtualizer setup
  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 10,
  });

  // Track scroll position
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const scrollOffsetFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    setIsNearBottom(scrollOffsetFromBottom <= 80);

    if (scrollOffsetFromBottom <= 80) {
      setNewMessageCount(0);
    }

    // Trigger loadOlder
    if (target.scrollTop <= 80 && hasMore && !loading) {
      prevScrollHeightRef.current = target.scrollHeight;
      prevScrollTopRef.current = target.scrollTop;
      loadOlder();
    }
  };

  // Adjust scroll when history loads
  useEffect(() => {
    if (parentRef.current && prevScrollHeightRef.current > 0) {
      const scrollDiff = parentRef.current.scrollHeight - prevScrollHeightRef.current;
      if (scrollDiff > 0) {
        parentRef.current.scrollTop = prevScrollTopRef.current + scrollDiff;
      }
      prevScrollHeightRef.current = 0;
    }
  }, [messages.length]);

  // Scroll to bottom on new message
  const lastMessagesLengthRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > lastMessagesLengthRef.current) {
      const latestMsg = messages[messages.length - 1];
      const isMine = latestMsg?.senderId === user?.uid;

      if (isNearBottom || isMine) {
        setTimeout(() => {
          if (parentRef.current) {
            parentRef.current.scrollTop = parentRef.current.scrollHeight;
          }
        }, 50);
        setNewMessageCount(0);
      } else {
        setNewMessageCount((prev) => prev + 1);
      }
    }
    lastMessagesLengthRef.current = messages.length;
  }, [messages, user?.uid, isNearBottom]);

  // Voice recording handlers
  const handleStartRecording = async () => {
    if (isBlocked || !isMember || !canPost) return;
    try {
      stopAllVoicePlayback();
      setVoiceUploadError(null);
      await startRecording();
    } catch {
      showToast('Could not start recording. Please check permissions.', 'error');
    }
  };

  const handleStopRecording = () => {
    stopRecording();
  };

  const handleCancelRecording = () => {
    cancelRecording();
    clearBlob();
  };

  // Process and send recorded audio
  useEffect(() => {
    if (!audioBlob || isRecording) return;

    const processVoice = async () => {
      setVoiceUploading(true);
      setVoiceUploadProgress(0);
      setVoiceUploadError(null);

      try {
        const { downloadUrl } = await uploadVoiceMessage(
          audioBlob,
          roomId,
          (pct) => setVoiceUploadProgress(pct)
        );

        const durationSec = Math.round(recordingDuration);
        await sendVoiceMessage(downloadUrl, durationSec, audioBlob.size, audioBlob.type || 'audio/webm');
        setVoiceUploading(false);
        clearBlob();
      } catch (err: any) {
        console.error('Failed to send voice message:', err);
        setVoiceUploadError(err.message || 'Failed to upload audio.');
        setVoiceUploading(false);
      }
    };

    processVoice();
  }, [audioBlob, isRecording, roomId, sendVoiceMessage, clearBlob, recordingDuration]);

  // Send textual/image message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !pendingImageFile) || isUploading || isBlocked || !isMember) return;

    let imageObj: any = undefined;
    if (pendingImageFile) {
      setIsUploading(true);
      try {
        const res = await uploadChatImageDetailed(pendingImageFile, roomId);
        imageObj = { url: res.url, w: res.width, h: res.height };
      } catch (err) {
        showToast('Image upload failed', 'error');
        setIsUploading(false);
        return;
      }
    }

    setIsUploading(false);
    setPendingImageFile(null);
    if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
    setPendingImagePreview(null);

    sendMessage(newMessage || undefined, imageObj || undefined, replyingTo);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be less than 5MB', 'error');
      return;
    }
    setPendingImageFile(file);
    setPendingImagePreview(URL.createObjectURL(file));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearPendingImage = () => {
    if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
    setPendingImageFile(null);
    setPendingImagePreview(null);
  };

  // Selection & deletion handlers
  const toggleMessageSelection = (msgId: string) => {
    setSelectedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedMessages.size === 0) return;
    if (!confirm(`Delete ${selectedMessages.size} messages?`)) return;

    try {
      await Promise.all(Array.from(selectedMessages).map((id) => deleteForMe(id)));
      showToast('Messages deleted', 'success');
      setSelectedMessages(new Set());
      setIsSelectMode(false);
    } catch {
      showToast('Failed to delete messages', 'error');
    }
  };

  const handleCopyMessageText = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard', 'success');
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-base relative">
      {/* Header */}
      <div className="px-6 py-4 border-b border-luxury-ink/5 flex items-center justify-between bg-surface-base/80 backdrop-blur-md z-30 shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          {onBack && (
            <button onClick={onBack} className="p-2 text-luxury-ink/60 hover:text-luxury-ink hover:bg-surface-soft rounded-full transition-colors active:scale-90" title="Back">
              <ChevronLeft size={20} />
            </button>
          )}
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
              <p className="text-[10px] font-semibold text-luxury-ink/40">
                {otherPresence?.online ? (
                  <span className="text-brand-teal flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-brand-teal" /> Active Now</span>
                ) : 'Offline'}
              </p>
            )}
            {collectionPath === 'clubs' && subtitle && (
              <p className="text-[10px] text-luxury-ink/40 truncate">{subtitle}</p>
            )}
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          {isSelectMode ? (
            <div className="flex items-center gap-2">
              <button onClick={handleBulkDelete} disabled={selectedMessages.size === 0} className="p-2 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 rounded-full" title="Delete selected">
                <Trash2 size={18} />
              </button>
              <button onClick={() => { setIsSelectMode(false); setSelectedMessages(new Set()); }} className="text-xs font-bold text-luxury-ink/50 hover:text-luxury-ink px-3 py-1.5 rounded-full hover:bg-surface-soft transition-all">
                Cancel
              </button>
            </div>
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

      {/* Pinned Message Banner */}
      {pinnedMessageText && (
        <div className="bg-surface-soft border-b px-6 py-2.5 flex items-center justify-between z-10 relative" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-3 overflow-hidden">
            <Pin size={14} className="text-brand-teal shrink-0" />
            <div className="text-xs font-semibold text-luxury-ink/75 truncate">{pinnedMessageText}</div>
          </div>
          {onUnpin && (
            <button onClick={onUnpin} className="p-1 hover:bg-surface-base rounded-full transition-colors shrink-0 ml-2 cursor-pointer">
              <X size={14} className="text-luxury-ink/40" />
            </button>
          )}
        </div>
      )}

      {/* Messages Scroll Area */}
      <div
        ref={parentRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-6"
      >
        {messages.length === 0 && !loading && (
          <div className="text-center py-20">
            <p className="text-luxury-ink/20 font-serif italic text-lg mb-2">Start the conversation</p>
            <p className="text-luxury-ink/10 text-xs font-bold uppercase tracking-widest">Messages are encrypted and secure</p>
          </div>
        )}

        {loading && messages.length === 0 && (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                <div className={`w-2/3 h-12 bg-surface-soft rounded-2xl animate-pulse`} />
              </div>
            ))}
          </div>
        )}

        {/* Virtualized Messages Container */}
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const msg = messages[virtualRow.index];
            if (!msg || msg.deletedFor?.includes(user?.uid || '')) return null;

            const isMe = msg.senderId === user?.uid;
            const isDeleted = msg.isDeletedForEveryone;
            const isSelected = selectedMessages.has(msg.id);
            const isOptimistic = msg.status === 'pending';
            const isFailed = msg.status === 'failed';

            return (
              <div
                key={msg.id}
                ref={rowVirtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} pb-2 relative group`}
              >
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
                        setActiveReactionMsgId((prev) => (prev === msg.id ? null : msg.id));
                        setSelectedMessageId(null);
                        setMenuPosition(null);
                      }}
                      className={`opacity-0 group-hover:opacity-100 p-1.5 rounded-full hover:bg-surface-soft text-luxury-ink/30 hover:text-brand-teal transition-all shrink-0 ${isMe ? 'order-first' : 'order-last'}`}
                      title="React"
                    >
                      <SmilePlus size={15} />
                    </button>
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
                          <div className={`relative overflow-hidden bg-black/5 rounded-lg -mx-4 -mt-3 w-[280px] max-w-full ${msg.text ? 'mb-2' : '-mb-3'}`}>
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
          })}
        </div>
      </div>

      {/* Floating Scroll Count Button */}
      {newMessageCount > 0 && (
        <button
          onClick={() => {
            if (parentRef.current) {
              parentRef.current.scrollTop = parentRef.current.scrollHeight;
            }
            setNewMessageCount(0);
          }}
          className="absolute bottom-24 right-6 z-30 flex items-center gap-2 bg-luxury-ink text-surface-base px-4 py-2.5 rounded-full shadow-2xl hover:bg-brand-teal transition-all text-xs font-bold uppercase tracking-wider animate-bounce"
        >
          <ArrowDown size={14} />
          {newMessageCount} new message{newMessageCount > 1 ? 's' : ''}
        </button>
      )}

      {/* Context Action Menu Overlay */}
      <AnimatePresence>
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
                    {targetMsg.text && (
                      <button
                        onClick={() => {
                          handleCopyMessageText(targetMsg.text!);
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
      </AnimatePresence>

      {/* Input Composer Footer Panel */}
      <div className="p-4 border-t border-luxury-ink/5 bg-surface-base shrink-0 z-30">
        {/* Reply Preview Bar */}
        {replyingTo && (
          <div className="mb-3 bg-surface-card border border-luxury-ink/5 rounded-2xl px-4 py-3 flex items-start justify-between shadow-xs relative">
            <div className="flex-1 overflow-hidden">
              <div className="text-[10px] font-bold text-brand-teal uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <CornerDownRight size={12} />
                Replying to {replyingTo.senderId === user?.uid ? 'yourself' : replyingTo.senderName || 'user'}
              </div>
              <p className="text-xs text-luxury-ink/60 truncate leading-relaxed">
                {replyingTo.text || '📷 Image attachment'}
              </p>
            </div>
            <button onClick={() => setReplyingTo(null)} className="p-1 text-luxury-ink/40 hover:text-luxury-ink rounded-full ml-3 transition-colors">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Quick Replies Carousel (DMs only) */}
        {showQuickReplies && collectionPath === 'chatRooms' && !isBlocked && (
          <div className="flex gap-2 mb-3 overflow-x-auto no-scrollbar py-1">
            {QUICK_MESSAGES.map((msg, i) => (
              <button
                key={i}
                onClick={() => sendMessage(msg)}
                className="whitespace-nowrap px-4 py-2 bg-surface-card border border-luxury-ink/10 rounded-full text-xs font-semibold text-luxury-ink/60 hover:bg-brand-teal/5 hover:text-brand-teal hover:border-brand-teal/20 transition-all shadow-xs"
              >
                {msg}
              </button>
            ))}
          </div>
        )}

        {/* Attachment Image Preview */}
        {pendingImagePreview && (
          <div className="mb-3 flex items-center gap-3 bg-surface-card border border-luxury-ink/10 rounded-2xl px-3 py-2 shadow-xs">
            <div className="relative shrink-0">
              <img src={pendingImagePreview} alt="Pending Preview" className="h-16 w-16 object-cover rounded-xl border border-luxury-ink/10" />
              <button
                type="button"
                onClick={clearPendingImage}
                className="absolute -top-1.5 -right-1.5 bg-luxury-ink text-white rounded-full p-0.5 hover:bg-red-500 transition-colors"
              >
                <X size={12} />
              </button>
            </div>
            <p className="text-xs text-luxury-ink/40 font-medium">
              {pendingImageFile?.name || 'Attachment ready'} · Add caption below
            </p>
          </div>
        )}

        {/* Action Panel Composers */}
        <AnimatePresence mode="wait">
          {isRecording ? (
            <VoiceRecordingControls
              key="recording"
              duration={recordingDuration}
              onStop={handleStopRecording}
              onCancel={handleCancelRecording}
            />
          ) : voiceUploading ? (
            <motion.div
              key="voice-uploading"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="flex items-center gap-3 px-4 py-3.5 bg-surface-card rounded-2xl border border-luxury-ink/5 shadow-xs"
            >
              <div className="w-5 h-5 border-2 border-brand-teal border-t-transparent rounded-full animate-spin shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-bold text-luxury-ink/50">Sending voice message... {voiceUploadProgress}%</p>
                <div className="w-full bg-surface-soft h-1 rounded-full overflow-hidden mt-1.5">
                  <div className="bg-brand-teal h-full transition-all duration-100" style={{ width: `${voiceUploadProgress}%` }} />
                </div>
              </div>
            </motion.div>
          ) : voiceUploadError ? (
            <motion.div
              key="voice-error"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="flex items-center justify-between gap-3 px-4 py-3 bg-red-50 dark:bg-red-950/15 rounded-2xl border border-red-200 dark:border-red-900/30 shadow-xs"
            >
              <p className="text-xs font-bold text-red-500">Failed to send voice message</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setVoiceUploadError(null)} className="text-xs font-bold text-luxury-ink/40 hover:text-luxury-ink transition-colors">Dismiss</button>
                <button onClick={handleStartRecording} className="text-xs font-bold text-brand-teal hover:underline">Retry</button>
              </div>
            </motion.div>
          ) : (
            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isBlocked || !isMember}
                className="p-3 bg-surface-card border border-luxury-ink/10 text-brand-teal hover:bg-brand-teal/10 rounded-full transition-all shrink-0 shadow-xs active:scale-95 disabled:opacity-50"
                title="Send image"
              >
                {isUploading ? (
                  <div className="w-5 h-5 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Camera size={18} />
                )}
              </button>

              <div className="flex-1 flex items-center gap-1.5 bg-surface-card rounded-full border border-luxury-ink/10 shadow-xs px-3.5 relative">
                {collectionPath === 'chatRooms' && (
                  <button
                    type="button"
                    onClick={() => setShowQuickReplies(!showQuickReplies)}
                    className={`p-1.5 rounded-full transition-all shrink-0 ${showQuickReplies ? 'text-brand-teal' : 'text-luxury-ink/30 hover:text-brand-teal'}`}
                    title="Quick replies"
                  >
                    <Zap size={15} fill={showQuickReplies ? 'currentColor' : 'none'} />
                  </button>
                )}

                <MentionInput
                  value={newMessage}
                  onChange={setNewMessage}
                  placeholder={
                    isBlocked
                      ? 'Messaging is disabled'
                      : !isMember
                      ? 'Join this club to post'
                      : pendingImageFile
                      ? 'Add a caption...'
                      : 'Type your message...'
                  }
                  disabled={isBlocked || !isMember}
                  className="w-full bg-transparent py-3.5 text-sm font-medium focus:outline-none text-luxury-ink placeholder:text-luxury-ink/30"
                />
              </div>

              {/* Mic audio recorders */}
              <button
                type="button"
                onClick={handleStartRecording}
                disabled={isUploading || isBlocked || !isMember}
                className="p-3 bg-surface-card border border-luxury-ink/10 text-luxury-ink/40 hover:text-brand-teal rounded-full transition-all shrink-0 shadow-xs active:scale-95 disabled:opacity-30"
                title="Record audio"
              >
                <Mic size={18} />
              </button>

              <button
                type="submit"
                disabled={(!newMessage.trim() && !pendingImageFile) || isUploading || isBlocked || !isMember}
                className="p-3 bg-brand-teal text-white rounded-full hover:opacity-90 transition-all shadow-xs disabled:opacity-30 disabled:cursor-not-allowed shrink-0 active:scale-95"
              >
                <Send size={18} />
              </button>
            </form>
          )}
        </AnimatePresence>
      </div>

      {/* Delete Confirmation Dialog Modals */}
      <AnimatePresence>
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
      </AnimatePresence>
    </div>
  );
}
