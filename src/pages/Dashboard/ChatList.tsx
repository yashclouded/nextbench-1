import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, User, ShieldCheck, ChevronRight, Search, Lock, Plus, X, Send } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, getDoc, doc, getDocs, limit } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { getOptimizedImageUrl } from '../../lib/utils';
import { getOrCreateDMRoom } from '../../lib/dm';
import { useScrollLock } from '../../hooks/useScrollLock';
import { useBlockedIds, useBlockedByIds } from '../../lib/blocks';

interface ChatRoom {
  id: string;
  participants: string[];
  lastMessage?: string;
  lastSenderId?: string;
  updatedAt: any;
  productTitle: string;
  productId?: string;
  type?: string;
  otherUser?: any;
  unreadBy?: string[];
}

export default function ChatList() {
  const { user, userData } = useAuth();
  const navigate = useNavigate();
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewDM, setShowNewDM] = useState(false);
  const [searchUsers, setSearchUsers] = useState('');
  const [userResults, setUserResults] = useState<any[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [creatingDM, setCreatingDM] = useState(false);

  const blockedIds = useBlockedIds();
  const blockedByIds = useBlockedByIds();

  useScrollLock(showNewDM);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!user) return;

    const userCache: { [key: string]: any } = {};

    const q = query(
      collection(db, 'chatRooms'),
      where('participants', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        const rooms: ChatRoom[] = [];

        // 1. Identify uncached users
        const uncachedUserIds = new Set<string>();
        for (const roomDoc of snapshot.docs) {
          const data = roomDoc.data() as ChatRoom;
          const otherUserId = data.participants.find(id => id !== user.uid);
          if (otherUserId && !userCache[otherUserId]) {
            uncachedUserIds.add(otherUserId);
          }
        }

        // 2. Fetch missing users concurrently
        if (uncachedUserIds.size > 0) {
          const fetchPromises = Array.from(uncachedUserIds).map(async (userId) => {
            const uDoc = await getDoc(doc(db, 'users', userId));
            userCache[userId] = uDoc.data();
          });
          await Promise.all(fetchPromises);
        }

        // 3. Build room list
        for (const roomDoc of snapshot.docs) {
          const data = roomDoc.data() as ChatRoom;
          const otherUserId = data.participants.find(id => id !== user.uid);
          
          if (otherUserId) {
            rooms.push({ id: roomDoc.id, ...data, otherUser: userCache[otherUserId] });
          }
        }
        
        // Sort rooms in memory by updatedAt descending
        rooms.sort((a, b) => {
          const timeA = a.updatedAt?.toMillis?.() || 0;
          const timeB = b.updatedAt?.toMillis?.() || 0;
          return timeB - timeA;
        });

        setChatRooms(rooms);
      } catch (err) {
        console.error("Error processing chat rooms:", err);
      } finally {
        setLoading(false);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'chatRooms');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Search users for new DM
  useEffect(() => {
    if (!showNewDM) {
      setUserResults([]);
      return;
    }
    
    setSearchingUsers(true);
    
    let q;
    if (searchUsers.trim()) {
      // First letter capitalized to help with common case-sensitivity issues
      let searchTerm = searchUsers.trim();
      searchTerm = searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1);
      const endStr = searchTerm + '\uf8ff';
      
      q = query(
        collection(db, 'users'),
        where('name', '>=', searchTerm),
        where('name', '<=', endStr),
        limit(20)
      );
    } else {
      // If empty search, just load 20 recent users
      q = query(
        collection(db, 'users'),
        limit(20)
      );
    }

    const unsub = onSnapshot(q, (snap) => {
      const results: any[] = [];
      snap.forEach(d => {
        if (d.id !== user?.uid) {
          results.push({ id: d.id, ...d.data() });
        }
      });
      setUserResults(results);
      setSearchingUsers(false);
    }, (err) => {
      console.error('Error fetching users:', err);
      setSearchingUsers(false);
    });

    return () => unsub();
  }, [searchUsers, showNewDM, user]);

  const handleStartDM = async (otherUserId: string) => {
    if (!user || creatingDM) return;
    setCreatingDM(true);
    try {
      const roomId = await getOrCreateDMRoom(user.uid, otherUserId);
      setShowNewDM(false);
      setSearchUsers('');
      navigate(`/chat/${roomId}`);
    } catch (err) {
      console.error('Failed to create DM:', err);
    } finally {
      setCreatingDM(false);
    }
  };

  if (userData && !userData.verified) {
    return (
      <div className="pt-32 pb-20 px-6 max-w-4xl mx-auto text-center">
        <div className="bg-surface-card rounded-3xl p-20 luxury-shadow border border-luxury-ink/5">
          <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Lock className="text-amber-500" size={32} />
          </div>
          <h3 className="text-2xl font-serif font-bold text-luxury-ink mb-2 italic">Verification <span className="not-italic">Required</span></h3>
          <p className="text-luxury-ink/40 text-sm max-w-sm mx-auto mb-8 font-medium">To keep our campus safe, you must be a verified student to access direct messaging.</p>
          <Link to="/verification" className="inline-block bg-brand-teal text-white px-8 py-4 rounded-full font-bold hover:bg-brand-mint transition-all luxury-shadow uppercase text-[10px] tracking-widest">
            Complete Verification
          </Link>
        </div>
      </div>
    );
  }

  const [chatSearchTerm, setChatSearchTerm] = useState('');

  const filteredChatRooms = chatRooms.filter((room) => {
    const otherUserId = room.participants.find(id => id !== user?.uid);
    if (!otherUserId) return true;
    if (blockedIds.has(otherUserId) || blockedByIds.has(otherUserId)) return false;
    
    if (chatSearchTerm.trim()) {
      const name = room.otherUser?.name?.toLowerCase() || '';
      return name.includes(chatSearchTerm.toLowerCase());
    }
    return true;
  });

  return (
    <div className="pb-20 max-w-2xl mx-auto min-h-screen">
      {/* Header and Search */}
      <div className="sticky top-0 z-40 bg-surface-base px-4 md:px-0 pt-6 pb-4 border-b border-luxury-ink/5">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold text-luxury-ink">Chats</h1>
          <button
            onClick={() => setShowNewDM(true)}
            className="p-2 text-brand-teal bg-brand-teal/10 rounded-full hover:bg-brand-teal/20 transition-colors"
          >
            <Plus size={24} />
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-luxury-ink/40" size={18} />
          <input 
            type="text" 
            placeholder="Search"
            value={chatSearchTerm}
            onChange={(e) => setChatSearchTerm(e.target.value)}
            className="w-full bg-surface-soft border-none rounded-xl py-2.5 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-brand-teal/20 transition-all text-sm font-medium"
          />
        </div>
      </div>

      <div className="mt-2">
        {loading ? (
          <div className="py-20 text-center font-serif italic text-luxury-ink/40">Loading messages...</div>
        ) : filteredChatRooms.length === 0 ? (
          <div className="py-20 text-center px-4">
            <div className="w-16 h-16 bg-brand-teal/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="text-brand-teal" size={32} />
            </div>
            <h3 className="text-xl font-bold text-luxury-ink mb-2">No messages</h3>
            <p className="text-luxury-ink/50 text-sm mb-6">Start a conversation by searching for someone.</p>
            <button
              onClick={() => setShowNewDM(true)}
              className="inline-block bg-luxury-ink text-surface-base px-6 py-3 rounded-full font-bold hover:opacity-80 transition-opacity text-sm"
            >
              New Message
            </button>
          </div>
        ) : (
          filteredChatRooms.map((room) => {
            const isDM = room.type === 'dm' || !room.productTitle;
            const isUnread = room.unreadBy?.includes(user?.uid || '');
            return (
              <Link 
                to={`/chat/${room.id}`} 
                key={room.id}
                className="block group px-2 md:px-0"
              >
                <div className="flex items-center gap-4 py-3 group-hover:bg-surface-soft rounded-2xl px-2 transition-colors cursor-pointer">
                  <div className="relative shrink-0">
                    <div className="w-14 h-14 rounded-full bg-brand-teal/5 flex items-center justify-center overflow-hidden">
                      {room.otherUser?.profilePicture ? (
                        <img src={getOptimizedImageUrl(room.otherUser.profilePicture)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <User size={24} className="text-brand-teal" />
                      )}
                    </div>
                    {room.otherUser?.verified && (
                      <div className="absolute bottom-0 right-0 bg-brand-teal text-white p-0.5 rounded-full border-2 border-surface-base">
                        <ShieldCheck size={10} />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 py-1 border-b border-luxury-ink/5 group-hover:border-transparent transition-colors">
                    <div className="flex items-center justify-between mb-0.5">
                      <h3 className={`truncate text-base ${isUnread ? 'font-bold text-brand-teal' : 'font-semibold text-luxury-ink'}`}>
                        {room.otherUser?.name || 'Unknown User'}
                      </h3>
                      <span className={`text-xs whitespace-nowrap ml-2 ${isUnread ? 'text-brand-teal font-bold' : 'text-luxury-ink/40'}`}>
                        {room.updatedAt?.toDate().toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <p className={`text-sm truncate flex-1 ${isUnread ? 'text-luxury-ink font-semibold' : 'text-luxury-ink/60'}`}>
                        {!isDM && <span className="text-brand-teal font-medium mr-1 text-xs">[{room.productTitle}]</span>}
                        {room.lastSenderId === user?.uid ? 'You: ' : ''}{room.lastMessage || 'Start the conversation...'}
                      </p>
                      {isUnread && (
                        <div className="w-2.5 h-2.5 bg-brand-teal rounded-full shrink-0 mt-1 shadow-sm"></div>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>

      {/* New DM Modal */}
      <AnimatePresence>
        {showNewDM && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-luxury-ink/20 backdrop-blur-sm"
            onClick={() => { setShowNewDM(false); setSearchUsers(''); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="theme-card rounded-3xl w-full max-w-md shadow-2xl border border-luxury-ink/5 max-h-[70vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-luxury-ink/5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-luxury-ink">New Message</h3>
                  <button
                    onClick={() => { setShowNewDM(false); setSearchUsers(''); }}
                    className="p-2 text-luxury-ink/40 hover:text-luxury-ink rounded-full transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-luxury-ink/20" size={16} />
                  <input
                    type="text"
                    value={searchUsers}
                    onChange={(e) => setSearchUsers(e.target.value)}
                    placeholder="Search by name..."
                    autoFocus
                    className="w-full bg-surface-base border border-luxury-ink/5 rounded-xl py-3.5 pl-11 pr-4 focus:outline-none focus:border-brand-teal text-sm font-medium"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {searchingUsers ? (
                  <div className="py-8 text-center">
                    <div className="w-6 h-6 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto" />
                  </div>
                ) : userResults.length > 0 ? (
                  <div className="space-y-1">
                    {userResults.map(u => (
                      <button
                        key={u.id}
                        onClick={() => handleStartDM(u.id)}
                        disabled={creatingDM}
                        className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-surface-soft transition-all text-left disabled:opacity-50"
                      >
                        <div className="w-12 h-12 rounded-full bg-brand-teal/5 flex items-center justify-center overflow-hidden border border-luxury-ink/5 shrink-0">
                          {u.profilePicture ? (
                            <img src={getOptimizedImageUrl(u.profilePicture)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <span className="text-brand-teal font-serif font-bold text-lg">{u.name?.[0]?.toUpperCase()}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-luxury-ink text-sm flex items-center gap-1.5">
                            {u.name}
                            {u.verified && <ShieldCheck size={14} className="text-brand-teal" />}
                          </p>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30 truncate">{u.school}</p>
                        </div>
                        <Send size={16} className="text-luxury-ink/20" />
                      </button>
                    ))}
                  </div>
                ) : searchUsers.trim() ? (
                  <div className="py-8 text-center">
                    <p className="text-luxury-ink/30 text-sm font-medium">No users found</p>
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <User className="mx-auto text-luxury-ink/10 mb-3" size={40} />
                    <p className="text-luxury-ink/30 text-sm font-medium">Type a name to find someone</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
