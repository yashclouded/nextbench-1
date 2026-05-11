import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { MessageSquare, User, ShieldCheck, ChevronRight, Search } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, getDoc, doc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';

interface ChatRoom {
  id: string;
  participants: string[];
  lastMessage?: string;
  lastSenderId?: string;
  updatedAt: any;
  productTitle: string;
  otherUser?: any;
}

export default function ChatList() {
  const { user } = useAuth();
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'chatRooms'),
      where('participants', 'array-contains', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const rooms: ChatRoom[] = [];
      const userCache: { [key: string]: any } = {};

      for (const roomDoc of snapshot.docs) {
        const data = roomDoc.data() as ChatRoom;
        const otherUserId = data.participants.find(id => id !== user.uid);
        
        if (otherUserId) {
          if (!userCache[otherUserId]) {
            const uDoc = await getDoc(doc(db, 'users', otherUserId));
            userCache[otherUserId] = uDoc.data();
          }
          rooms.push({ id: roomDoc.id, ...data, otherUser: userCache[otherUserId] });
        }
      }
      
      setChatRooms(rooms);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'chatRooms');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  return (
    <div className="pt-32 pb-20 px-6 max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-serif font-bold text-luxury-ink italic mb-2">Conversations</h1>
          <p className="text-luxury-ink/40 font-medium uppercase text-[10px] tracking-[0.2em]">Secure campus messaging</p>
        </div>

        <div className="relative w-full md:w-72 group">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-luxury-ink/20 group-focus-within:text-brand-teal transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Search chats..."
            className="w-full bg-white border border-luxury-ink/5 rounded-2xl py-4 pl-14 pr-6 focus:outline-none focus:border-brand-teal transition-all text-sm font-medium luxury-shadow"
          />
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="py-20 text-center font-serif italic text-luxury-ink/40">Opening your letters...</div>
        ) : chatRooms.length === 0 ? (
          <div className="bg-white rounded-3xl p-20 text-center luxury-shadow border border-luxury-ink/5">
            <div className="w-16 h-16 bg-brand-teal/5 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <MessageSquare className="text-brand-teal" size={32} />
            </div>
            <h3 className="text-xl font-serif font-bold text-luxury-ink mb-2 italic">Quiet at the <span className="not-italic">Table</span></h3>
            <p className="text-luxury-ink/40 text-sm max-w-xs mx-auto mb-8 font-medium">Start a conversation by reaching out to a seller in the marketplace.</p>
            <Link to="/marketplace" className="inline-block bg-luxury-ink text-white px-8 py-4 rounded-full font-bold hover:bg-brand-teal transition-all luxury-shadow uppercase text-[10px] tracking-widest">
              Browse Marketplace
            </Link>
          </div>
        ) : (
          chatRooms.map((room) => (
            <Link 
              to={`/chat/${room.id}`} 
              key={room.id}
              className="block group"
            >
              <div className="bg-white rounded-3xl p-6 md:p-8 luxury-shadow border border-luxury-ink/5 flex items-center gap-6 transition-all group-hover:bg-brand-teal/[0.02] group-hover:translate-x-2">
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-brand-teal/5 flex items-center justify-center overflow-hidden border border-luxury-ink/5 bg-surface-soft">
                    {room.otherUser?.profilePicture ? (
                      <img src={room.otherUser.profilePicture} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User size={24} className="text-brand-teal" />
                    )}
                  </div>
                  {room.otherUser?.verified && (
                    <div className="absolute -bottom-1 -right-1 bg-brand-teal text-white p-1 rounded-lg border-2 border-white">
                      <ShieldCheck size={12} />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-bold text-luxury-ink truncate text-lg">
                      {room.otherUser?.name || 'Unknown User'}
                    </h3>
                    <span className="text-[10px] font-bold text-luxury-ink/30 uppercase tracking-widest">
                      {room.updatedAt?.toDate().toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-brand-teal mb-2 italic">
                    {room.productTitle}
                  </p>
                  <p className="text-sm text-luxury-ink/50 font-medium truncate italic pr-10">
                    {room.lastSenderId === user?.uid ? 'You: ' : ''}{room.lastMessage || 'Start the conversation...'}
                  </p>
                </div>

                <div className="text-luxury-ink/10 group-hover:text-brand-teal transition-colors">
                  <ChevronRight size={24} />
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
