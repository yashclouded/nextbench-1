import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Pin } from 'lucide-react';

import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { useLightbox } from '../../lib/LightboxContext';

import { useChatEngine, Message } from '../../hooks/useChatEngine';
import { MessageList } from './MessageList';
import { MessageContextMenu } from './MessageContextMenu';
import { ChatHeader } from './ChatHeader';
import { Composer } from './Composer';
import { ForwardModal } from './ForwardModal';

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

  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [deleteConfirmMsgId, setDeleteConfirmMsgId] = useState<string | null>(null);
  const [deleteEveryoneConfirmMsgId, setDeleteEveryoneConfirmMsgId] = useState<string | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [menuPosition, setMenuPosition] = useState<{ top?: number; bottom?: number; left?: number; right?: number } | null>(null);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);

  // Message Info state
  const [msgInfoId, setMsgInfoId] = useState<string | null>(null);

  // Forward modal — holds the message ids being forwarded.
  const [forwardingMsgIds, setForwardingMsgIds] = useState<string[]>([]);
  // Bulk delete dialog for the in-chat message multi-select.
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

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
    deleteForEveryoneBulk,
    sendVoiceMessage,
    sendVideoMessage,
    forwardMessage,
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
  });

  // Selection & deletion handlers
  const toggleMessageSelection = useCallback((msgId: string) => {
    setSelectedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  }, []);

  const handleBulkDelete = () => {
    if (selectedMessages.size === 0) return;
    setShowBulkDeleteDialog(true);
  };

  // Every selected message is the current user's own → delete-for-everyone is offered.
  const allSelectedAreOwn =
    selectedMessages.size > 0 &&
    Array.from(selectedMessages).every((id) => {
      const m = messages.find((x) => x.id === id);
      return m && m.senderId === user?.uid;
    });

  const runBulkDeleteForMe = async () => {
    setShowBulkDeleteDialog(false);
    try {
      await Promise.all(Array.from(selectedMessages).map((id) => deleteForMe(id)));
      showToast('Messages deleted', 'success');
      setSelectedMessages(new Set());
      setIsSelectMode(false);
    } catch {
      showToast('Failed to delete messages', 'error');
    }
  };

  const runBulkDeleteForEveryone = async () => {
    setShowBulkDeleteDialog(false);
    try {
      await deleteForEveryoneBulk(Array.from(selectedMessages));
      showToast('Messages deleted for everyone', 'success');
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

      {/* Messages Scroll Area + Jump-to-Bottom FAB */}
      <MessageList
        messages={messages}
        loading={loading}
        hasMore={hasMore}
        loadOlder={loadOlder}
        markAsRead={markAsRead}
        user={user}
        isClub={isClub}
        isMember={isMember}
        isAdmin={isAdmin}
        collectionPath={collectionPath}
        roomId={roomId}
        onPin={onPin}
        showLightbox={showLightbox}
        resendMessage={resendMessage}
        removeFailedMessage={removeFailedMessage}
        isSelectMode={isSelectMode}
        selectedMessages={selectedMessages}
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
      />

      {/* Input Composer Footer Panel */}
      <Composer
        collectionPath={collectionPath}
        roomId={roomId}
        isBlocked={isBlocked}
        isMember={isMember}
        canPost={canPost}
        user={user}
        userData={userData}
        replyingTo={replyingTo}
        setReplyingTo={setReplyingTo}
        sendMessage={sendMessage}
        sendVoiceMessage={sendVoiceMessage}
        sendVideoMessage={sendVideoMessage}
      />

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
        onForward={(msgId) => setForwardingMsgIds([msgId])}
      />

      <ForwardModal
        isOpen={forwardingMsgIds.length > 0}
        sources={messages.filter((m) => forwardingMsgIds.includes(m.id))}
        onForward={forwardMessage}
        onClose={() => setForwardingMsgIds([])}
      />

      {/* Bulk delete dialog — offers delete-for-everyone when all selected are own */}
      <AnimatePresence>
        {showBulkDeleteDialog && (
          <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs" onClick={() => setShowBulkDeleteDialog(false)}>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface-card rounded-3xl w-full max-w-sm p-6 shadow-2xl border border-luxury-ink/5"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-luxury-ink mb-2">Delete {selectedMessages.size} message{selectedMessages.size === 1 ? '' : 's'}</h3>
              <p className="text-xs text-luxury-ink/65 mb-6">
                {allSelectedAreOwn
                  ? 'Delete just for you, or for everyone in this chat?'
                  : 'These messages will be deleted for you. Other members will still see them.'}
              </p>
              <div className="flex flex-col gap-2">
                {allSelectedAreOwn && (
                  <button onClick={runBulkDeleteForEveryone} className="w-full py-2.5 bg-red-500 text-white rounded-full text-xs font-bold hover:bg-red-600 shadow-lg transition-colors">
                    Delete for everyone
                  </button>
                )}
                <button onClick={runBulkDeleteForMe} className="w-full py-2.5 bg-surface-soft text-luxury-ink rounded-full text-xs font-bold hover:bg-luxury-ink/5 transition-colors">
                  Delete for me
                </button>
                <button onClick={() => setShowBulkDeleteDialog(false)} className="w-full py-2.5 rounded-full text-xs font-bold text-luxury-ink/50 hover:bg-surface-soft transition-colors">
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
