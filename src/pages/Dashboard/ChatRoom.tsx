import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Send, ArrowLeft, MoreVertical, ShieldCheck, User, Package, Phone, Flag, Camera, X, Image as ImageIcon, CornerDownRight, Pin, CheckCircle2, Circle, Copy, Trash2 } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDoc, where, getDocs, writeBatch, arrayUnion, arrayRemove, limit } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { useToast } from '../../lib/ToastContext';
import { uploadChatImage } from '../../lib/storage';
import { getOptimizedImageUrl } from '../../lib/utils';
import { createNotification } from '../../lib/notifications';
import { useBlockedIds, useBlockedByIds } from '../../lib/blocks';
import ReportModal from '../../components/ui/ReportModal';


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
}

interface ChatRoomData {
  participants: string[];
  productId?: string;
  productTitle?: string;
  type?: string;
  pinnedMessageId?: string;
  pinnedMessageText?: string;
  unreadBy?: string[];
}

const QUICK_MESSAGES = [
  'Is this still available?',
  'Can we meet today?',
  'Can you do a lower price?',
  'I\'ll take it!',
];

export default function ChatRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user, userData } = useAuth();
  const { showToast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [roomData, setRoomData] = useState<ChatRoomData | null>(null);
  const [otherUser, setOtherUser] = useState<any>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const blockedIds = useBlockedIds();
  const blockedByIds = useBlockedByIds();

  const isBlockedByMe = otherUser ? blockedIds.has(otherUser.id) : false;
  const hasBlockedMe = otherUser ? blockedByIds.has(otherUser.id) : false;
  const isBlocked = isBlockedByMe || hasBlockedMe;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!roomId || !user) return;

    const fetchRoom = async () => {
      try {
        const roomDoc = await getDoc(doc(db, 'chatRooms', roomId));
        if (roomDoc.exists()) {
          const data = roomDoc.data() as ChatRoomData;
          setRoomData(data);
          const otherUserId = data.participants.find(id => id !== user.uid);
          if (otherUserId) {
            const userDoc = await getDoc(doc(db, 'users', otherUserId));
            if (userDoc.exists()) setOtherUser({ id: otherUserId, ...userDoc.data() });
          }
          
          if (data.unreadBy && data.unreadBy.includes(user.uid)) {
            updateDoc(doc(db, 'chatRooms', roomId), {
              unreadBy: arrayRemove(user.uid)
            }).catch(console.error);
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `chatRooms/${roomId}`);
      }
    };
    fetchRoom();

    const q = query(collection(db, 'chatRooms', roomId, 'messages'), orderBy('createdAt', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((doc) => msgs.push({ id: doc.id, ...doc.data() } as Message));
      setMessages(msgs.reverse());
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `chatRooms/${roomId}/messages`);
    });

    // Mark notifications as read
    const markMessagesAsRead = async () => {
      try {
        const notifQ = query(
          collection(db, 'notifications'),
          where('userId', '==', user.uid),
          where('read', '==', false)
        );
        const notifSnap = await getDocs(notifQ);
        if (!notifSnap.empty) {
          const batch = writeBatch(db);
          let hasUpdates = false;
          notifSnap.docs.forEach(d => {
            const data = d.data();
            if (data.type === 'new_message' && data.link === `/chat/${roomId}`) {
              batch.update(d.ref, { read: true });
              hasUpdates = true;
            }
          });
          if (hasUpdates) {
            await batch.commit();
          }
        }
      } catch (err) {
        console.error("Failed to mark notifications as read", err);
      }
    };
    markMessagesAsRead();

    return () => unsubscribe();
  }, [roomId, user]);

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    // Aggressive strict scroll to bottom 
    let attempts = 0;
    const interval = setInterval(() => {
      scrollToBottom();
      attempts++;
      if (attempts > 10) clearInterval(interval);
    }, 50);
    
    return () => clearInterval(interval);
  }, [messages]);

  const sendMessage = async (text?: string, image?: string) => {
    if ((!text?.trim() && !image) || !user || !roomId) return;
    
    const messageText = text?.trim();
    setNewMessage('');
    setShowQuickReplies(false);
    
    const currentReply = replyingTo;
    setReplyingTo(null);

    try {
      const msgData: any = {
        senderId: user.uid,
        createdAt: serverTimestamp()
      };
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
        updatedAt: serverTimestamp()
      };
      
      const recipientId = roomData?.participants?.find((id: string) => id !== user.uid);
      if (recipientId) {
        updateData.unreadBy = arrayUnion(recipientId);
      }

      await updateDoc(doc(db, 'chatRooms', roomId), updateData);

      if (roomData?.participants) {
        const recipientId = roomData.participants.find((id: string) => id !== user.uid);
        if (recipientId) {
          createNotification({
            userId: recipientId,
            type: 'new_message',
            title: 'New Message',
            message: `${userData?.name || 'Someone'} sent you a message: ${messageText || '📷 Image'}`,
            link: `/chat/${roomId}`
          });
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `chatRooms/${roomId}/messages`);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !roomId) return;
    const file = e.target.files[0];
    
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be less than 5MB', 'error');
      return;
    }

    setIsUploading(true);
    try {
      const imageUrl = await uploadChatImage(file, roomId);
      await sendMessage(undefined, imageUrl);
    } catch (err) {
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
    if (!user || !roomId) return;
    try {
      await updateDoc(doc(db, 'chatRooms', roomId, 'messages', msgId), {
        deletedFor: arrayUnion(user.uid)
      });
    } catch (err) {
      showToast('Failed to delete message', 'error');
    }
    setSelectedMessageId(null);
  };

  const handleDeleteForEveryone = async (msgId: string) => {
    if (!user || !roomId) return;
    try {
      await updateDoc(doc(db, 'chatRooms', roomId, 'messages', msgId), {
        isDeletedForEveryone: true,
        text: '',
        image: ''
      });
    } catch (err) {
      showToast('Failed to delete message', 'error');
    }
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
          batch.update(doc(db, 'chatRooms', roomId, 'messages', msg.id), {
            deletedFor: arrayUnion(user.uid)
          });
          count++;
        }
      });
      if (count > 0) {
        await batch.commit();
      }
      showToast('Chat cleared', 'success');
    } catch (err) {
      showToast('Failed to clear chat', 'error');
    }
    setShowOptions(false);
  };

  const handlePinMessage = async (msgId: string, text?: string) => {
    if (!user || !roomId) return;
    try {
      await updateDoc(doc(db, 'chatRooms', roomId), {
        pinnedMessageId: msgId,
        pinnedMessageText: text || '📷 Image',
        updatedAt: serverTimestamp()
      });
      showToast('Message pinned', 'success');
    } catch (err) {
      showToast('Failed to pin message', 'error');
    }
    setSelectedMessageId(null);
  };

  const handleUnpinMessage = async () => {
    if (!user || !roomId) return;
    try {
      await updateDoc(doc(db, 'chatRooms', roomId), {
        pinnedMessageId: null,
        pinnedMessageText: null,
        updatedAt: serverTimestamp()
      });
      showToast('Message unpinned', 'success');
    } catch (err) {
      showToast('Failed to unpin message', 'error');
    }
  };

  const toggleMessageSelection = (msgId: string) => {
    setSelectedMessages(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedMessages.size === 0 || !roomId || !user) return;
    if (!confirm(`Delete ${selectedMessages.size} messages?`)) return;

    try {
      const batch = writeBatch(db);
      let count = 0;
      selectedMessages.forEach(msgId => {
        batch.update(doc(db, 'chatRooms', roomId, 'messages', msgId), {
          deletedFor: arrayUnion(user.uid)
        });
        count++;
      });
      if (count > 0) await batch.commit();
      
      showToast('Messages deleted', 'success');
      setIsSelectMode(false);
      setSelectedMessages(new Set());
    } catch (err) {
      showToast('Failed to delete messages', 'error');
    }
  };

  const handleBulkCopy = () => {
    const textsToCopy = messages
      .filter(m => selectedMessages.has(m.id) && m.text)
      .map(m => m.text)
      .join('\n\n');
    
    if (textsToCopy) {
      navigator.clipboard.writeText(textsToCopy);
      showToast('Messages copied to clipboard', 'success');
    }
    setIsSelectMode(false);
    setSelectedMessages(new Set());
  };

  if (!user || !otherUser) return (
    <div className="pt-32 text-center">
      <div className="w-10 h-10 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="text-luxury-ink/30 text-xs font-bold uppercase tracking-widest">Loading conversation...</p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-surface-base">
      {/* Header */}
      <div className="theme-card border-b px-4 md:px-6 py-3 flex items-center justify-between z-10" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/messages')} className="p-2 hover:bg-surface-soft rounded-full transition-all">
            <ArrowLeft size={20} className="text-luxury-ink" />
          </button>
          <div className="flex items-center gap-3 p-2 -ml-2 rounded-xl transition-colors">
            <Link to={`/profile/${otherUser.id}`} className="w-10 h-10 rounded-xl bg-brand-teal/5 flex items-center justify-center overflow-hidden border border-luxury-ink/5 shrink-0 hover:opacity-80 transition-opacity">
              {otherUser.profilePicture ? (
                <img src={getOptimizedImageUrl(otherUser.profilePicture)} alt={otherUser.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <User size={20} className="text-brand-teal" />
              )}
            </Link>
            <div>
              <Link to={`/profile/${otherUser.id}`} className="font-bold text-luxury-ink flex items-center gap-1.5 leading-none mb-0.5 text-sm hover:text-brand-teal transition-colors">
                {otherUser.name}
                {otherUser.verified && <ShieldCheck size={14} className="text-brand-teal" />}
              </Link>
              {roomData?.productTitle && roomData?.productId ? (
                <Link to={`/product/${roomData.productId}`} className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 hover:text-brand-pink transition-colors flex items-center gap-1">
                  <Package size={10} /> {roomData.productTitle}
                </Link>
              ) : (
                <span className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 flex items-center gap-1">
                  Direct Message
                </span>
              )}
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
                <Link to={`/product/${roomData.productId}`} onClick={() => setShowOptions(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-luxury-ink hover:bg-surface-soft transition-all">
                  <Package size={16} className="text-brand-teal" /> View Listing
                </Link>
              )}
              <button onClick={handleClearChat}
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-luxury-ink hover:bg-surface-soft transition-all w-full border-b border-luxury-ink/5">
                <X size={16} /> Clear Chat
              </button>
              <button onClick={() => { setShowReport(true); setShowOptions(false); }}
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-all w-full">
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
            <div className="text-xs font-medium text-luxury-ink/70 truncate">
              {roomData.pinnedMessageText}
            </div>
          </div>
          <button onClick={handleUnpinMessage} className="p-1 hover:bg-surface-base rounded-full transition-colors shrink-0 ml-2">
            <X size={14} className="text-luxury-ink/40" />
          </button>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
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
              className={`flex ${isMe ? 'justify-end' : 'justify-start'} relative group items-center gap-2`}
            >
              {isSelectMode && !isMe && (
                <button onClick={() => toggleMessageSelection(msg.id)} className="p-2 shrink-0">
                  {isSelected ? <CheckCircle2 className="text-brand-teal" size={20}/> : <Circle className="text-luxury-ink/20" size={20}/>}
                </button>
              )}

              <div 
                onClick={() => {
                  if (isSelectMode) toggleMessageSelection(msg.id);
                  else setSelectedMessageId(selectedMessageId === msg.id ? null : msg.id);
                }}
                className={`max-w-[75%] px-5 py-3.5 rounded-2xl text-sm font-medium cursor-pointer relative ${
                isMe 
                  ? 'bg-luxury-ink text-surface-base rounded-tr-sm shadow-md' 
                  : 'theme-card text-luxury-ink rounded-tl-sm border'
              }`} style={!isMe ? { borderColor: 'var(--color-border)' } : undefined}>
                
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
                          className="max-w-full max-h-[300px] object-contain hover:opacity-90 transition-opacity"
                          onClick={(e) => { e.stopPropagation(); window.open(getOptimizedImageUrl(msg.image), '_blank'); }}
                          referrerPolicy="no-referrer"
                          onLoad={scrollToBottom}
                        />
                      </div>
                    )}
                    {msg.text && <p className="leading-relaxed">{msg.text}</p>}
                  </>
                )}

                <div className={`text-[10px] mt-1.5 opacity-30 ${isMe ? 'text-right' : 'text-left'}`}>
                  {msg.createdAt?.toDate?.()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '...'}
                </div>

                {/* Message Options Menu */}
                {selectedMessageId === msg.id && (
                  <div className={`absolute top-full mt-1 ${isMe ? 'right-0' : 'left-0'} z-20 w-48 bg-surface-card rounded-xl shadow-2xl border flex flex-col overflow-hidden`} style={{ borderColor: 'var(--color-border)' }}>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setReplyingTo(msg); setSelectedMessageId(null); }}
                      className="px-4 py-3 text-left text-sm font-medium text-luxury-ink hover:bg-surface-soft transition-colors flex items-center gap-2"
                    >
                      <CornerDownRight size={16} className="opacity-60" /> Reply
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handlePinMessage(msg.id, msg.text); }}
                      className="px-4 py-3 text-left text-sm font-medium text-luxury-ink hover:bg-surface-soft transition-colors flex items-center gap-2 border-t border-luxury-ink/5"
                    >
                      <Pin size={16} className="opacity-60" /> Pin
                    </button>
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
                      onClick={(e) => { e.stopPropagation(); handleDeleteForMe(msg.id); }}
                      className="px-4 py-3 text-left text-sm font-medium text-luxury-ink hover:bg-surface-soft transition-colors flex items-center gap-2 border-t border-luxury-ink/5"
                    >
                      <X size={16} className="opacity-60" /> Delete for me
                    </button>
                    {isMe && !isDeleted && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDeleteForEveryone(msg.id); }}
                        className="px-4 py-3 text-left text-sm font-medium text-red-500 hover:bg-red-50 transition-colors border-t border-luxury-ink/5 flex items-center gap-2"
                      >
                        <Flag size={16} /> Delete for everyone
                      </button>
                    )}
                  </div>
                )}
              </div>

              {isSelectMode && isMe && (
                <button onClick={() => toggleMessageSelection(msg.id)} className="p-2 shrink-0">
                  {isSelected ? <CheckCircle2 className="text-brand-teal" size={20}/> : <Circle className="text-luxury-ink/20" size={20}/>}
                </button>
              )}
            </motion.div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Replies */}
      {showQuickReplies && !isBlocked && (
        <div className="px-4 md:px-6 pb-2">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {QUICK_MESSAGES.map((msg, i) => (
              <button key={i} onClick={() => sendMessage(msg)}
                className="whitespace-nowrap px-4 py-2 theme-card border rounded-full text-xs font-medium text-luxury-ink/60 hover:bg-brand-teal/5 hover:text-brand-teal hover:border-brand-teal/20 transition-all" style={{ borderColor: 'var(--color-border)' }}>
                {msg}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input / Select Mode Actions */}
      <div className="p-4 md:p-6 theme-card border-t pb-safe" style={{ borderColor: 'var(--color-border)' }}>
        {isSelectMode ? (
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-luxury-ink">
              {selectedMessages.size} selected
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setIsSelectMode(false); setSelectedMessages(new Set()); }}
                className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-surface-soft transition-colors text-luxury-ink/60">
                Cancel
              </button>
              <button onClick={handleBulkCopy} disabled={selectedMessages.size === 0}
                className="p-2.5 rounded-xl text-luxury-ink hover:bg-surface-soft transition-colors disabled:opacity-50">
                <Copy size={18} />
              </button>
              <button onClick={handleBulkDelete} disabled={selectedMessages.size === 0}
                className="p-2.5 rounded-xl text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50">
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ) : isBlocked ? (
          <div className="text-center py-4 bg-surface-soft rounded-2xl border border-luxury-ink/5">
            <p className="text-sm font-bold text-luxury-ink/40">
              {isBlockedByMe ? "You have blocked this user." : "You cannot message this user."}
            </p>
          </div>
        ) : (
          <div className="relative">
            {replyingTo && (
              <div className="absolute bottom-full left-0 right-0 mb-4 bg-surface-card border rounded-xl p-3 flex items-start justify-between shadow-lg" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex-1 overflow-hidden">
                  <div className="text-[10px] font-bold text-brand-teal uppercase tracking-widest mb-1 flex items-center gap-1"><CornerDownRight size={10} /> Replying to</div>
                  <div className="text-sm text-luxury-ink/70 line-clamp-1">{replyingTo.text || '📷 Image'}</div>
                </div>
                <button type="button" onClick={() => setReplyingTo(null)} className="p-1 hover:bg-surface-soft rounded-full shrink-0 ml-2">
                  <X size={16} className="text-luxury-ink/50" />
                </button>
              </div>
            )}
            
            <form onSubmit={handleSendMessage} className="relative flex items-center gap-2">
            <input 
              type="file" 
            ref={fileInputRef} 
            onChange={handleImageUpload} 
            accept="image/*" 
            className="hidden" 
          />
          <button 
            type="button" 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="p-3.5 rounded-xl border border-luxury-ink/10 bg-surface-soft text-brand-teal hover:bg-brand-teal/10 hover:border-brand-teal/30 transition-all shrink-0 disabled:opacity-50"
            title="Send Image"
          >
            {isUploading ? (
              <div className="w-5 h-5 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
            ) : (
              <Camera size={20} className="fill-brand-teal/10" />
            )}
          </button>
          
          <button type="button" onClick={() => setShowQuickReplies(!showQuickReplies)}
            className={`p-3.5 rounded-xl border transition-all shrink-0 ${showQuickReplies ? 'bg-brand-teal text-white border-brand-teal' : 'bg-surface-soft border-luxury-ink/10 text-brand-teal hover:bg-brand-teal/10 hover:border-brand-teal/30'}`}
            title="Quick replies">
            ⚡
          </button>
          
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={isUploading ? "Uploading image..." : "Type your message..."}
            disabled={isUploading}
            className="flex-1 bg-surface-base border border-luxury-ink/5 rounded-2xl py-4 px-6 focus:outline-none focus:border-brand-teal transition-all text-sm font-medium"
          />
          <button type="submit" disabled={!newMessage.trim() || isUploading}
            className="p-3.5 bg-luxury-ink text-surface-base rounded-xl hover:bg-brand-teal transition-all shadow-lg disabled:opacity-30 disabled:cursor-not-allowed shrink-0">
            <Send size={18} />
          </button>
        </form>
        </div>
        )}
      </div>

      <ReportModal
        isOpen={showReport}
        onClose={() => setShowReport(false)}
        contentType="message"
        contentId={roomId || ''}
      />
    </div>
  );
}
