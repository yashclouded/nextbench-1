import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Send, Link as LinkIcon, CheckCircle2, ShieldCheck, User, Share2 } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, arrayUnion, limit, documentId } from 'firebase/firestore';
import { getOrCreateDMRoom } from '../../lib/dm';
import { useToast } from '../../lib/ToastContext';
import { getOptimizedImageUrl } from '../../lib/utils';
import { createNotification } from '../../lib/notifications';

interface SharedPostData {
  id: string;
  title: string;
  description: string;
  image?: string;
  authorName: string;
  kind?: 'post' | 'product';
}

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  postUrl: string;
  postTitle: string;
  sharedPost?: SharedPostData;
}

export default function ShareModal({ isOpen, onClose, postUrl, postTitle, sharedPost }: ShareModalProps) {
  const { user, userData } = useAuth();
  const { showToast } = useToast();
  const [searchUsers, setSearchUsers] = useState('');
  const [userResults, setUserResults] = useState<any[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [sendingTo, setSendingTo] = useState<Set<string>>(new Set());
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  // Fetch who the user follows when modal opens
  useEffect(() => {
    if (!isOpen || !user) return;
    const fetchFollowing = async () => {
      try {
        const q = query(collection(db, 'follows'), where('followerId', '==', user.uid));
        const snap = await getDocs(q);
        const ids = new Set<string>();
        snap.forEach(doc => ids.add(doc.data().followingId));
        setFollowingIds(ids);
      } catch (err) {
        console.error('Failed to fetch follows:', err);
      }
    };
    fetchFollowing();
  }, [isOpen, user]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSearchUsers('');
      setUserResults([]);
      setSendingTo(new Set());
      setSentTo(new Set());
      setCopied(false);
      return;
    }
    
    setSearchingUsers(true);
    let q;
    
    if (searchUsers.trim()) {
      let searchTerm = searchUsers.trim();
      searchTerm = searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1);
      const endStr = searchTerm + '\uf8ff';
      q = query(
        collection(db, 'users'),
        where('name', '>=', searchTerm),
        where('name', '<=', endStr),
        limit(20)
      );
    } else if (followingIds.size > 0) {
      const idsToFetch = Array.from(followingIds).slice(0, 30);
      q = query(collection(db, 'users'), where(documentId(), 'in', idsToFetch));
    } else {
      q = query(collection(db, 'users'), limit(20));
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
      console.error('Error fetching users for share:', err);
      setSearchingUsers(false);
    });

    return () => unsub();
  }, [searchUsers, isOpen, user, followingIds]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(postUrl);
    setCopied(true);
    showToast('Link copied to clipboard', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendToUser = async (otherUserId: string) => {
    if (!user) return;
    setSendingTo(prev => new Set(prev).add(otherUserId));

    try {
      const roomId = await getOrCreateDMRoom(user.uid, otherUserId);
      const chatPreviewText = sharedPost ? `Shared: ${postTitle}` : `Shared a link: ${postTitle}`;

      const messageData: any = {
        senderId: user.uid,
        createdAt: serverTimestamp(),
        text: ''
      };
      
      if (!sharedPost) {
        messageData.text = `${postTitle}\n${postUrl}`;
      } else {
        messageData.text = '';
      }

      if (sharedPost) {
        messageData.sharedPost = { ...sharedPost };
        Object.keys(messageData.sharedPost).forEach(key => {
          if (messageData.sharedPost[key] === undefined) {
            delete messageData.sharedPost[key];
          }
        });
      }

      await addDoc(collection(db, 'chatRooms', roomId, 'messages'), messageData);

      await updateDoc(doc(db, 'chatRooms', roomId), {
        lastMessage: chatPreviewText,
        lastSenderId: user.uid,
        updatedAt: serverTimestamp(),
        unreadBy: arrayUnion(otherUserId)
      });

      createNotification({
        userId: otherUserId,
        type: 'new_message',
        title: 'New Message',
        message: `${userData?.name || 'Someone'} shared a link with you`,
        link: `/chat/${roomId}`
      });

      setSentTo(prev => new Set(prev).add(otherUserId));
    } catch (err) {
      console.error('Failed to share:', err);
      showToast('Failed to send message', 'error');
    } finally {
      setSendingTo(prev => {
        const next = new Set(prev);
        next.delete(otherUserId);
        return next;
      });
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-150 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-luxury-ink/20 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="theme-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl border border-luxury-ink/5 overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[70vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 sm:p-6 border-b border-luxury-ink/5 relative">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-luxury-ink">Share</h3>
                <button onClick={onClose} className="p-2 text-luxury-ink/40 hover:text-luxury-ink rounded-full transition-colors bg-surface-soft">
                  <X size={20} />
                </button>
              </div>
              <p className="text-xs text-luxury-ink/50 mt-1 line-clamp-1">{postTitle}</p>
            </div>

            {/* Copy Link Option */}
            <div className="p-4 sm:p-6 border-b border-luxury-ink/5 bg-surface-soft/50">
              <button 
                onClick={handleCopyLink}
                className="w-full flex items-center justify-between p-4 bg-surface-base border border-luxury-ink/10 rounded-2xl hover:border-brand-teal/50 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${copied ? 'bg-emerald-500 text-white' : 'bg-brand-teal/10 text-brand-teal group-hover:bg-brand-teal group-hover:text-white'}`}>
                    {copied ? <CheckCircle2 size={18} /> : <LinkIcon size={18} />}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-luxury-ink">Copy Link</p>
                    <p className="text-xs text-luxury-ink/40 line-clamp-1 break-all pr-4">{postUrl}</p>
                  </div>
                </div>
              </button>
            </div>
            
            {navigator.share && (
              <div className="p-4 border-b border-luxury-ink/5 bg-surface-base">
                <button 
                  onClick={() => {
                    navigator.share({
                      title: postTitle,
                      text: `Check out this on Nextbench!`,
                      url: postUrl
                    }).catch(console.error);
                  }}
                  className="w-full flex items-center justify-center gap-2 p-3 bg-brand-teal text-white rounded-xl hover:bg-brand-teal/90 transition-colors shadow-lg shadow-brand-teal/20"
                >
                  <Share2 size={18} />
                  <span className="text-sm font-bold">Share via App</span>
                </button>
              </div>
            )}

            {/* Search and Send via Message */}
            <div className="p-4 border-b border-luxury-ink/5">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-luxury-ink/20" size={16} />
                <input
                  type="text"
                  value={searchUsers}
                  onChange={(e) => setSearchUsers(e.target.value)}
                  placeholder="Send in message..."
                  className="w-full bg-surface-base border border-luxury-ink/5 rounded-2xl py-3.5 pl-11 pr-4 focus:outline-none focus:border-brand-teal text-sm font-medium"
                />
              </div>
            </div>

            {/* Users List */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {searchingUsers ? (
                <div className="py-8 flex justify-center">
                  <div className="w-6 h-6 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
                </div>
              ) : userResults.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30 px-2 pb-2">Suggested</p>
                  {[...userResults].sort((a, b) => {
                    const aFollowed = followingIds.has(a.id);
                    const bFollowed = followingIds.has(b.id);
                    if (aFollowed && !bFollowed) return -1;
                    if (!aFollowed && bFollowed) return 1;
                    return 0;
                  }).map(u => (
                    <div key={u.id} className="flex items-center justify-between p-2 hover:bg-surface-soft rounded-xl transition-colors">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-10 h-10 rounded-full bg-brand-teal/5 flex items-center justify-center overflow-hidden border border-luxury-ink/5 shrink-0">
                          {u.profilePicture ? (
                            <img src={getOptimizedImageUrl(u.profilePicture)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <User size={18} className="text-brand-teal" />
                          )}
                        </div>
                        <div className="truncate">
                          <p className="font-bold text-luxury-ink text-sm flex items-center gap-1.5">
                            {u.name}
                            {u.verified && <ShieldCheck size={12} className="text-brand-teal" />}
                          </p>
                          <p className="text-[10px] text-luxury-ink/40 truncate">{u.school || 'Nextbench User'}</p>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => handleSendToUser(u.id)}
                        disabled={sentTo.has(u.id) || sendingTo.has(u.id)}
                        className={`shrink-0 ml-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                          sentTo.has(u.id) 
                            ? 'bg-surface-soft text-luxury-ink/40 cursor-default'
                            : 'bg-brand-teal text-white hover:bg-brand-mint shadow-md'
                        }`}
                      >
                        {sendingTo.has(u.id) ? (
                          <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin mx-2" />
                        ) : sentTo.has(u.id) ? (
                          'Sent'
                        ) : (
                          'Send'
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <p className="text-luxury-ink/30 text-sm font-medium">No users found</p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
