import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Zap, Mic, CornerDownRight, Film, Image as ImageIcon, Paperclip, FileText } from 'lucide-react';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { stopAllVoicePlayback } from '../../hooks/useVoicePlayer';
import { uploadChatImageDetailed } from '../../lib/storage';
import { uploadChatVideo, uploadChatVideoPoster, uploadChatFile } from '../../lib/storage';
import { prepareChatVideo, type PreparedChatVideo } from '../../lib/chatVideo';
import { formatFileSize } from '../../lib/formatFileSize';
import { uploadVoiceMessage } from '../../lib/voiceMessage';
import { notifyMentionedUsers } from '../../lib/mentions';
import { useToast } from '../../lib/ToastContext';
import MentionInput from '../ui/MentionInput';
import VoiceRecordingControls from '../ui/VoiceRecordingControls';
import { Message } from '../../hooks/useChatEngine';

const QUICK_MESSAGES = [
  'Is this still available?',
  'Can you meet on campus?',
  'What is the condition of the item?',
  'Would you take ₹XXX for it?',
  'Is the price negotiable?',
  'I\'m interested, can we chat?',
];

interface ComposerProps {
  collectionPath: 'chatRooms' | 'clubs';
  roomId: string;
  isBlocked: boolean;
  isMember: boolean;
  canPost: boolean;
  user: any;
  userData: any;
  replyingTo: Message | null;
  setReplyingTo: React.Dispatch<React.SetStateAction<Message | null>>;
  sendMessage: (text?: string, image?: any, replyTo?: Message | null) => void;
  sendVoiceMessage: (url: string, durationSec: number, size: number, mime: string) => Promise<void> | void;
  sendVideoMessage: (video: { url: string; poster?: string; w?: number; h?: number; duration?: number }) => Promise<void> | void;
  sendFileMessage: (file: { url: string; name: string; size?: number; mime?: string; pages?: number }, caption?: string) => Promise<void> | void;
  setTyping: (typing: boolean) => void;
}

export function Composer({
  collectionPath,
  roomId,
  isBlocked,
  isMember,
  canPost,
  user,
  userData,
  replyingTo,
  setReplyingTo,
  sendMessage,
  sendVoiceMessage,
  sendVideoMessage,
  sendFileMessage,
  setTyping,
}: ComposerProps) {
  const { showToast } = useToast();

  const [newMessage, setNewMessage] = useState('');
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);

  // Pending video (poster preview shown before upload)
  const [pendingVideo, setPendingVideo] = useState<PreparedChatVideo | null>(null);
  const [pendingVideoPoster, setPendingVideoPoster] = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);

  // Pending document/file (card preview shown before upload)
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [fileUploading, setFileUploading] = useState(false);
  const [fileUploadProgress, setFileUploadProgress] = useState(0);

  // Voice recording state
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [voiceUploadProgress, setVoiceUploadProgress] = useState(0);
  const [voiceUploadError, setVoiceUploadError] = useState<string | null>(null);

  const mediaInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

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

    // Clear the input locally (previously done via the chat engine's
    // onMessageSent callback, which only fired after server ack)
    setNewMessage('');
    setShowQuickReplies(false);
    setReplyingTo(null);
    if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
    setTyping(false); // sending stops the typing indicator

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

  // Emit typing on input; auto-stop after a short idle. The engine debounces
  // the actual writes (<=1 per 2s while active).
  const typingIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTextChange = useCallback((val: string) => {
    setNewMessage(val);
    if (val.trim().length > 0) {
      setTyping(true);
      if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
      typingIdleRef.current = setTimeout(() => setTyping(false), 3000);
    } else {
      setTyping(false);
      if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
    }
  }, [setTyping]);

  // Stop typing on unmount (leaving the room).
  useEffect(() => () => {
    if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
    setTyping(false);
  }, [setTyping]);

  // Accept an image File into the pending-image slot (shared by the media
  // picker, paste, and drag-drop). Returns false if rejected.
  const acceptImageFile = (file: File): boolean => {
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be less than 5MB', 'error');
      return false;
    }
    if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
    setPendingImageFile(file);
    setPendingImagePreview(URL.createObjectURL(file));
    return true;
  };

  // Media button: one picker for both photos and videos (WhatsApp-style).
  // Route the picked file to the image or video pending flow by MIME type.
  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (mediaInputRef.current) mediaInputRef.current.value = '';
    if (!file) return;
    if (file.type.startsWith('video/')) {
      await ingestVideoFile(file);
    } else if (file.type.startsWith('image/')) {
      acceptImageFile(file);
    } else {
      showToast('Please choose a photo or video', 'error');
    }
  };

  const clearPendingImage = () => {
    if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
    setPendingImageFile(null);
    setPendingImagePreview(null);
  };

  // Video: validate + capture poster; shared by the media picker and drag-drop.
  const ingestVideoFile = async (file: File) => {
    try {
      const prepared = await prepareChatVideo(file);
      if (pendingVideoPoster) URL.revokeObjectURL(pendingVideoPoster);
      setPendingVideo(prepared);
      setPendingVideoPoster(URL.createObjectURL(prepared.posterBlob));
    } catch (err: any) {
      showToast(err?.message || 'Could not process video', 'error');
    }
  };

  const clearPendingVideo = () => {
    if (pendingVideoPoster) URL.revokeObjectURL(pendingVideoPoster);
    setPendingVideo(null);
    setPendingVideoPoster(null);
  };

  // Files button: any file type (PDF, docs, zip, ...). 25MB cap.
  const acceptDocFile = (file: File): boolean => {
    if (file.size > 25 * 1024 * 1024) {
      showToast('File must be less than 25MB', 'error');
      return false;
    }
    setPendingFile(file);
    return true;
  };
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (docInputRef.current) docInputRef.current.value = '';
    if (file) acceptDocFile(file);
  };
  const clearPendingFile = () => setPendingFile(null);

  const handleSendFile = async () => {
    if (!pendingFile || fileUploading || isBlocked || !isMember || !canPost) return;
    setFileUploading(true);
    setFileUploadProgress(0);
    try {
      const { url, pages } = await uploadChatFile(pendingFile, roomId, (pct) => setFileUploadProgress(pct));
      await sendFileMessage({
        url,
        name: pendingFile.name,
        size: pendingFile.size,
        mime: pendingFile.type || undefined,
        pages,
      });
      clearPendingFile();
    } catch (err: any) {
      showToast(err?.message || 'Failed to send file', 'error');
    } finally {
      setFileUploading(false);
    }
  };

  const handleSendVideo = async () => {
    if (!pendingVideo || videoUploading || isBlocked || !isMember || !canPost) return;
    setVideoUploading(true);
    setVideoUploadProgress(0);
    try {
      const [videoUrl, posterUrl] = await Promise.all([
        uploadChatVideo(pendingVideo.file, roomId, (pct) => setVideoUploadProgress(pct)),
        uploadChatVideoPoster(pendingVideo.posterBlob, roomId),
      ]);
      await sendVideoMessage({
        url: videoUrl,
        poster: posterUrl,
        w: pendingVideo.width,
        h: pendingVideo.height,
        duration: Math.round(pendingVideo.durationMs / 1000),
      });
      clearPendingVideo();
    } catch (err: any) {
      showToast(err?.message || 'Failed to send video', 'error');
    } finally {
      setVideoUploading(false);
    }
  };

  // Revoke pending object URLs on unmount.
  useEffect(() => () => {
    if (pendingVideoPoster) URL.revokeObjectURL(pendingVideoPoster);
    if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
  }, [pendingVideoPoster, pendingImagePreview]);

  // ── Paste + drag-drop ──────────────────────────────────
  const [dragActive, setDragActive] = useState(false);
  const canAttach = !isBlocked && isMember && canPost;

  // Route an arbitrary dropped/pasted file to the right pending slot by type.
  const ingestFile = (file: File) => {
    if (!canAttach) return;
    if (file.type.startsWith('image/')) acceptImageFile(file);
    else if (file.type.startsWith('video/')) ingestVideoFile(file);
    else acceptDocFile(file);
  };

  // Paste an image from the clipboard (screenshots, copied images).
  const handlePaste = (e: React.ClipboardEvent) => {
    if (!canAttach) return;
    const items = Array.from(e.clipboardData?.items || []);
    const imageItem = items.find((it) => it.kind === 'file' && it.type.startsWith('image/'));
    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) {
        e.preventDefault();
        acceptImageFile(file);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (!canAttach) return;
    const file = e.dataTransfer?.files?.[0];
    if (file) ingestFile(file);
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (!canAttach) return;
    e.preventDefault();
    if (!dragActive) setDragActive(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear when leaving the composer, not when moving over a child.
    if (e.currentTarget === e.target) setDragActive(false);
  };

  return (
    <div
      className="p-4 pb-safe-4 border-t border-luxury-ink/5 bg-surface-base shrink-0 z-30 relative"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Drag-and-drop overlay */}
      {dragActive && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-brand-teal/10 border-2 border-dashed border-brand-teal rounded-2xl m-1 pointer-events-none">
          <p className="text-sm font-bold text-brand-teal">Drop to attach</p>
        </div>
      )}
      {/* Reply Preview Bar */}
      {replyingTo && (
        <div className="mb-3 bg-surface-card border border-luxury-ink/5 rounded-2xl px-4 py-3 flex items-start justify-between shadow-xs relative">
          <div className="flex-1 overflow-hidden">
            <div className="text-[10px] font-bold text-brand-teal uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <CornerDownRight size={12} />
              Replying to {replyingTo.senderId === user?.uid ? 'yourself' : replyingTo.senderName || 'user'}
            </div>
            <p className="text-xs text-luxury-ink/60 truncate leading-relaxed">
              {replyingTo.text || (
                replyingTo.type === 'video' ? '📹 Video'
                : replyingTo.type === 'file' ? `📎 ${replyingTo.file?.name || 'File'}`
                : replyingTo.type === 'voice' ? '🎤 Voice message'
                : '📷 Image'
              )}
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
              onClick={() => {
                sendMessage(msg);
                setNewMessage('');
                setShowQuickReplies(false);
                setReplyingTo(null);
              }}
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

      {/* Pending Video Preview */}
      {pendingVideoPoster && (
        <div className="mb-3 flex items-center gap-3 bg-surface-card border border-luxury-ink/10 rounded-2xl px-3 py-2 shadow-xs">
          <div className="relative shrink-0">
            <img src={pendingVideoPoster} alt="Video preview" className="h-16 w-16 object-cover rounded-xl border border-luxury-ink/10" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-black/50 rounded-full p-1"><Film size={14} className="text-white" /></div>
            </div>
            {!videoUploading && (
              <button
                type="button"
                onClick={clearPendingVideo}
                className="absolute -top-1.5 -right-1.5 bg-luxury-ink text-white rounded-full p-0.5 hover:bg-red-500 transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <div className="flex-1 min-w-0">
            {videoUploading ? (
              <>
                <p className="text-xs font-bold text-luxury-ink/50 mb-1">Sending video... {videoUploadProgress}%</p>
                <div className="w-full bg-surface-soft h-1 rounded-full overflow-hidden">
                  <div className="bg-brand-teal h-full transition-all duration-100" style={{ width: `${videoUploadProgress}%` }} />
                </div>
              </>
            ) : (
              <p className="text-xs text-luxury-ink/40 font-medium">
                Video ready · {Math.round((pendingVideo?.durationMs || 0) / 1000)}s
              </p>
            )}
          </div>
          {!videoUploading && (
            <button
              type="button"
              onClick={handleSendVideo}
              disabled={isBlocked || !isMember || !canPost}
              className="p-2.5 bg-brand-teal text-white rounded-full hover:opacity-90 transition-all shadow-xs disabled:opacity-30 shrink-0 active:scale-95"
              title="Send video"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      )}

      {/* Pending File Preview */}
      {pendingFile && (
        <div className="mb-3 flex items-center gap-3 bg-surface-card border border-luxury-ink/10 rounded-2xl px-3 py-2 shadow-xs">
          <div className="relative shrink-0">
            <div className="h-16 w-16 rounded-xl border border-luxury-ink/10 bg-surface-soft flex items-center justify-center">
              <FileText size={24} className="text-brand-teal" />
            </div>
            {!fileUploading && (
              <button
                type="button"
                onClick={clearPendingFile}
                className="absolute -top-1.5 -right-1.5 bg-luxury-ink text-white rounded-full p-0.5 hover:bg-red-500 transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-luxury-ink/70 truncate">{pendingFile.name}</p>
            {fileUploading ? (
              <>
                <p className="text-[11px] font-bold text-luxury-ink/50 mb-1 mt-0.5">Sending... {fileUploadProgress}%</p>
                <div className="w-full bg-surface-soft h-1 rounded-full overflow-hidden">
                  <div className="bg-brand-teal h-full transition-all duration-100" style={{ width: `${fileUploadProgress}%` }} />
                </div>
              </>
            ) : (
              <p className="text-[11px] text-luxury-ink/40 font-medium mt-0.5">{formatFileSize(pendingFile.size)}</p>
            )}
          </div>
          {!fileUploading && (
            <button
              type="button"
              onClick={handleSendFile}
              disabled={isBlocked || !isMember || !canPost}
              className="p-2.5 bg-brand-teal text-white rounded-full hover:opacity-90 transition-all shadow-xs disabled:opacity-30 shrink-0 active:scale-95"
              title="Send file"
            >
              <Send size={16} />
            </button>
          )}
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
            <input type="file" ref={mediaInputRef} onChange={handleMediaUpload} accept="image/*,video/*" className="hidden" />
            <input type="file" ref={docInputRef} onChange={handleFileUpload} className="hidden" />

            {/* Media button — photos and videos (WhatsApp-style gallery) */}
            <button
              type="button"
              onClick={() => mediaInputRef.current?.click()}
              disabled={isUploading || isBlocked || !isMember || !canPost || !!pendingVideo}
              className="p-3 bg-surface-card border border-luxury-ink/10 text-brand-teal hover:bg-brand-teal/10 rounded-full transition-all shrink-0 shadow-xs active:scale-95 disabled:opacity-50"
              title="Photo or video"
            >
              {isUploading ? (
                <div className="w-5 h-5 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
              ) : (
                <ImageIcon size={18} />
              )}
            </button>

            {/* Files button — PDF, docs, any file type */}
            <button
              type="button"
              onClick={() => docInputRef.current?.click()}
              disabled={isBlocked || !isMember || !canPost || !!pendingFile}
              className="p-3 bg-surface-card border border-luxury-ink/10 text-brand-teal hover:bg-brand-teal/10 rounded-full transition-all shrink-0 shadow-xs active:scale-95 disabled:opacity-50"
              title="Attach a file"
            >
              <Paperclip size={18} />
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
                onChange={handleTextChange}
                onKeyDown={handleInputKeyDown}
                onPaste={handlePaste}
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
                className="w-full bg-transparent py-3.5 text-base md:text-sm font-medium focus:outline-none text-luxury-ink placeholder:text-luxury-ink/30"
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
  );
}
