import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Send, ArrowLeft, MoreVertical, ShieldCheck, User, Package, Flag, Camera, X, CornerDownRight, Pin, CheckCircle2, Circle, Copy, Trash2, Download } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDoc, getDocs, where, writeBatch, arrayUnion, arrayRemove, limit, deleteField } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { useToast } from '../../lib/ToastContext';
import { uploadChatImage } from '../../lib/storage';
import { getOptimizedImageUrl } from '../../lib/utils';
import { createNotification, isChatMessageNotification } from '../../lib/notifications';
import { useBlockedIds, useBlockedByIds } from '../../lib/blocks';
import ReportModal from '../../components/ui/ReportModal';
import MessageText from '../../components/ui/MessageText';
import MessageReactions from '../../components/ui/MessageReactions';
import { useUserPresence } from '../../lib/presence';

interface Message {
  id: string;
  senderId: string;
  text?: string;
  image?: string;
  createdAt: any;
  deletedFor?: string[];
  isDeletedForEveryone?: boolean;
  replyToId?: string;
  replyToText?: string;
  reactions?: Record<string, string[]>;
  sharedPost?: {
    id: string;
    title: string;
    description: string;
    image?: string;
    authorName: string;
  };
}

interface ChatRoomData {
  participants: string[];
  productId?: string;
  productTitle?: string;
  type?: string;
  pinnedMessageId?: string;
  pinnedMessageText?: string;
  unreadBy?: string[];
  status?: string;
  requestedBy?: string;
}

const QUICK_MESSAGES = [
  'Is this still available?',
  'Can we meet today?',
  'Can you do a lower price?',
  "I'll take it!",
];

interface ChatRoomProps {
  panelMode?: boolean;
  onBack?: () => void;
  roomIdOverride?: string;
}

function profileUrl(u: { id?: string; username?: string } | null | undefined, fallbackId?: string): string {
  if (u?.username) return `/u/${u.username}`;
  const id = u?.id || fallbackId || '';
  return `/profile/${id}`;
}

export default function ChatRoom({ panelMode, onBack, roomIdOverride }: ChatRoomProps = {}) {
  const params = useParams<{ roomId: string }>();
  const roomId = roomIdOverride || params.roomId;
  const { user, userData } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [roomData, setRoomData] = useState<ChatRoomData | null>(location.state?.roomData || null);
  const [otherUser, setOtherUser] = useState<any>(location.state?.otherUser || null);
  const [showOptions, setShowOptions] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [deleteConfirmMsgId, setDeleteConfirmMsgId] = useState<string | null>(null);
  const [deleteEveryoneConfirmMsgId, setDeleteEveryoneConfirmMsgId] = useState<string | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [menuPosition, setMenuPosition] = useState<{ top?: number; bottom?: number; left?: number; right?: number } | null>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const blockedIds = useBlockedIds();
  const blockedByIds = useBlockedByIds();

  const otherUserId: string | undefined =
    (typeof otherUser?.id === 'string' ? otherUser.id : undefined)
    ?? roomData?.participants?.find(id => id !== user?.uid);

  const otherPresence = useUserPresence(otherUserId);
  const isBlockedByMe = otherUserId ? blockedIds.has(otherUserId) : false;
  const hasBlockedMe = otherUserId ? blockedByIds.has(otherUserId) : false;
  const isBlocked = isBlockedByMe || hasBlockedMe;

  useEffect(() => { window.scrollTo(0, 0); }, []);

  useEffect(() => {
    if (!roomId || !user) return;

    const fetchRoom = async () => {
      try {
        const roomDoc = await getDoc(doc(db, 'chatRooms', roomId));
        if (roomDoc.exists()) {
          const data = roomDoc.data() as ChatRoomData;
          if (!roomData) setRoomData(data);
          const resolvedOtherUserId = data.participants.find(id => id !== user.uid);
          if (resolvedOtherUserId && !otherUser) {
            const userDoc = await getDoc(doc(db, 'users', resolvedOtherUserId));
            if (userDoc.exists()) {
              setOtherUser({ id: resolvedOtherUserId, ...userDoc.data() });
            } else {
              setOtherUser({ id: resolvedOtherUserId, name: 'Deleted User', profilePicture: null });
            }
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `chatRooms/${roomId}`);
      }
    };

    if (!roomData || !otherUser) fetchRoom();

    const unsubRoom = onSnapshot(doc(db, 'chatRooms', roomId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as ChatRoomData;
        setRoomData(prev => prev ? { ...prev, ...data } : data);
        if (data.unreadBy?.includes(user.uid)) {
          updateDoc(doc(db, 'chatRooms', roomId), { unreadBy: arrayRemove(user.uid) }).catch(console.error);
        }
      }
    });

    const q = query(collection(db, 'chatRooms', roomId, 'messages'), orderBy('createdAt', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((doc) => msgs.push({ id: doc.id, ...doc.data() } as Message));
      setMessages(msgs.reverse());
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `chatRooms/${roomId}/messages`);
    });

    const notifQ = query(collection(db, 'notifications'), where('userId', '==', user.uid), where('read', '==', false));
    const unsubscribeNotifications = onSnapshot(notifQ, async (notifSnap) => {
      try {
        const batch = writeBatch(db);
        let hasUpdates = false;
        notifSnap.docs.forEach(d => {
          const data = d.data();
          if (isChatMessageNotification(data) && data.link === `/chat/${roomId}`) {
            batch.update(d.ref, { read: true });
            hasUpdates = true;
          }
        });
        if (hasUpdates) await batch.commit();
      } catch (err) {
        console.error("Failed to mark notifications as read", err);
      }
    });

    return () => { unsubscribe(); unsubRoom(); unsubscribeNotifications(); };
  }, [roomId, user]);

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    let attempts = 0;
    const interval = setInterval(() => {
      scrollToBottom();
      attempts++;
      if (attempts > 10) clearInterval(interval);
    }, 50);
    return () => clearInterval(interval);
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = () => {
      setSelectedMessageId(null);
      setMenuPosition(null);
      setActiveReactionMsgId(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const sendMessage = async (text?: string, image?: string) => {
    if ((!text?.trim() && !image) || !user || !roomId) return;

    const messageText = text?.trim();
    setNewMessage('');
    setShowQuickReplies(false);

    const currentReply = replyingTo;
    setReplyingTo(null);

    try {
      const msgData: any = { senderId: user.uid, createdAt: serverTimestamp() };
      if (messageText) msgData.text = messageText;
      if (image) msgData.image = image;
      if (currentReply) {
        msgData.replyToId = currentReply.id;
        msgData.replyToText = currentReply.text || '📷 Image';
      }

      await addDoc(collection(db, 'chatRooms', roomId, 'messages'), msgData);

      const updateData: any = {
        lastMessage: image ? '📷 Image' : messageText,
        lastSenderId: user.uid,
        updatedAt: serverTimestamp(),
      };

      const recipientId = roomData?.participants?.find((id: string) => id !== user.uid);
      if (recipientId) updateData.unreadBy = arrayUnion(recipientId);

      await updateDoc(doc(db, 'chatRooms', roomId), updateData);

      if (roomData?.participants) {
        const recipientId = roomData.participants.find((id: string) => id !== user.uid);
        if (recipientId) {
          const recipientWasUnread = roomData.unreadBy?.includes(recipientId) ?? false;
          if (!recipientWasUnread) {
            createNotification({
              userId: recipientId,
              type: 'new_message',
              title: 'New Message',
              message: `${userData?.name || 'Someone'} sent you a message: ${messageText || '📷 Image'}`,
              link: `/chat/${roomId}`,
            });
          }
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `chatRooms/${roomId}/messages`);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    if (file.size > 5 * 1024 * 1024) { showToast('Image must be less than 5MB', 'error'); return; }
    setPendingImageFile(file);
    setPendingImagePreview(URL.createObjectURL(file));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearPendingImage = () => {
    if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
    setPendingImageFile(null);
    setPendingImagePreview(null);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pendingImageFile) {
      setIsUploading(true);
      try {
        const imageUrl = await uploadChatImage(pendingImageFile, roomId!);
        await sendMessage(newMessage || undefined, imageUrl);
        clearPendingImage();
      } catch {
        showToast('Failed to upload image', 'error');
      } finally {
        setIsUploading(false);
      }
    } else {
      sendMessage(newMessage);
    }
  };

  const handleDeleteForMe = async (msgId: string) => {
    if (!user || !roomId) return;
    try {
      await updateDoc(doc(db, 'chatRooms', roomId, 'messages', msgId), { deletedFor: arrayUnion(user.uid) });
    } catch { showToast('Failed to delete message', 'error'); }
    setDeleteConfirmMsgId(null);
    setSelectedMessageId(null);
  };

  const handleDeleteForEveryone = async (msgId: string) => {
    if (!user || !roomId) return;
    try {
      await updateDoc(doc(db, 'chatRooms', roomId, 'messages', msgId), { isDeletedForEveryone: true, text: '', image: '' });
    } catch { showToast('Failed to delete message', 'error'); }
    setDeleteEveryoneConfirmMsgId(null);
    setSelectedMessageId(null);
  };

  const handleClearChat = async () => {
    if (!user || !roomId || messages.length === 0) return;
    if (!confirm('Are you sure you want to clear this chat?')) return;
    try {
      const batch = writeBatch(db);
      let count = 0;
      messages.forEach((msg) => {
        if (!msg.deletedFor?.includes(user.uid)) {
          batch.update(doc(db, 'chatRooms', roomId, 'messages', msg.id), { deletedFor: arrayUnion(user.uid) });
          count++;
        }
      });
      if (count > 0) await batch.commit();
      showToast('Chat cleared', 'success');
    } catch { showToast('Failed to clear chat', 'error'); }
    setShowOptions(false);
  };

  const handlePinMessage = async (msgId: string, text?: string) => {
    if (!user || !roomId) return;
    try {
      await updateDoc(doc(db, 'chatRooms', roomId), { pinnedMessageId: msgId, pinnedMessageText: text || '📷 Image', updatedAt: serverTimestamp() });
      showToast('Message pinned', 'success');
    } catch { showToast('Failed to pin message', 'error'); }
    setSelectedMessageId(null);
  };

  const handleUnpinMessage = async () => {
    if (!user || !roomId) return;
    try {
      await updateDoc(doc(db, 'chatRooms', roomId), { pinnedMessageId: null, pinnedMessageText: null, updatedAt: serverTimestamp() });
      showToast('Message unpinned', 'success');
    } catch { showToast('Failed to unpin message', 'error'); }
  };

  const toggleMessageSelection = (msgId: string) => {
    setSelectedMessages(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId); else next.add(msgId);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedMessages.size === 0 || !roomId || !user) return;
    if (!confirm(`Delete ${selectedMessages.size} messages?`)) return;
    try {
      const batch = writeBatch(db);
      selectedMessages.forEach(msgId => batch.update(doc(db, 'chatRooms', roomId, 'messages', msgId), { deletedFor: arrayUnion(user.uid) }));
      await batch.commit();
      showToast('Messages deleted', 'success');
      setIsSelectMode(false);
      setSelectedMessages(new Set());
    } catch { showToast('Failed to delete messages', 'error'); }
  };

  const handleBulkCopy = () => {
    const textsToCopy = messages.filter(m => selectedMessages.has(m.id) && m.text).map(m => m.text).join('\n\n');
    if (textsToCopy) { navigator.clipboard.writeText(textsToCopy); showToast('Messages copied to clipboard', 'success'); }
    setIsSelectMode(false);
    setSelectedMessages(new Set());
  };

  const handleAcceptRequest = async () => {
    if (!roomId) return;
    try {
      await updateDoc(doc(db, 'chatRooms', roomId), {
        status: 'active',
        requestedBy: deleteField(),
        updatedAt: serverTimestamp()
      });
      showToast('Chat request accepted', 'success');
    } catch (err) {
      console.error('Accept request error:', err);
      showToast('Failed to accept request', 'error');
    }
  };

  const handleDeclineRequest = async () => {
    if (!roomId || !user) return;
    if (!confirm('Are you sure you want to decline and delete this request?')) return;
    try {
      const batch = writeBatch(db);
      const msgsSnap = await getDocs(collection(db, 'chatRooms', roomId, 'messages'));
      msgsSnap.docs.forEach(d => batch.delete(d.ref));
      batch.delete(doc(db, 'chatRooms', roomId));
      await batch.commit();
      showToast('Chat request declined', 'info');
      navigate('/messages');
    } catch (err) {
      console.error('Decline request error:', err);
      showToast('Failed to decline request', 'error');
    }
  };

  const isPendingRequester = roomData?.status === 'pending' && roomData?.requestedBy === user?.uid;
  const isPendingRecipient = roomData?.status === 'pending' && roomData?.requestedBy !== user?.uid;
  const hasSentPendingMessage = isPendingRequester && messages.some(m => m.senderId === user?.uid);

  if (!user || !otherUser) return (
    <div className="pt-32 text-center">
      <div className="w-10 h-10 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="text-luxury-ink/30 text-xs font-bold uppercase tracking-widest">Loading conversation...</p>
    </div>
  );

  const otherUserProfileUrl = profileUrl(otherUser, roomData?.participants?.find(id => id !== user?.uid));

  return (
    <div className={panelMode ? "flex flex-col h-full bg-surface-base overflow-hidden" : "fixed inset-0 z-100 flex flex-col bg-surface-base pb-64px md:pb-0"}>
      {/* Header */}
      <div className="theme-card border-b px-4 md:px-6 py-3 flex items-center justify-between z-10" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => onBack ? onBack() : navigate('/messages')} className="p-2 hover:bg-surface-soft rounded-full transition-all">
            <ArrowLeft size={20} className="text-luxury-ink" />
          </button>
          <div className="flex items-center gap-3 p-2 -ml-2 rounded-xl transition-colors">
            <Link to={otherUserProfileUrl} className="w-10 h-10 rounded-xl bg-brand-teal/5 flex items-center justify-center overflow-hidden border border-luxury-ink/5 shrink-0 hover:opacity-80 transition-opacity">
              {otherUser.profilePicture ? (
                <img src={getOptimizedImageUrl(otherUser.profilePicture)} alt={otherUser.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <User size={20} className="text-brand-teal" />
              )}
            </Link>
            <div>
              <Link to={otherUserProfileUrl} className="font-bold text-luxury-ink flex items-center gap-1.5 leading-none mb-0.5 text-sm hover:text-brand-teal transition-colors">
                {otherUser.name}
                {otherUser.verified && <ShieldCheck size={14} className="text-brand-teal" />}
              </Link>
              <div className="flex flex-col gap-0.5">
                {roomData?.productTitle && roomData?.productId && (
                  <Link to={`/product/${roomData.productId}`} className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 hover:text-brand-pink transition-colors flex items-center gap-1">
                    <Package size={10} /> {roomData.productTitle}
                  </Link>
                )}
                <span className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${otherPresence.status === 'online' ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : otherPresence.status === 'recent' ? 'bg-amber-400' : 'bg-luxury-ink/20'}`} />
                  <span className={otherPresence.status === 'online' ? 'text-emerald-500' : otherPresence.status === 'recent' ? 'text-amber-500' : 'text-luxury-ink/30'}>
                    {otherPresence.lastSeen || otherPresence.status !== 'offline' ? otherPresence.label : 'Direct Message'}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="relative">
          <button onClick={() => setShowOptions(!showOptions)} className="p-2 hover:bg-surface-soft rounded-full transition-all">
            <MoreVertical size={20} className="text-luxury-ink/30" />
          </button>
          {showOptions && (
            <div className="absolute right-0 top-full mt-2 theme-card rounded-xl shadow-2xl border py-2 w-48 z-20" style={{ borderColor: 'var(--color-border)' }}>
              {roomData?.productId && roomData?.productTitle && (
                <Link to={`/product/${roomData.productId}`} onClick={() => setShowOptions(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-luxury-ink hover:bg-surface-soft transition-all">
                  <Package size={16} className="text-brand-teal" /> View Listing
                </Link>
              )}
              <button onClick={handleClearChat} className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-luxury-ink hover:bg-surface-soft transition-all w-full border-b border-luxury-ink/5">
                <X size={16} /> Clear Chat
              </button>
              <button onClick={() => { setShowReport(true); setShowOptions(false); }} className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-all w-full">
                <Flag size={16} /> Report Chat
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Pinned Message */}
      {roomData?.pinnedMessageId && (
        <div className="bg-surface-soft border-b px-4 py-2 flex items-center justify-between z-10 relative" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-3 overflow-hidden">
            <Pin size={14} className="text-brand-teal shrink-0" />
            <div className="text-xs font-medium text-luxury-ink/70 truncate">{roomData.pinnedMessageText}</div>
          </div>
          <button onClick={handleUnpinMessage} className="p-1 hover:bg-surface-base rounded-full transition-colors shrink-0 ml-2">
            <X size={14} className="text-luxury-ink/40" />
          </button>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 chat-scroll chat-bg">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-luxury-ink/20 font-serif italic text-lg mb-2">Start the conversation</p>
            <p className="text-luxury-ink/10 text-xs font-bold uppercase tracking-widest">Messages are end-to-end secured</p>
          </div>
        )}
        {messages.filter(msg => !msg.deletedFor?.includes(user.uid)).map((msg) => {
          const isMe = msg.senderId === user.uid;
          const isDeleted = msg.isDeletedForEveryone;
          const isSelected = selectedMessages.has(msg.id);

          return (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={msg.id}
              className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} relative group gap-0.5`}
            >
              {/* ── Bubble row + inline react button ── */}
              <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} items-center gap-1.5 w-full`}>

                {/* Select checkbox — their side */}
                {isSelectMode && !isMe && (
                  <button onClick={() => toggleMessageSelection(msg.id)} className="p-2 shrink-0">
                    {isSelected ? <CheckCircle2 className="text-brand-teal" size={20} /> : <Circle className="text-luxury-ink/20" size={20} />}
                  </button>
                )}

                {/* React button — left of their bubble */}
                {!isSelectMode && !isDeleted && isMe && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveReactionMsgId(prev => prev === msg.id ? null : msg.id);
                      setSelectedMessageId(null);
                      setMenuPosition(null);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full hover:bg-surface-soft text-luxury-ink/30 hover:text-brand-teal transition-all shrink-0"
                    title="React"
                  >
                    <span className="text-base leading-none">😊</span>
                  </button>
                )}

                {/* Message bubble */}
                <div
                  data-msg-id={msg.id}
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    if (isSelectMode) { toggleMessageSelection(msg.id); return; }
                    setActiveReactionMsgId(null);
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const spaceBelow = window.innerHeight - rect.bottom;
                    const pos = spaceBelow < 220
                      ? { bottom: window.innerHeight - rect.top + 4, ...(isMe ? { right: window.innerWidth - rect.right } : { left: rect.left }) }
                      : { top: rect.bottom + 4, ...(isMe ? { right: window.innerWidth - rect.right } : { left: rect.left }) };
                    setMenuPosition(selectedMessageId === msg.id ? null : pos);
                    setSelectedMessageId(selectedMessageId === msg.id ? null : msg.id);
                  }}
                  onContextMenu={(e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setActiveReactionMsgId(prev => prev === msg.id ? null : msg.id);
                    setSelectedMessageId(null);
                    setMenuPosition(null);
                  }}
                  className={`max-w-[75%] px-5 py-3.5 rounded-2xl text-sm font-medium cursor-pointer relative shadow-sm ${isMe ? 'bubble-mine rounded-tr-sm' : 'bubble-theirs rounded-tl-sm'}`}
                  style={!isMe ? { borderColor: 'var(--color-border)' } : undefined}
                >
                  {!isDeleted && msg.replyToText && (
                    <div className={`text-xs mb-2 p-2 rounded-lg border-l-2 ${isMe ? 'bg-surface-base/20 border-surface-base/40' : 'bg-surface-soft border-brand-teal'}`}>
                      <p className="opacity-70 line-clamp-2">{msg.replyToText}</p>
                    </div>
                  )}

                  {isDeleted ? (
                    <p className="italic opacity-60 flex items-center gap-2 text-xs">
                      <X size={14} /> This message was deleted
                    </p>
                  ) : (
                    <>
                      {msg.image && (
                        <div className="mb-2 rounded-lg overflow-hidden border border-luxury-ink/5 bg-surface-base">
                          <img
                            src={getOptimizedImageUrl(msg.image)}
                            alt="Shared"
                            className="max-w-full max-h-300px object-contain hover:opacity-90 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); setViewingImage(getOptimizedImageUrl(msg.image!)); }}
                            referrerPolicy="no-referrer"
                            onLoad={scrollToBottom}
                          />
                        </div>
                      )}
                      {msg.sharedPost && (
                        <Link to={`/post/${msg.sharedPost.id}`} className="block mb-2 rounded-xl overflow-hidden border border-luxury-ink/10 bg-surface-base hover:opacity-90 transition-opacity">
                          {msg.sharedPost.image && (
                            <div className="w-full h-32 bg-luxury-ink/5">
                              <img src={getOptimizedImageUrl(msg.sharedPost.image)} alt="Shared Post" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            </div>
                          )}
                          <div className="p-3">
                            <p className="text-[10px] font-bold text-luxury-ink/40 uppercase tracking-widest mb-1">{msg.sharedPost.authorName}</p>
                            <p className="text-sm font-bold text-luxury-ink line-clamp-1">{msg.sharedPost.title}</p>
                            {msg.sharedPost.description && <p className="text-xs text-luxury-ink/60 line-clamp-2 mt-1">{msg.sharedPost.description}</p>}
                          </div>
                        </Link>
                      )}
                      {msg.text && <MessageText text={msg.text} />}
                    </>
                  )}

                  <div className={`text-[10px] mt-1.5 opacity-30 ${isMe ? 'text-right' : 'text-left'}`}>
                    {msg.createdAt?.toDate?.()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '...'}
                  </div>
                </div>

                {/* React button — right of my bubble */}
                {!isSelectMode && !isDeleted && !isMe && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveReactionMsgId(prev => prev === msg.id ? null : msg.id);
                      setSelectedMessageId(null);
                      setMenuPosition(null);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full hover:bg-surface-soft text-luxury-ink/30 hover:text-brand-teal transition-all shrink-0"
                    title="React"
                  >
                    <span className="text-base leading-none">😊</span>
                  </button>
                )}

                {/* Select checkbox — my side */}
                {isSelectMode && isMe && (
                  <button onClick={() => toggleMessageSelection(msg.id)} className="p-2 shrink-0">
                    {isSelected ? <CheckCircle2 className="text-brand-teal" size={20} /> : <Circle className="text-luxury-ink/20" size={20} />}
                  </button>
                )}
              </div>

              {/* Reactions + quick bar — rendered by MessageReactions */}
              {!isDeleted && (
                <MessageReactions
                  reactions={msg.reactions}
                  messageId={msg.id}
                  roomId={roomId!}
                  currentUserId={user.uid}
                  isMe={isMe}
                  isOpen={activeReactionMsgId === msg.id}
                  onOpenChange={(open: boolean) => setActiveReactionMsgId(open ? msg.id : null)}
                />
              )}
            </motion.div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Options Menu (tap) */}
      {selectedMessageId && menuPosition && (() => {
        const msg = messages.find(m => m.id === selectedMessageId);
        if (!msg) return null;
        const isMe = msg.senderId === user.uid;
        const isDeleted = msg.isDeletedForEveryone;
        return (
          <div
            className="fixed z-50 w-48 bg-surface-card rounded-xl shadow-2xl border flex flex-col overflow-hidden"
            style={{ borderColor: 'var(--color-border)', ...menuPosition }}
            onClick={e => e.stopPropagation()}
          >
            {!isDeleted && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveReactionMsgId(msg.id);
                  setSelectedMessageId(null);
                  setMenuPosition(null);
                }}
                className="px-4 py-3 text-left text-sm font-medium text-luxury-ink hover:bg-surface-soft transition-colors flex items-center gap-2"
              >
                <span className="text-base">😊</span> React
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); setReplyingTo(msg); setSelectedMessageId(null); setMenuPosition(null); }} className="px-4 py-3 text-left text-sm font-medium text-luxury-ink hover:bg-surface-soft transition-colors flex items-center gap-2 border-t border-luxury-ink/5">
              <CornerDownRight size={16} className="opacity-60" /> Reply
            </button>
            <button onClick={(e) => { e.stopPropagation(); handlePinMessage(msg.id, msg.text); setMenuPosition(null); }} className="px-4 py-3 text-left text-sm font-medium text-luxury-ink hover:bg-surface-soft transition-colors flex items-center gap-2 border-t border-luxury-ink/5">
              <Pin size={16} className="opacity-60" /> Pin
            </button>
            <button onClick={(e) => { e.stopPropagation(); setIsSelectMode(true); setSelectedMessages(new Set([msg.id])); setSelectedMessageId(null); setMenuPosition(null); }} className="px-4 py-3 text-left text-sm font-medium text-luxury-ink hover:bg-surface-soft transition-colors flex items-center gap-2 border-t border-luxury-ink/5">
              <CheckCircle2 size={16} className="opacity-60" /> Select
            </button>
            <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmMsgId(msg.id); setMenuPosition(null); }} className="px-4 py-3 text-left text-sm font-medium text-luxury-ink hover:bg-surface-soft transition-colors flex items-center gap-2 border-t border-luxury-ink/5">
              <X size={16} className="opacity-60" /> Delete for me
            </button>
            {isMe && !isDeleted && (
              <button onClick={(e) => { e.stopPropagation(); setDeleteEveryoneConfirmMsgId(msg.id); setMenuPosition(null); }} className="px-4 py-3 text-left text-sm font-medium text-red-500 hover:bg-red-50 transition-colors border-t border-luxury-ink/5 flex items-center gap-2">
                <Flag size={16} /> Delete for everyone
              </button>
            )}
          </div>
        );
      })()}

      {/* Quick Replies */}
      {showQuickReplies && !isBlocked && (
        <div className="px-3 pb-1 chat-bg">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {QUICK_MESSAGES.map((msg, i) => (
              <button key={i} onClick={() => sendMessage(msg)} className="whitespace-nowrap px-4 py-2 bg-surface-card border rounded-full text-xs font-medium text-luxury-ink/60 hover:bg-brand-teal/5 hover:text-brand-teal hover:border-brand-teal/20 transition-all shadow-sm" style={{ borderColor: 'var(--color-border)' }}>
                {msg}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="px-3 py-3 pb-safe chat-bg">
        {isSelectMode ? (
          <div className="flex items-center justify-between bg-surface-card rounded-2xl px-4 py-3 shadow-lg border" style={{ borderColor: 'var(--color-border)' }}>
            <div className="text-sm font-bold text-luxury-ink">{selectedMessages.size} selected</div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setIsSelectMode(false); setSelectedMessages(new Set()); }} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-surface-soft transition-colors text-luxury-ink/60">Cancel</button>
              <button onClick={handleBulkCopy} disabled={selectedMessages.size === 0} className="p-2.5 rounded-xl text-luxury-ink hover:bg-surface-soft transition-colors disabled:opacity-50"><Copy size={18} /></button>
              <button onClick={handleBulkDelete} disabled={selectedMessages.size === 0} className="p-2.5 rounded-xl text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"><Trash2 size={18} /></button>
            </div>
          </div>
        ) : isPendingRecipient ? (
          <div className="bg-surface-card rounded-2xl p-4 border border-amber-500/20 shadow-lg text-center mb-2 mx-auto max-w-sm">
            <p className="text-sm font-bold text-luxury-ink mb-3">{otherUser?.name} wants to message you.</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={handleDeclineRequest} className="px-6 py-2 rounded-full border border-luxury-ink/10 text-sm font-bold hover:bg-surface-soft transition-colors text-luxury-ink/60">Decline</button>
              <button onClick={handleAcceptRequest} className="px-6 py-2 rounded-full bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition-colors shadow-md">Accept</button>
            </div>
          </div>
        ) : isBlocked ? (
          <div className="text-center py-4 bg-surface-card rounded-2xl border border-luxury-ink/5 shadow-lg">
            <p className="text-sm font-bold text-luxury-ink/40">
              {isBlockedByMe ? "You have blocked this user." : "You cannot message this user."}
            </p>
          </div>
        ) : (
          <div className="relative">
            {isPendingRequester && (
              <div className="mb-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-2 text-center shadow-sm">
                <p className="text-xs font-bold text-amber-700">Waiting for {otherUser?.name} to accept your request.</p>
              </div>
            )}

            {replyingTo && (
              <div className="mb-2 bg-surface-card border rounded-2xl px-4 py-3 flex items-start justify-between shadow-md" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex-1 overflow-hidden">
                  <div className="text-[10px] font-bold text-brand-teal uppercase tracking-widest mb-1 flex items-center gap-1"><CornerDownRight size={10} /> Replying to</div>
                  <div className="text-sm text-luxury-ink/70 line-clamp-1">{replyingTo.text || '📷 Image'}</div>
                </div>
                <button type="button" onClick={() => setReplyingTo(null)} className="p-1 hover:bg-surface-soft rounded-full shrink-0 ml-2">
                  <X size={16} className="text-luxury-ink/50" />
                </button>
              </div>
            )}

            {pendingImagePreview && (
              <div className="mb-2 flex items-center gap-3 bg-surface-card border border-luxury-ink/10 rounded-2xl px-3 py-2 shadow-sm">
                <div className="relative shrink-0">
                  <img src={pendingImagePreview} alt="Preview" className="h-16 w-16 object-cover rounded-xl border border-luxury-ink/10" />
                  <button
                    type="button"
                    onClick={clearPendingImage}
                    className="absolute -top-1.5 -right-1.5 bg-luxury-ink text-white rounded-full p-0.5 hover:bg-red-500 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
                <p className="text-xs text-luxury-ink/50 font-medium">
                  {pendingImageFile?.name || 'Image ready'} · Add a caption below
                </p>
              </div>
            )}

            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || hasSentPendingMessage}
                className="p-3 rounded-full bg-surface-card border border-luxury-ink/10 text-brand-teal hover:bg-brand-teal/10 transition-all shrink-0 disabled:opacity-50 shadow-md"
                title="Send Image"
              >
                {isUploading ? (
                  <div className="w-5 h-5 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Camera size={20} />
                )}
              </button>

              <div className="flex-1 flex items-center gap-1 bg-surface-card rounded-full border border-luxury-ink/10 shadow-md px-3 relative" style={{ borderColor: 'var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => setShowQuickReplies(!showQuickReplies)}
                  className={`p-2 rounded-full transition-all shrink-0 text-base ${showQuickReplies ? 'text-brand-teal' : 'text-luxury-ink/40 hover:text-brand-teal'}`}
                  title="Quick replies"
                >
                  ⚡
                </button>

                <input
                  ref={inputRef}
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onPaste={async (e: React.ClipboardEvent<HTMLInputElement>) => {
                    const items = e.clipboardData?.items;
                    if (!items) return;
                    for (const item of Array.from(items)) {
                      if (item.type.startsWith('image/')) {
                        e.preventDefault();
                        const file = item.getAsFile();
                        if (!file) return;
                        if (file.size > 5 * 1024 * 1024) { showToast('Image must be less than 5MB', 'error'); return; }
                        setPendingImageFile(file);
                        setPendingImagePreview(URL.createObjectURL(file));
                        return;
                      }
                    }
                  }}
                  placeholder={
                    pendingImageFile ? 'Add a caption (optional)...' :
                    hasSentPendingMessage ? 'Request pending...' :
                    isUploading ? 'Uploading...' :
                    'Type your message...'
                  }
                  disabled={isUploading || hasSentPendingMessage}
                  className="flex-1 bg-transparent py-3.5 text-sm font-medium focus:outline-none text-luxury-ink placeholder:text-luxury-ink/30"
                />
              </div>

              <button
                type="submit"
                disabled={(!newMessage.trim() && !pendingImageFile) || isUploading || hasSentPendingMessage}
                className="p-3 bg-brand-teal text-white rounded-full hover:opacity-90 transition-all shadow-md disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
              >
                <Send size={18} />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Image Viewer */}
      <AnimatePresence>
        {viewingImage && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-300 flex items-center justify-center bg-black/90 backdrop-blur-sm" onClick={() => setViewingImage(null)}>
            <button onClick={() => setViewingImage(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"><X size={24} className="text-white" /></button>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const response = await fetch(viewingImage ?? '');
                  const blob = await response.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = 'image.' + (blob.type.split('/')[1] || 'jpg');
                  document.body.appendChild(a); a.click(); document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                } catch { showToast('Failed to download image', 'error'); }
              }}
              className="absolute top-4 left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              title="Download image"
            >
              <Download size={20} className="text-white" />
            </button>
            <motion.img initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} src={viewingImage ?? ''} alt="Full size" className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete For Me Modal */}
      <AnimatePresence>
        {deleteConfirmMsgId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-200 flex items-center justify-center p-4 bg-luxury-ink/20 backdrop-blur-sm" onClick={() => setDeleteConfirmMsgId(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="theme-card w-full max-w-sm rounded-3xl p-6 shadow-2xl border" style={{ borderColor: 'var(--color-border)' }} onClick={(e) => e.stopPropagation()}>
              <h3 className="text-xl font-bold text-luxury-ink mb-2">Delete Message</h3>
              <p className="text-luxury-ink/60 text-sm mb-6">Are you sure you want to delete this message for yourself? Other chat members will still be able to see it.</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleteConfirmMsgId(null)} className="px-5 py-2.5 rounded-full text-sm font-bold text-luxury-ink/60 hover:bg-surface-soft transition-colors">Cancel</button>
                <button onClick={() => handleDeleteForMe(deleteConfirmMsgId!)} className="px-5 py-2.5 bg-red-500 text-white rounded-full text-sm font-bold hover:bg-red-600 transition-colors shadow-lg">Delete for me</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete For Everyone Modal */}
      <AnimatePresence>
        {deleteEveryoneConfirmMsgId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-200 flex items-center justify-center p-4 bg-luxury-ink/20 backdrop-blur-sm" onClick={() => setDeleteEveryoneConfirmMsgId(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="theme-card w-full max-w-sm rounded-3xl p-6 shadow-2xl border" style={{ borderColor: 'var(--color-border)' }} onClick={(e) => e.stopPropagation()}>
              <h3 className="text-xl font-bold text-red-500 mb-2">Delete for Everyone</h3>
              <p className="text-luxury-ink/60 text-sm mb-6">This message will be permanently deleted for all members in this chat. They will see that a message was deleted.</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleteEveryoneConfirmMsgId(null)} className="px-5 py-2.5 rounded-full text-sm font-bold text-luxury-ink/60 hover:bg-surface-soft transition-colors">Cancel</button>
                <button onClick={() => handleDeleteForEveryone(deleteEveryoneConfirmMsgId!)} className="px-5 py-2.5 bg-red-500 text-white rounded-full text-sm font-bold hover:bg-red-600 transition-colors shadow-lg">Delete for everyone</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ReportModal isOpen={showReport} onClose={() => setShowReport(false)} contentType="message" contentId={roomId || ''} />
    </div>
  );
}
