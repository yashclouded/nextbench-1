import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Send, ArrowLeft, MoreVertical, User, Camera, X, CornerDownRight, Pin, CheckCircle2, Circle, Copy, Trash2, Settings, Users, Shield, Crown, Lock } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDoc, writeBatch, arrayUnion, arrayRemove, limit } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { useToast } from '../../lib/ToastContext';
import { uploadChatImage } from '../../lib/storage';
import { getOptimizedImageUrl } from '../../lib/utils';
import type { ClubData } from '../../lib/clubs';
import MessageText from '../../components/ui/MessageText';

interface Message {
  id: string;
  senderId: string;
  senderName?: string;
  senderAvatar?: string;
  text?: string;
  image?: string;
  createdAt: any;
  deletedFor?: string[];
  isDeletedForEveryone?: boolean;
  replyToId?: string;
  replyToText?: string;
}

interface ClubChatProps {
  panelMode?: boolean;
  roomIdOverride?: string;
  onBack?: () => void;
}

export default function ClubChat({ panelMode, roomIdOverride, onBack }: ClubChatProps = {}) {
  const { clubId: routeClubId } = useParams<{ clubId: string }>();
  const clubId = roomIdOverride || routeClubId;
  const { user, userData } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [club, setClub] = useState<ClubData | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [deleteConfirmMsgId, setDeleteConfirmMsgId] = useState<string | null>(null);
  const [deleteEveryoneConfirmMsgId, setDeleteEveryoneConfirmMsgId] = useState<string | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [showOptions, setShowOptions] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isLead = club?.leadId === user?.uid;
  const isColeader = club?.coLeadIds?.includes(user?.uid || '') || false;
  const isLeadOrCo = isLead || isColeader;
  const isMember = club?.memberIds?.includes(user?.uid || '') || false;
  const canPost = !club?.settings?.onlyLeadsCanPost || isLeadOrCo;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Listen to club data
  useEffect(() => {
    if (!clubId) return;

    const unsub = onSnapshot(doc(db, 'clubs', clubId), (snap) => {
      if (snap.exists()) {
        setClub({ id: snap.id, ...snap.data() } as ClubData);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `clubs/${clubId}`);
    });

    return () => unsub();
  }, [clubId]);

  // Listen to messages
  useEffect(() => {
    if (!clubId || !user || !isMember) return;

    const q = query(
      collection(db, 'clubs', clubId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(150)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((d) => msgs.push({ id: d.id, ...d.data() } as Message));
      setMessages(msgs.reverse());
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `clubs/${clubId}/messages`);
    });

    return () => unsub();
  }, [clubId, user?.uid, isMember]);

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

  const sendMessage = async (text?: string, image?: string) => {
    if ((!text?.trim() && !image) || !user || !clubId || !canPost) return;

    const messageText = text?.trim();
    setNewMessage('');
    const currentReply = replyingTo;
    setReplyingTo(null);

    try {
      const msgData: any = {
        senderId: user.uid,
        senderName: userData?.name || 'Unknown',
        senderAvatar: userData?.profilePicture || null,
        createdAt: serverTimestamp(),
      };
      if (messageText) msgData.text = messageText;
      if (image) msgData.image = image;

      if (currentReply) {
        msgData.replyToId = currentReply.id;
        msgData.replyToText = currentReply.text || '📷 Image';
      }

      await addDoc(collection(db, 'clubs', clubId, 'messages'), msgData);

      await updateDoc(doc(db, 'clubs', clubId), {
        lastMessage: image ? '📷 Image' : messageText,
        lastSenderId: user.uid,
        lastSenderName: userData?.name || 'Unknown',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `clubs/${clubId}/messages`);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !clubId) return;
    const file = e.target.files[0];

    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be less than 5MB', 'error');
      return;
    }

    setIsUploading(true);
    try {
      const imageUrl = await uploadChatImage(file, clubId);
      await sendMessage(undefined, imageUrl);
    } catch {
      showToast('Failed to upload image', 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(newMessage);
  };

  const handleDeleteForMe = async (msgId: string) => {
    if (!user || !clubId) return;
    try {
      await updateDoc(doc(db, 'clubs', clubId, 'messages', msgId), {
        deletedFor: arrayUnion(user.uid),
      });
    } catch {
      showToast('Failed to delete message', 'error');
    }
    setDeleteConfirmMsgId(null);
    setSelectedMessageId(null);
  };

  const handleDeleteForEveryone = async (msgId: string) => {
    if (!user || !clubId) return;
    try {
      await updateDoc(doc(db, 'clubs', clubId, 'messages', msgId), {
        isDeletedForEveryone: true,
        text: '',
        image: '',
      });
    } catch {
      showToast('Failed to delete message', 'error');
    }
    setDeleteEveryoneConfirmMsgId(null);
    setSelectedMessageId(null);
  };

  const handlePinMessage = async (msgId: string, text?: string) => {
    if (!user || !clubId) return;
    try {
      await updateDoc(doc(db, 'clubs', clubId), {
        pinnedMessageId: msgId,
        pinnedMessageText: text || '📷 Image',
        updatedAt: serverTimestamp(),
      });
      showToast('Message pinned', 'success');
    } catch {
      showToast('Failed to pin message', 'error');
    }
    setSelectedMessageId(null);
  };

  const handleUnpinMessage = async () => {
    if (!user || !clubId) return;
    try {
      await updateDoc(doc(db, 'clubs', clubId), {
        pinnedMessageId: null,
        pinnedMessageText: null,
        updatedAt: serverTimestamp(),
      });
      showToast('Message unpinned', 'success');
    } catch {
      showToast('Failed to unpin message', 'error');
    }
  };

  const handleClearChat = async () => {
    if (!user || !clubId || messages.length === 0) return;
    if (!confirm('Clear this chat for yourself?')) return;

    try {
      const batch = writeBatch(db);
      let count = 0;
      messages.forEach((msg) => {
        if (!msg.deletedFor?.includes(user.uid)) {
          batch.update(doc(db, 'clubs', clubId, 'messages', msg.id), {
            deletedFor: arrayUnion(user.uid),
          });
          count++;
        }
      });
      if (count > 0) await batch.commit();
      showToast('Chat cleared', 'success');
    } catch {
      showToast('Failed to clear chat', 'error');
    }
    setShowOptions(false);
  };

  const toggleMessageSelection = (msgId: string) => {
    setSelectedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedMessages.size === 0 || !clubId || !user) return;
    if (!confirm(`Delete ${selectedMessages.size} messages?`)) return;

    try {
      const batch = writeBatch(db);
      selectedMessages.forEach((msgId) => {
        batch.update(doc(db, 'clubs', clubId, 'messages', msgId), {
          deletedFor: arrayUnion(user.uid),
        });
      });
      await batch.commit();
      showToast('Messages deleted', 'success');
      setIsSelectMode(false);
      setSelectedMessages(new Set());
    } catch {
      showToast('Failed to delete messages', 'error');
    }
  };

  const handleBulkCopy = () => {
    const textsToCopy = messages
      .filter((m) => selectedMessages.has(m.id) && m.text)
      .map((m) => m.text)
      .join('\n\n');

    if (textsToCopy) {
      navigator.clipboard.writeText(textsToCopy);
      showToast('Copied to clipboard', 'success');
    }
    setIsSelectMode(false);
    setSelectedMessages(new Set());
  };

  // ─── Loading / Not-member states ────────────────────────
  if (!user || !club) {
    return (
      <div className="pt-32 text-center">
        <div className="w-10 h-10 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-luxury-ink/30 text-xs font-bold uppercase tracking-widest">Loading club...</p>
      </div>
    );
  }

  if (!isMember) {
    return (
      <div className="pt-32 text-center px-6">
        <div className="max-w-sm mx-auto theme-card rounded-3xl p-10 border border-luxury-ink/5">
          <div className="w-16 h-16 bg-brand-teal/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Lock className="text-brand-teal" size={32} />
          </div>
          <h3 className="text-xl font-bold text-luxury-ink mb-2">Not a Member</h3>
          <p className="text-luxury-ink/50 text-sm mb-6">You need to join this club to view messages.</p>
          <button onClick={() => navigate('/messages')} className="bg-luxury-ink text-surface-base px-6 py-3 rounded-full font-bold text-sm hover:opacity-80 transition-opacity">
            Back to Messages
          </button>
        </div>
      </div>
    );
  }

  // Get role label for a userId
  const getRoleBadge = (uid: string) => {
    if (club.leadId === uid) return <Crown size={12} className="text-amber-500" />;
    if (club.coLeadIds?.includes(uid)) return <Shield size={12} className="text-brand-teal" />;
    return null;
  };

  return (
    <div className={panelMode ? "flex flex-col h-full bg-surface-base overflow-hidden" : "fixed inset-0 z-100 flex flex-col bg-surface-base pb-64px md:pb-0"}>
      {/* Header */}
      <div className="theme-card border-b px-4 md:px-6 py-3 flex items-center justify-between z-10 shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack || (() => navigate('/messages'))} className="p-2 hover:bg-surface-soft rounded-full transition-all shrink-0">
            <ArrowLeft size={20} className="text-luxury-ink" />
          </button>
          <Link to={`/club/${clubId}/settings`} className="flex items-center gap-3 p-2 -ml-2 rounded-xl hover:bg-surface-soft transition-colors">
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-brand-teal/20 to-brand-pink/20 flex items-center justify-center overflow-hidden border border-luxury-ink/5 shrink-0">
              {club.avatar ? (
                <img src={getOptimizedImageUrl(club.avatar)} alt={club.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <Users size={20} className="text-brand-teal" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-luxury-ink flex items-center gap-1.5 leading-none mb-0.5 text-sm">
                {club.name}
                {club.type === 'private' && <Lock size={12} className="text-luxury-ink/30" />}
              </h3>
              <span className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 flex items-center gap-1">
                <Users size={10} /> {club.memberCount} members
              </span>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-1">
          <Link to={`/club/${clubId}/settings`} className="p-2 hover:bg-surface-soft rounded-full transition-all">
            <Settings size={20} className="text-luxury-ink/30" />
          </Link>
          <div className="relative">
            <button onClick={() => setShowOptions(!showOptions)} className="p-2 hover:bg-surface-soft rounded-full transition-all">
              <MoreVertical size={20} className="text-luxury-ink/30" />
            </button>
            {showOptions && (
              <div className="absolute right-0 top-full mt-2 theme-card rounded-xl shadow-2xl border py-2 w-48 z-20" style={{ borderColor: 'var(--color-border)' }}>
                <Link to={`/club/${clubId}/settings`} onClick={() => setShowOptions(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-luxury-ink hover:bg-surface-soft transition-all">
                  <Settings size={16} className="text-brand-teal" /> Club Settings
                </Link>
                <button onClick={handleClearChat}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-luxury-ink hover:bg-surface-soft transition-all w-full">
                  <X size={16} /> Clear Chat
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pinned Message */}
      {(club as any).pinnedMessageId && (
        <div className="bg-surface-soft border-b px-4 py-2 flex items-center justify-between z-10 relative" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-3 overflow-hidden">
            <Pin size={14} className="text-brand-teal shrink-0" />
            <div className="text-xs font-medium text-luxury-ink/70 truncate">
              {(club as any).pinnedMessageText}
            </div>
          </div>
          {isLeadOrCo && (
            <button onClick={handleUnpinMessage} className="p-1 hover:bg-surface-base rounded-full transition-colors shrink-0 ml-2">
              <X size={14} className="text-luxury-ink/40" />
            </button>
          )}
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 chat-bg"
        >
        {messages.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-linear-to-br from-brand-teal/10 to-brand-pink/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Users className="text-brand-teal" size={32} />
            </div>
            <p className="text-luxury-ink/20 font-serif italic text-lg mb-2">Welcome to {club.name}</p>
            <p className="text-luxury-ink/10 text-xs font-bold uppercase tracking-widest">Start the conversation</p>
          </div>
        )}

        {messages
          .filter((msg) => !msg.deletedFor?.includes(user.uid))
          .map((msg) => {
            const isMe = msg.senderId === user.uid;
            const isDeleted = msg.isDeletedForEveryone;
            const isSelected = selectedMessages.has(msg.id);

            return (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={msg.id}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'} relative group items-start gap-2`}
              >
                {isSelectMode && !isMe && (
                  <button onClick={() => toggleMessageSelection(msg.id)} className="p-1 shrink-0 mt-2">
                    {isSelected ? <CheckCircle2 className="text-brand-teal" size={18} /> : <Circle className="text-luxury-ink/20" size={18} />}
                  </button>
                )}

                {/* Sender avatar (left side, only for others) */}
                {!isMe && (
                  <Link to={`/profile/${msg.senderId}`} className="w-8 h-8 rounded-full bg-brand-teal/10 flex items-center justify-center overflow-hidden shrink-0 mt-1 border border-luxury-ink/5">
                    {msg.senderAvatar ? (
                      <img src={getOptimizedImageUrl(msg.senderAvatar)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="text-brand-teal font-bold text-[10px]">{msg.senderName?.[0]?.toUpperCase() || '?'}</span>
                    )}
                  </Link>
                )}

                <div
                  onClick={() => {
                    if (isSelectMode) toggleMessageSelection(msg.id);
                    else setSelectedMessageId(selectedMessageId === msg.id ? null : msg.id);
                  }}
                  className={`max-w-[70%] px-4 py-3 rounded-2xl text-sm font-medium cursor-pointer relative shadow-sm ${
                    isMe
                      ? 'bubble-mine rounded-tr-sm'
                      : 'bubble-theirs rounded-tl-sm'
                  }`}
                  style={!isMe ? { borderColor: 'var(--color-border)' } : undefined}
                >
                  {/* Sender name (group chat style) */}
                  {!isMe && !isDeleted && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <Link to={`/profile/${msg.senderId}`} className="text-[11px] font-bold text-brand-teal hover:underline">
                        {msg.senderName || 'Unknown'}
                      </Link>
                      {getRoleBadge(msg.senderId)}
                    </div>
                  )}

                  {/* Reply preview */}
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
                            onClick={(e) => { e.stopPropagation(); window.open(getOptimizedImageUrl(msg.image), '_blank'); }}
                            referrerPolicy="no-referrer"
                            onLoad={scrollToBottom}
                          />
                        </div>
                      )}
                      {msg.text && <MessageText text={msg.text} />}
                    </>
                  )}

                  <div className={`text-[10px] mt-1.5 opacity-30 ${isMe ? 'text-right' : 'text-left'}`}>
                    {msg.createdAt?.toDate?.()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '...'}
                  </div>

                  {/* Message context menu */}
                  {selectedMessageId === msg.id && (
                    <div className={`absolute top-full mt-1 ${isMe ? 'right-0' : 'left-0'} z-20 w-48 bg-surface-card rounded-xl shadow-2xl border flex flex-col overflow-hidden`} style={{ borderColor: 'var(--color-border)' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setReplyingTo(msg); setSelectedMessageId(null); }}
                        className="px-4 py-3 text-left text-sm font-medium text-luxury-ink hover:bg-surface-soft transition-colors flex items-center gap-2"
                      >
                        <CornerDownRight size={16} className="opacity-60" /> Reply
                      </button>
                      {isLeadOrCo && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePinMessage(msg.id, msg.text); }}
                          className="px-4 py-3 text-left text-sm font-medium text-luxury-ink hover:bg-surface-soft transition-colors flex items-center gap-2 border-t border-luxury-ink/5"
                        >
                          <Pin size={16} className="opacity-60" /> Pin
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsSelectMode(true);
                          setSelectedMessages(new Set([msg.id]));
                          setSelectedMessageId(null);
                        }}
                        className="px-4 py-3 text-left text-sm font-medium text-luxury-ink hover:bg-surface-soft transition-colors flex items-center gap-2 border-t border-luxury-ink/5"
                      >
                        <CheckCircle2 size={16} className="opacity-60" /> Select
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirmMsgId(msg.id); }}
                        className="px-4 py-3 text-left text-sm font-medium text-luxury-ink hover:bg-surface-soft transition-colors flex items-center gap-2 border-t border-luxury-ink/5"
                      >
                        <X size={16} className="opacity-60" /> Delete for me
                      </button>
                      {/* Lead/co-lead or own message → delete for everyone */}
                      {(isMe || isLeadOrCo) && !isDeleted && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteEveryoneConfirmMsgId(msg.id); }}
                          className="px-4 py-3 text-left text-sm font-medium text-red-500 hover:bg-red-50 transition-colors border-t border-luxury-ink/5 flex items-center gap-2"
                        >
                          <Trash2 size={16} /> Delete for everyone
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {isSelectMode && isMe && (
                  <button onClick={() => toggleMessageSelection(msg.id)} className="p-1 shrink-0 mt-2">
                    {isSelected ? <CheckCircle2 className="text-brand-teal" size={18} /> : <Circle className="text-luxury-ink/20" size={18} />}
                  </button>
                )}
              </motion.div>
            );
          })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input / Select Mode / Announcement mode */}
      <div className="px-3 py-3 pb-safe chat-bg">
        {isSelectMode ? (
          <div className="flex items-center justify-between bg-surface-card rounded-2xl px-4 py-3 shadow-lg border" style={{ borderColor: 'var(--color-border)' }}>
            <div className="text-sm font-bold text-luxury-ink">{selectedMessages.size} selected</div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setIsSelectMode(false); setSelectedMessages(new Set()); }}
                className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-surface-soft transition-colors text-luxury-ink/60">Cancel</button>
              <button onClick={handleBulkCopy} disabled={selectedMessages.size === 0}
                className="p-2.5 rounded-xl text-luxury-ink hover:bg-surface-soft transition-colors disabled:opacity-50"><Copy size={18} /></button>
              <button onClick={handleBulkDelete} disabled={selectedMessages.size === 0}
                className="p-2.5 rounded-xl text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"><Trash2 size={18} /></button>
            </div>
          </div>
        ) : !canPost ? (
          <div className="text-center py-4 bg-surface-card rounded-2xl border border-luxury-ink/5 shadow-lg">
            <p className="text-sm font-bold text-luxury-ink/40 flex items-center justify-center gap-2">
              <Lock size={14} /> Only leads can send messages in this club
            </p>
          </div>
        ) : (
          <div className="relative">
            {replyingTo && (
              <div className="mb-2 bg-surface-card border rounded-2xl px-4 py-3 flex items-start justify-between shadow-md" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex-1 overflow-hidden">
                  <div className="text-[10px] font-bold text-brand-teal uppercase tracking-widest mb-1 flex items-center gap-1">
                    <CornerDownRight size={10} /> Replying to {replyingTo.senderName}
                  </div>
                  <div className="text-sm text-luxury-ink/70 line-clamp-1">{replyingTo.text || '📷 Image'}</div>
                </div>
                <button type="button" onClick={() => setReplyingTo(null)} className="p-1 hover:bg-surface-soft rounded-full shrink-0 ml-2">
                  <X size={16} className="text-luxury-ink/50" />
                </button>
              </div>
            )}

            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />

              {/* Camera button — outside pill */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="p-3 rounded-full bg-surface-card border border-luxury-ink/10 text-brand-teal hover:bg-brand-teal/10 transition-all shrink-0 disabled:opacity-50 shadow-md"
              >
                {isUploading ? (
                  <div className="w-5 h-5 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Camera size={20} />
                )}
              </button>

              {/* Input pill */}
              <div className="flex-1 flex items-center bg-surface-card rounded-full border border-luxury-ink/10 shadow-md px-4" style={{ borderColor: 'var(--color-border)' }}>
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder={isUploading ? 'Uploading...' : 'Type your message...'}
                  disabled={isUploading}
                  className="flex-1 bg-transparent py-3.5 text-sm font-medium focus:outline-none text-luxury-ink placeholder:text-luxury-ink/30"
                />
              </div>

              {/* Send button — outside pill */}
              <button
                type="submit"
                disabled={!newMessage.trim() || isUploading}
                className="p-3 bg-brand-teal text-white rounded-full hover:opacity-90 transition-all shadow-md disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
              >
                <Send size={18} />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Delete For Me Modal */}
      <AnimatePresence>
        {deleteConfirmMsgId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-200 flex items-center justify-center p-4 bg-luxury-ink/20 backdrop-blur-sm"
            onClick={() => setDeleteConfirmMsgId(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="theme-card w-full max-w-sm rounded-3xl p-6 shadow-2xl border" style={{ borderColor: 'var(--color-border)' }}
              onClick={(e) => e.stopPropagation()}>
              <h3 className="text-xl font-bold text-luxury-ink mb-2">Delete Message</h3>
              <p className="text-luxury-ink/60 text-sm mb-6">Delete this message for yourself?</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleteConfirmMsgId(null)} className="px-5 py-2.5 rounded-full text-sm font-bold text-luxury-ink/60 hover:bg-surface-soft">Cancel</button>
                <button onClick={() => handleDeleteForMe(deleteConfirmMsgId!)} className="px-5 py-2.5 bg-red-500 text-white rounded-full text-sm font-bold hover:bg-red-600 shadow-lg">Delete</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete For Everyone Modal */}
      <AnimatePresence>
        {deleteEveryoneConfirmMsgId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-200 flex items-center justify-center p-4 bg-luxury-ink/20 backdrop-blur-sm"
            onClick={() => setDeleteEveryoneConfirmMsgId(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="theme-card w-full max-w-sm rounded-3xl p-6 shadow-2xl border" style={{ borderColor: 'var(--color-border)' }}
              onClick={(e) => e.stopPropagation()}>
              <h3 className="text-xl font-bold text-red-500 mb-2">Delete for Everyone</h3>
              <p className="text-luxury-ink/60 text-sm mb-6">This message will be permanently deleted for all club members.</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleteEveryoneConfirmMsgId(null)} className="px-5 py-2.5 rounded-full text-sm font-bold text-luxury-ink/60 hover:bg-surface-soft">Cancel</button>
                <button onClick={() => handleDeleteForEveryone(deleteEveryoneConfirmMsgId!)} className="px-5 py-2.5 bg-red-500 text-white rounded-full text-sm font-bold hover:bg-red-600 shadow-lg">Delete for everyone</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
