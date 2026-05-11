import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Send, ArrowLeft, MoreVertical, ShieldCheck, User, Package, Phone, Flag } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { useToast } from '../../lib/ToastContext';

interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: any;
}

interface ChatRoomData {
  participants: string[];
  productId: string;
  productTitle: string;
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
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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
            if (userDoc.exists()) setOtherUser(userDoc.data());
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `chatRooms/${roomId}`);
      }
    };
    fetchRoom();

    const q = query(collection(db, 'chatRooms', roomId, 'messages'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((doc) => msgs.push({ id: doc.id, ...doc.data() } as Message));
      setMessages(msgs);
      setTimeout(scrollToBottom, 100);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `chatRooms/${roomId}/messages`);
    });

    return () => unsubscribe();
  }, [roomId, user]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || !user || !roomId) return;
    const messageText = text.trim();
    setNewMessage('');
    setShowQuickReplies(false);

    try {
      await addDoc(collection(db, 'chatRooms', roomId, 'messages'), {
        senderId: user.uid,
        text: messageText,
        createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'chatRooms', roomId), {
        lastMessage: messageText,
        lastSenderId: user.uid,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `chatRooms/${roomId}/messages`);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(newMessage);
  };

  if (!user || !otherUser) return (
    <div className="pt-32 text-center">
      <div className="w-10 h-10 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="text-luxury-ink/30 text-xs font-bold uppercase tracking-widest">Loading conversation...</p>
    </div>
  );

  return (
    <div className="pt-24 h-screen flex flex-col bg-surface-base">
      {/* Header */}
      <div className="bg-white border-b border-luxury-ink/5 px-4 md:px-6 py-3 flex items-center justify-between luxury-shadow z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/messages')} className="p-2 hover:bg-surface-soft rounded-full transition-all">
            <ArrowLeft size={20} className="text-luxury-ink" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-teal/5 flex items-center justify-center overflow-hidden border border-luxury-ink/5">
              {otherUser.profilePicture ? (
                <img src={otherUser.profilePicture} alt={otherUser.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <User size={20} className="text-brand-teal" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-luxury-ink flex items-center gap-1.5 leading-none mb-0.5 text-sm">
                {otherUser.name}
                {otherUser.verified && <ShieldCheck size={14} className="text-brand-teal" />}
              </h3>
              {roomData?.productTitle && (
                <Link to={`/product/${roomData.productId}`} className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 hover:text-brand-pink transition-colors flex items-center gap-1">
                  <Package size={10} /> {roomData.productTitle}
                </Link>
              )}
            </div>
          </div>
        </div>
        <div className="relative">
          <button onClick={() => setShowOptions(!showOptions)} className="p-2 hover:bg-surface-soft rounded-full transition-all">
            <MoreVertical size={20} className="text-luxury-ink/30" />
          </button>
          {showOptions && (
            <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-2xl border border-luxury-ink/5 py-2 w-48 z-20">
              {roomData?.productId && (
                <Link to={`/product/${roomData.productId}`} onClick={() => setShowOptions(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-luxury-ink hover:bg-surface-soft transition-all">
                  <Package size={16} className="text-brand-teal" /> View Listing
                </Link>
              )}
              <button onClick={() => { showToast('Report submitted', 'success'); setShowOptions(false); }}
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-50 transition-all w-full">
                <Flag size={16} /> Report Chat
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-luxury-ink/20 font-serif italic text-lg mb-2">Start the conversation</p>
            <p className="text-luxury-ink/10 text-xs font-bold uppercase tracking-widest">Messages are end-to-end secured</p>
          </div>
        )}
        {messages.map((msg) => {
          const isMe = msg.senderId === user.uid;
          return (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={msg.id}
              className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[75%] px-5 py-3.5 rounded-2xl text-sm font-medium luxury-shadow ${
                isMe 
                  ? 'bg-luxury-ink text-white rounded-tr-sm' 
                  : 'bg-white text-luxury-ink rounded-tl-sm border border-luxury-ink/5'
              }`}>
                {msg.text}
                <div className={`text-[10px] mt-1.5 opacity-30 ${isMe ? 'text-right' : 'text-left'}`}>
                  {msg.createdAt?.toDate?.()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '...'}
                </div>
              </div>
            </motion.div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Replies */}
      {showQuickReplies && (
        <div className="px-4 md:px-6 pb-2">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {QUICK_MESSAGES.map((msg, i) => (
              <button key={i} onClick={() => sendMessage(msg)}
                className="whitespace-nowrap px-4 py-2 bg-white border border-luxury-ink/5 rounded-full text-xs font-medium text-luxury-ink/60 hover:bg-brand-teal/5 hover:text-brand-teal hover:border-brand-teal/20 transition-all luxury-shadow">
                {msg}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 md:p-6 bg-white border-t border-luxury-ink/5">
        <form onSubmit={handleSendMessage} className="relative flex items-center gap-2">
          <button type="button" onClick={() => setShowQuickReplies(!showQuickReplies)}
            className={`p-3 rounded-xl border transition-all shrink-0 ${showQuickReplies ? 'bg-brand-teal text-white border-brand-teal' : 'border-luxury-ink/5 text-luxury-ink/20 hover:text-brand-teal'}`}
            title="Quick replies">
            ⚡
          </button>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 bg-surface-base border border-luxury-ink/5 rounded-2xl py-4 px-6 focus:outline-none focus:border-brand-teal transition-all text-sm font-medium"
          />
          <button type="submit" disabled={!newMessage.trim()}
            className="p-3.5 bg-luxury-ink text-white rounded-xl hover:bg-brand-teal transition-all shadow-lg disabled:opacity-30 disabled:cursor-not-allowed shrink-0">
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
