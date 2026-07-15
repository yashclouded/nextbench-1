import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Send,
  Camera,
  Zap,
  Mic,
  Download,
  Flag,
  SmilePlus,
  ArrowDown,
  Play,
  Pause,
  CornerDownRight,
  Circle,
  AlertCircle,
  RefreshCw,
  Crown,
  Ban,
  Pin
} from 'lucide-react';

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { useLightbox } from '../../lib/LightboxContext';
import { uploadChatImageDetailed } from '../../lib/storage';
import { uploadVoiceMessage } from '../../lib/voiceMessage';
import { stopAllVoicePlayback } from '../../hooks/useVoicePlayer';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { notifyMentionedUsers } from '../../lib/mentions';

import MentionInput from '../ui/MentionInput';
import SmartImage from '../ui/SmartImage';
import VoiceRecordingControls from '../ui/VoiceRecordingControls';
import VoiceMessageBubble from '../ui/VoiceMessageBubble';
import MessageReactions from '../ui/MessageReactions';
import LinkifiedText from '../ui/LinkifiedText';
import { getOptimizedImageUrl } from '../../lib/utils';
import { useChatEngine, Message } from '../../hooks/useChatEngine';
import { MessageBubble } from './MessageBubble';
import { MessageContextMenu } from './MessageContextMenu';
import { ChatHeader } from './ChatHeader';

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
  clubMembers?: string[];
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
  clubMembers,
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

  const isClub = collectionPath === 'clubs';
  const canLoadMessages = !isClub || isMember;

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
  
  // Message Info state
  const [msgInfoId, setMsgInfoId] = useState<string | null>(null);
  const [voiceUploadProgress, setVoiceUploadProgress] = useState(0);
  const [voiceUploadError, setVoiceUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef(0);
  const prevScrollTopRef = useRef(0);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);
  // Throttle markAsRead to prevent write→read→render feedback loops in club chats
  const lastMarkAsReadRef = useRef<number>(0);
  // Track the last-seen message ID to distinguish new messages from loaded-older ones
  const lastMsgIdRef = useRef<string | undefined>(undefined);

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
    clubMembers,
    enabled: canLoadMessages,
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

  // Mark chat as read — throttled to at most once per 2 s to prevent write→read→render loops
  useEffect(() => {
    if (!isNearBottom || messages.length === 0) return;
    const now = Date.now();
    if (now - lastMarkAsReadRef.current < 2000) return;
    lastMarkAsReadRef.current = now;
    markAsRead();
  }, [messages.length, isNearBottom, markAsRead]);

  // Virtualizer removed for better typing performance and zero rendering lag

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

  // Scroll to bottom on genuinely new messages only (not when loading older history)
  const lastMessagesLengthRef = useRef(messages.length);
  useEffect(() => {
    const latestMsg = messages[messages.length - 1];
    const latestMsgId = latestMsg?.id;

    // Only scroll when a new message was appended at the bottom.
    // Comparing IDs prevents false-triggering when older messages are prepended
    // (load-older: length grows but latestMsgId stays the same).
    const isNewMessageAppended =
      messages.length > lastMessagesLengthRef.current && latestMsgId !== lastMsgIdRef.current;

    if (isNewMessageAppended) {
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
    lastMsgIdRef.current = latestMsgId;
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
    if ((!newMessage.trim() && !pendingImageFile) || isUploading || isBlocked || !isMember || !canPost) return;

    // Capture the message text before clearing it (for mention processing)
    const messageTextForMentions = newMessage.trim();

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

    // Send mention notifications for @tagged users in the message
    if (messageTextForMentions && user) {
      const chatType = collectionPath === 'clubs' ? 'club_chat' : 'dm';
      const link = collectionPath === 'clubs' ? `/club/${roomId}` : `/chat/${roomId}`;
      notifyMentionedUsers(
        messageTextForMentions,
        user.uid,
        userData?.name || 'Someone',
        { type: chatType, link }
      ).catch(err => console.warn('Failed to notify mentioned users in chat:', err));
    }
  };

  // Handle Enter key from MentionInput to submit form programmatically
  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }, []);

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
  const toggleMessageSelection = useCallback((msgId: string) => {
    setSelectedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  }, []);

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
      <ChatHeader
        collectionPath={collectionPath}
        roomId={roomId}
        title={title}
        subtitle={subtitle}
        avatar={avatar}
        otherUser={otherUser}
        otherPresence={otherPresence}
        recipientId={recipientId}
        onBack={onBack}
        showOptions={showOptions}
        setShowOptions={setShowOptions}
        isSelectMode={isSelectMode}
        selectedCount={selectedMessages.size}
        onBulkDelete={handleBulkDelete}
        onCancelSelect={() => { setIsSelectMode(false); setSelectedMessages(new Set()); }}
      />

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
            {isClub && !isMember ? (
              <>
                <p className="text-luxury-ink/20 font-serif italic text-lg mb-2">Join this club to view messages</p>
                <p className="text-luxury-ink/10 text-xs font-bold uppercase tracking-widest">Members can see the conversation here</p>
              </>
            ) : (
              <>
                <p className="text-luxury-ink/20 font-serif italic text-lg mb-2">Start the conversation</p>
                <p className="text-luxury-ink/10 text-xs font-bold uppercase tracking-widest">Messages are encrypted and secure</p>
              </>
            )}
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

        {/* Message List Container */}
        <div className="space-y-3.5">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              user={user}
              isSelectMode={isSelectMode}
              isSelected={selectedMessages.has(msg.id)}
              toggleMessageSelection={toggleMessageSelection}
              activeReactionMsgId={activeReactionMsgId}
              setActiveReactionMsgId={setActiveReactionMsgId}
              selectedMessageId={selectedMessageId}
              setSelectedMessageId={setSelectedMessageId}
              setMenuPosition={setMenuPosition}
              replyingTo={replyingTo}
              setReplyingTo={setReplyingTo}
              setDeleteConfirmMsgId={setDeleteConfirmMsgId}
              setDeleteEveryoneConfirmMsgId={setDeleteEveryoneConfirmMsgId}
              onPin={onPin}
              collectionPath={collectionPath}
              roomId={roomId}
              showLightbox={showLightbox}
              resendMessage={resendMessage}
              removeFailedMessage={removeFailedMessage}
              isAdmin={isAdmin}
            />
          ))}
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
            <form ref={formRef} onSubmit={handleSendMessage} className="flex items-center gap-2">
              <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isBlocked || !isMember || !canPost}
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
                  onKeyDown={handleInputKeyDown}
                  placeholder={
                    isBlocked
                      ? 'Messaging is disabled'
                      : !isMember
                      ? 'Join this club to post'
                      : !canPost
                      ? 'Only leads can post in this club'
                      : pendingImageFile
                      ? 'Add a caption...'
                      : 'Type your message...'
                  }
                  disabled={isBlocked || !isMember || !canPost}
                  className="w-full bg-transparent py-3.5 text-sm font-medium focus:outline-none text-luxury-ink placeholder:text-luxury-ink/30"
                />
              </div>

              {/* Mic audio recorders */}
              <button
                type="button"
                onClick={handleStartRecording}
                disabled={isUploading || isBlocked || !isMember || !canPost}
                className="p-3 bg-surface-card border border-luxury-ink/10 text-luxury-ink/40 hover:text-brand-teal rounded-full transition-all shrink-0 shadow-xs active:scale-95 disabled:opacity-30"
                title="Record audio"
              >
                <Mic size={18} />
              </button>

              <button
                type="submit"
                disabled={(!newMessage.trim() && !pendingImageFile) || isUploading || isBlocked || !isMember || !canPost}
                className="p-3 bg-brand-teal text-white rounded-full hover:opacity-90 transition-all shadow-xs disabled:opacity-30 disabled:cursor-not-allowed shrink-0 active:scale-95"
              >
                <Send size={18} />
              </button>
            </form>
          )}
        </AnimatePresence>
      </div>

      <MessageContextMenu
        messages={messages}
        user={user}
        isClub={isClub}
        isAdmin={isAdmin}
        onPin={onPin}
        selectedMessageId={selectedMessageId}
        setSelectedMessageId={setSelectedMessageId}
        menuPosition={menuPosition}
        setReplyingTo={setReplyingTo}
        setIsSelectMode={setIsSelectMode}
        toggleMessageSelection={toggleMessageSelection}
        msgInfoId={msgInfoId}
        setMsgInfoId={setMsgInfoId}
        deleteConfirmMsgId={deleteConfirmMsgId}
        setDeleteConfirmMsgId={setDeleteConfirmMsgId}
        deleteEveryoneConfirmMsgId={deleteEveryoneConfirmMsgId}
        setDeleteEveryoneConfirmMsgId={setDeleteEveryoneConfirmMsgId}
        deleteForMe={deleteForMe}
        deleteForEveryone={deleteForEveryone}
        onCopyText={handleCopyMessageText}
      />
    </div>
  );
}
