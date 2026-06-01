import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, X, Search, MapPin, School, GraduationCap, Calendar, FileText, Info, ArrowBigUp, MessageSquare, Flame, Share2, Image as ImageIcon, Trash2, Heart, Users, Grid3X3, UserCheck, Bookmark } from 'lucide-react';
import { collection, onSnapshot, query, where, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import SEO from '../../components/seo/SEO';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { uploadPostImage } from '../../lib/storage';
import { getOptimizedImageUrl } from '../../lib/utils';
import { useFollowingIds } from '../../lib/follows';
import { Link } from 'react-router-dom';
import ImageCropper from '../../components/ui/ImageCropper';
import ProductCard from '../../components/ui/ProductCard';
import PostCard from '../../components/ui/PostCard';
import { useScrollLock } from '../../hooks/useScrollLock';
import { useBlockedIds, useBlockedByIds } from '../../lib/blocks';
import { getPersonaDisplay } from '../../lib/confessions';
import { togglePostReaction, getUserReaction, REACTION_TYPES, REACTION_KEYS, ReactionType } from '../../lib/reactions';
import { usePublicClubs, joinClub } from '../../lib/clubs';

interface Post {
  id: string;
  title: string;
  content: string;
  type: string;
  isAnonymous?: boolean;
  personaName?: string;
  personaEmoji?: string;
  reactionsCount?: Record<string, number>;
  city?: string;
  school: string;
  authorId: string;
  authorName: string;
  authorProfilePicture?: string;
  status: string;
  privacy?: 'public' | 'private';
  imageUrl?: string;
  imageUrls?: string[];
  createdAt: any;
  upvotesCount: number;
  repliesCount: number;
  feedScore?: number;
}

interface Product {
  id: string;
  title: string;
  price: number;
  category: string;
  condition: string;
  image: string;
  status: string;
  sellerId: string;
  sellerName: string;
  sellerSchool: string;
  city?: string;
  createdAt: any;
}

export const POST_TYPES = [
  { id: 'info', label: 'School Info' },
  { id: 'notes', label: 'Notes' },
  { id: 'event', label: 'Interschool Event' },
  { id: 'confession', label: 'Confession' },
  { id: 'others', label: 'Others' },
];

function Comment({ reply, repliesMap, onReply, onDeleteReply, onUpvoteReply, replyUpvotedIds, isAdmin, user, level = 0 }: any) {
  const children = repliesMap[reply.id] || [];
  const hasUpvoted = replyUpvotedIds.has(reply.id);
  return (
    <div className={`mt-4 ${level > 0 ? 'ml-4 md:ml-6 border-l-2 border-brand-teal/20 pl-4 md:pl-6' : ''}`}>
      <div className="bg-surface-soft/30 p-4 rounded-2xl border border-luxury-ink/5">
        <div className="flex items-center gap-3 mb-2">
          <Link to={`/profile/${reply.authorId}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-6 h-6 rounded-full bg-brand-teal/10 flex items-center justify-center text-brand-teal font-bold text-[10px] shrink-0">
              {reply.authorName[0]?.toUpperCase()}
            </div>
            <div>
              <p className="text-[11px] font-bold text-luxury-ink">{reply.authorName}</p>
              <p className="text-[8px] font-bold uppercase tracking-widest text-luxury-ink/30">{reply.authorSchool}</p>
            </div>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => onUpvoteReply(reply.id)}
              className={`flex items-center gap-1 p-1.5 rounded-full text-[10px] font-bold transition-all ${hasUpvoted ? 'text-brand-pink bg-brand-pink/10' : 'text-luxury-ink/40 hover:bg-surface-soft hover:text-brand-pink'}`}
            >
              <Heart size={14} className={hasUpvoted ? 'fill-brand-pink' : ''} />
              {reply.upvotesCount || 0}
            </button>
            <button
              onClick={() => onReply(reply.id, reply.authorName)}
              className="flex items-center gap-1 p-1.5 hover:bg-surface-soft rounded-full text-[10px] font-bold text-luxury-ink/40 hover:text-brand-teal transition-all"
            >
              <MessageSquare size={14} />
              Reply
            </button>
            {(isAdmin || reply.authorId === user?.uid) && onDeleteReply && (
              <button
                onClick={() => onDeleteReply(reply.id)}
                className="p-1.5 hover:bg-red-500/10 hover:text-red-500 rounded-full text-luxury-ink/20 transition-all"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
        <p className="text-sm text-luxury-ink/80 leading-relaxed">{reply.content}</p>
      </div>
      {children.length > 0 && (
        <div className="mt-2">
          {children.map((child: any) => (
            <Comment
              key={child.id}
              reply={child}
              repliesMap={repliesMap}
              onReply={onReply}
              onDeleteReply={onDeleteReply}
              onUpvoteReply={onUpvoteReply}
              replyUpvotedIds={replyUpvotedIds}
              isAdmin={isAdmin}
              user={user}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Post Detail Modal (Instagram-style) ──────────────────

function PostDetailModal({ 
  post, 
  onClose, 
  onUpvote, 
  hasUpvoted, 
  onShare, 
  onDelete, 
  onDeleteReply,
  onUpvoteReply,
  onReply,
  replyUpvotedIds,
  replyingTo,
  clearReplyingTo,
  isAdmin, 
  replies, 
  replyContent, 
  setReplyContent, 
  onSubmitReply, 
  isSubmitting 
}: {
  post: Post;
  onClose: () => void;
  onUpvote: (post: Post) => void;
  hasUpvoted: boolean;
  onShare: (post: Post) => void;
  onDelete?: (postId: string) => void;
  onDeleteReply?: (replyId: string) => void;
  onUpvoteReply: (replyId: string) => void;
  onReply: (replyId: string, authorName: string) => void;
  replyUpvotedIds: Set<string>;
  replyingTo: {id: string, name: string} | null;
  clearReplyingTo: () => void;
  isAdmin?: boolean;
  replies: any[];
  replyContent: string;
  setReplyContent: (v: string) => void;
  onSubmitReply: (e: React.FormEvent) => void;
  isSubmitting: boolean;
}) {
  const postImageUrls = post.imageUrls && post.imageUrls.length > 0
    ? post.imageUrls
    : (post.imageUrl ? [post.imageUrl] : []);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [userReaction, setUserReaction] = useState<ReactionType | null>(null);
  const { user } = useAuth();
  
  const displayInfo = getPersonaDisplay(post, isAdmin);

  const repliesMap = useMemo(() => {
    const map: Record<string, any[]> = {};
    replies.forEach(r => {
      const parentId = r.parentId || 'root';
      if (!map[parentId]) map[parentId] = [];
      map[parentId].push(r);
    });
    return map;
  }, [replies]);

  useEffect(() => {
    if (user && post.type === 'confession') {
      getUserReaction(post.id, user.uid).then(r => setUserReaction(r));
    }
  }, [post.id, user, post.type]);

  const handleReactionClick = async (reaction: ReactionType) => {
    if (!user) return;
    // Optimistic UI update could go here, but for simplicity we let the snapshot handle it usually.
    // We will just call the toggler.
    await togglePostReaction(post.id, user.uid, reaction);
    const newReaction = await getUserReaction(post.id, user.uid);
    setUserReaction(newReaction);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-md"
      style={{ background: 'var(--color-overlay-heavy)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Scrollable Container */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          {/* Image Section */}
          {postImageUrls.length > 0 && (
          <div className="relative bg-luxury-ink/5 flex-shrink-0">
            <img
              src={getOptimizedImageUrl(postImageUrls[currentImageIndex])}
              alt={post.title}
              className="post-detail-image"
              referrerPolicy="no-referrer"
            />
            {/* Image indicators */}
            {postImageUrls.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                {postImageUrls.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentImageIndex(i)}
                    className={`w-2 h-2 rounded-full transition-all ${i === currentImageIndex ? 'bg-surface-card w-5' : 'bg-white/50 hover:bg-white/80'}`}
                  />
                ))}
              </div>
            )}
            {/* Close on image view */}
            <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-luxury-ink/40 backdrop-blur-md text-white rounded-full hover:bg-luxury-ink/60 transition-all">
              <X size={18} />
            </button>
          </div>
        )}

        {/* Content Section */}
        <div className="flex-1 p-6 md:p-8">
          {/* No image? show close button here */}
          {postImageUrls.length === 0 && (
            <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-surface-base text-luxury-ink/40 rounded-full hover:bg-surface-soft hover:text-luxury-ink transition-all">
              <X size={18} />
            </button>
          )}

          {/* Author */}
          <div className="flex items-center gap-3 mb-5">
            <Link to={displayInfo.isAnonymous ? '#' : `/profile/${post.authorId}`} onClick={displayInfo.isAnonymous ? (e) => { e.preventDefault(); showToast(`Anonymous ID: Anon-${post.authorId.substring(0, 5).toUpperCase()}`, 'info'); } : onClose} className={`shrink-0 ${displayInfo.isAnonymous ? 'cursor-pointer' : ''}`}>
              <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg font-serif overflow-hidden border-2 border-white shadow-sm ${displayInfo.isAnonymous ? 'bg-gradient-to-br from-purple-500/20 to-blue-500/20 text-purple-600' : 'bg-brand-pink/10 text-brand-pink'}`}>
                {!displayInfo.isAnonymous && post.authorProfilePicture ? (
                  <img src={getOptimizedImageUrl(post.authorProfilePicture)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : displayInfo.name[0]?.toUpperCase()}
              </div>
            </Link>
            <div className="flex-1 min-w-0">
              <Link to={displayInfo.isAnonymous ? '#' : `/profile/${post.authorId}`} onClick={displayInfo.isAnonymous ? (e) => { e.preventDefault(); showToast(`Anonymous ID: Anon-${post.authorId.substring(0, 5).toUpperCase()}`, 'info'); } : onClose} className={`text-sm font-bold text-luxury-ink transition-colors ${displayInfo.isAnonymous ? 'hover:text-purple-600 cursor-pointer' : 'hover:text-brand-teal'}`}>
                {displayInfo.name}
              </Link>
              <p className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30 flex items-center gap-1">
                <School size={10} /> {displayInfo.school}
                {post.city && !displayInfo.isAnonymous && <><span className="mx-1">•</span><MapPin size={10} /> {post.city}</>}
              </p>
            </div>
            <div className="flex gap-1.5 flex-col items-end">
              <div className="flex gap-1.5">
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest ${post.type === 'confession' ? 'bg-purple-500/10 text-purple-600' : 'bg-brand-teal/10 text-brand-teal'}`}>
                  {POST_TYPES.find(t => t.id === post.type)?.label || post.type}
                </span>
                {post.feedScore && post.feedScore > 10 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 text-amber-500 rounded-full text-[9px] font-bold uppercase tracking-widest">
                    <Flame size={10} /> Hot
                  </span>
                )}
              </div>
              {displayInfo.isAnonymous && isAdmin && (
                <span className="text-[9px] font-bold text-luxury-ink/40 bg-luxury-ink/5 px-2 py-0.5 rounded-full">
                  Real: {displayInfo.realName}
                </span>
              )}
            </div>
          </div>

          {/* Title & Content */}
          <h2 className="text-2xl font-bold text-luxury-ink mb-3 leading-tight">{post.title}</h2>
          <p className="text-luxury-ink/70 leading-relaxed whitespace-pre-wrap text-[15px]">{post.content}</p>

          {/* Time */}
          <p className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/20 mt-4 mb-8 border-b border-luxury-ink/5 pb-6">
            {post.createdAt?.toDate?.()?.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) || 'Recently'}
          </p>

          {/* Replies Section */}
          <div className="mt-6">
            <h3 className="text-lg font-bold text-luxury-ink mb-6">Discussions</h3>
            {replies.length === 0 ? (
              <div className="text-center py-6">
                <MessageSquare className="mx-auto text-luxury-ink/10 mb-2" size={24} />
                <p className="text-luxury-ink/40 font-serif italic text-sm">No replies yet. Start the discussion!</p>
              </div>
            ) : (
              <div className="space-y-4 mb-6">
                {repliesMap['root']?.map(reply => (
                  <Comment
                    key={reply.id}
                    reply={reply}
                    repliesMap={repliesMap}
                    onReply={onReply}
                    onDeleteReply={onDeleteReply}
                    onUpvoteReply={onUpvoteReply}
                    replyUpvotedIds={replyUpvotedIds}
                    isAdmin={isAdmin}
                    user={user}
                  />
                ))}
              </div>
            )}
            
            {/* Reply Input Form */}
            {replyingTo && (
              <div className="flex items-center justify-between bg-surface-soft p-3 rounded-xl mb-2 text-[11px] font-bold text-luxury-ink/60">
                <span>Replying to {replyingTo.name}</span>
                <button type="button" onClick={clearReplyingTo} className="hover:text-luxury-ink transition-colors"><X size={14} /></button>
              </div>
            )}
            <form onSubmit={onSubmitReply} className="flex gap-3 mt-4">
              <input
                id="reply-input"
                type="text"
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Write a reply..."
                className="flex-1 bg-surface-base border border-luxury-ink/5 rounded-xl py-3 px-4 focus:outline-none focus:border-brand-teal text-sm font-medium"
              />
              <button
                type="submit"
                disabled={!replyContent.trim() || isSubmitting}
                className="bg-brand-teal text-white px-5 py-3 rounded-xl text-[11px] font-bold uppercase tracking-[0.2em] shadow-lg shadow-brand-teal/20 hover:bg-brand-pink transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                Send
              </button>
            </form>
          </div>
        </div>
        </div>

        {/* Action Bar */}
        <div className="px-6 md:px-8 py-4 border-t border-luxury-ink/5 flex flex-col gap-4 bg-surface-base/50">
          
          {post.type === 'confession' && (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {REACTION_KEYS.map(rk => {
                const rt = REACTION_TYPES[rk];
                const count = post.reactionsCount?.[rk] || 0;
                const isSelected = userReaction === rk;
                return (
                  <button
                    key={rk}
                    onClick={() => handleReactionClick(rk)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all border ${isSelected ? 'bg-purple-500/10 border-purple-500/30 text-purple-700' : 'bg-surface-card border-luxury-ink/5 hover:border-luxury-ink/20 text-luxury-ink/60'}`}
                  >
                    <span>{rt.emoji}</span>
                    <span>{count > 0 ? count : rt.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              {post.type !== 'confession' && (
                <button
                  onClick={() => onUpvote(post)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${hasUpvoted ? 'bg-brand-pink/10 text-brand-pink' : 'hover:bg-surface-soft text-luxury-ink/40 hover:text-brand-pink'}`}
                >
                  <Heart size={24} className={hasUpvoted ? 'fill-brand-pink' : ''} />
                  {post.upvotesCount || 0}
                </button>
              )}
              <button
                onClick={() => document.getElementById('reply-input')?.focus()}
                className="flex items-center gap-2 px-4 py-3 hover:bg-surface-soft rounded-2xl text-sm font-bold text-luxury-ink/40 hover:text-brand-teal transition-all"
              >
                <MessageSquare size={24} />
                {post.repliesCount || 0}
              </button>
              <button
                onClick={() => onShare(post)}
                className="flex items-center gap-1.5 px-4 py-2.5 hover:bg-surface-soft rounded-xl text-xs font-bold text-luxury-ink/40 hover:text-brand-teal transition-all"
              >
                <Share2 size={18} />
              </button>
            </div>
            {(isAdmin || post.authorId === user?.uid) && onDelete && (
            <button
              onClick={() => onDelete(post.id)}
              className="flex items-center gap-1.5 px-4 py-2.5 hover:bg-red-500/10 hover:text-red-500 rounded-xl text-xs font-bold text-luxury-ink/20 transition-all"
            >
              <Trash2 size={16} />
            </button>
          )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Posts Component ─────────────────────────────────

export default function Feed() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contentType, setContentType] = useState<'all' | 'posts' | 'marketplace'>('all');

  // Image cropper state
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [currentCropIndex, setCurrentCropIndex] = useState(0);

  const { user, userData } = useAuth();
  const { showToast } = useToast();
  const { followingIds, friendIds } = useFollowingIds();
  const blockedIds = useBlockedIds();
  const blockedByIds = useBlockedByIds();

  const [upvotedPostIds, setUpvotedPostIds] = useState<Set<string>>(new Set());
  const [upvoteMap, setUpvoteMap] = useState<Record<string, string>>({});

  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [replies, setReplies] = useState<any[]>([]);
  const [replyContent, setReplyContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<{id: string, name: string} | null>(null);
  const [replyUpvotedIds, setReplyUpvotedIds] = useState<Set<string>>(new Set());
  const [replyUpvoteMap, setReplyUpvoteMap] = useState<Record<string, string>>({});

  // Lock body scroll when a modal is open
  useScrollLock(isModalOpen || !!selectedPost || cropImageSrc !== null);

  const [wishlisted, setWishlisted] = useState<Set<string>>(new Set());
  const [wishlistMap, setWishlistMap] = useState<Record<string, string>>({});

  const [rawPosts, setRawPosts] = useState<Post[]>([]);
  
  // Confession state
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [selectedPostType, setSelectedPostType] = useState('info');

  // Firestore listener — stable subscription, no dependency on followingIds/friendIds.
  // This listener only fires when Firestore posts actually change,
  // NOT when the user's follows change.
  useEffect(() => {
    const q = query(
      collection(db, 'posts'),
      where('status', '==', 'approved')
    );

    const userCache: Record<string, any> = {};

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        // 1. Identify uncached authors
        const uncachedIds = new Set<string>();
        snapshot.forEach(docSnap => {
          const authorId = docSnap.data().authorId;
          if (authorId && !userCache[authorId]) uncachedIds.add(authorId);
        });

        // 2. Fetch missing authors concurrently
        if (uncachedIds.size > 0) {
          const promises = Array.from(uncachedIds).map(async (uid) => {
            const uDoc = await getDoc(doc(db, 'users', uid));
            if (uDoc.exists()) userCache[uid] = uDoc.data();
            else userCache[uid] = {}; // Cache empty to avoid refetching
          });
          await Promise.all(promises);
        }

        // 3. Build post list with real-time author data
        const fetchedPosts: Post[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          const authorData = userCache[data.authorId] || {};
          
          fetchedPosts.push({
            id: docSnap.id,
            ...data,
            // Prioritize real-time user data, fallback to denormalized data
            authorName: authorData.name || data.authorName || 'Unknown User',
            authorProfilePicture: authorData.profilePicture || data.authorProfilePicture || null,
          } as Post);
        });
        setRawPosts(fetchedPosts);
      } catch (err) {
        console.error("Error fetching posts:", err);
      } finally {
        setLoading(false);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'posts');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []); // Stable — no deps means no re-subscription

  // Feed scoring — runs in useMemo, instant re-computation when follows/userData change.
  // This never creates or destroys Firestore listeners.
  const posts = useMemo(() => {
    const now = Date.now();
    const authorPostCount: Record<string, number> = {};

    const scored = rawPosts.map(post => {
      const postTime = post.createdAt?.toMillis() || now;
      const hoursPassed = Math.max(0, (now - postTime) / (1000 * 60 * 60));

      const baseHype = ((post.upvotesCount || 0) * 2) + ((post.repliesCount || 0) * 3);
      const timePenalty = hoursPassed * 0.5;
      const cityBoost = (userData?.city && post.city === userData.city) ? 10 : 0;
      const schoolBoost = (userData?.school && post.school === userData.school) ? 15 : 0;
      const followBoost = followingIds.has(post.authorId) ? 20 : 0;
      const friendBoost = friendIds.has(post.authorId) ? 30 : 0;

      authorPostCount[post.authorId] = (authorPostCount[post.authorId] || 0) + 1;
      const diversityPenalty = authorPostCount[post.authorId] > 2 ? (authorPostCount[post.authorId] - 2) * 10 : 0;

      const feedScore = baseHype - timePenalty + cityBoost + schoolBoost + followBoost + friendBoost - diversityPenalty;
      return { ...post, feedScore };
    });

    scored.sort((a, b) => {
      if (a.feedScore !== b.feedScore) return (b.feedScore || 0) - (a.feedScore || 0);
      const timeA = a.createdAt?.toMillis() || 0;
      const timeB = b.createdAt?.toMillis() || 0;
      return timeB - timeA;
    });

    return scored;
  }, [rawPosts, userData, followingIds, friendIds]);

  // Fetch Products
  useEffect(() => {
    const q = query(
      collection(db, 'products'),
      where('status', 'in', ['available', 'sold'])
    );
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        const fetchedProducts: Product[] = [];
        
        // Removed N+1 getDoc queries for sellers to improve speed
        // Relying purely on denormalized data.

        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          fetchedProducts.push({
            id: docSnap.id,
            ...data,
            sellerName: data.sellerName || 'Unknown User',
            sellerSchool: data.sellerSchool || 'Unknown School',
          } as Product);
        });

        // Simple time sort for products
        fetchedProducts.sort((a, b) => {
          const timeA = a.createdAt?.toMillis() || 0;
          const timeB = b.createdAt?.toMillis() || 0;
          return timeB - timeA;
        });

        setProducts(fetchedProducts);
      } catch (err) {
        console.error("Error fetching products:", err);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'post_upvotes'), where('userId', '==', user.uid));
    const unsub = onSnapshot(q, snap => {
      const ids = new Set<string>();
      const map: Record<string, string> = {};
      snap.forEach(d => {
        ids.add(d.data().postId);
        map[d.data().postId] = d.id;
      });
      setUpvotedPostIds(ids);
      setUpvoteMap(map);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'reply_upvotes'), where('userId', '==', user.uid));
    const unsub = onSnapshot(q, snap => {
      const ids = new Set<string>();
      const map: Record<string, string> = {};
      snap.forEach(d => {
        ids.add(d.data().replyId);
        map[d.data().replyId] = d.id;
      });
      setReplyUpvotedIds(ids);
      setReplyUpvoteMap(map);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!selectedPost) return;
    const q = query(collection(db, 'post_replies'), where('postId', '==', selectedPost.id));
    const unsub = onSnapshot(q, snap => {
      const reps: any[] = [];
      snap.forEach(d => reps.push({ id: d.id, ...d.data() }));
      reps.sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0));
      setReplies(reps);
    });
    return () => unsub();
  }, [selectedPost]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'wishlists'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ids = new Set<string>();
      const map: Record<string, string> = {};
      snapshot.forEach((d) => {
        const data = d.data();
        ids.add(data.productId);
        map[data.productId] = d.id;
      });
      setWishlisted(ids);
      setWishlistMap(map);
    });
    return () => unsubscribe();
  }, [user]);

  // ─── Image Crop Flow ──────────────────────────────────

  const handleFilesSelected = (files: FileList) => {
    const fileArray = Array.from(files);
    setPendingFiles(fileArray);
    setCurrentCropIndex(0);
    // Start cropping the first image
    const reader = new FileReader();
    reader.onload = () => setCropImageSrc(reader.result as string);
    reader.readAsDataURL(fileArray[0]);
  };

  const handleCropComplete = useCallback((croppedBlob: Blob) => {
    const croppedFile = new File([croppedBlob], pendingFiles[currentCropIndex]?.name || 'cropped.jpg', { type: 'image/jpeg' });
    setImageFiles(prev => [...prev, croppedFile]);
    setCropImageSrc(null);

    // Process next file if any
    const nextIndex = currentCropIndex + 1;
    if (nextIndex < pendingFiles.length) {
      setCurrentCropIndex(nextIndex);
      const reader = new FileReader();
      reader.onload = () => setCropImageSrc(reader.result as string);
      reader.readAsDataURL(pendingFiles[nextIndex]);
    }
  }, [pendingFiles, currentCropIndex]);

  const handleCropCancel = () => {
    setCropImageSrc(null);
    // Skip this image, try next
    const nextIndex = currentCropIndex + 1;
    if (nextIndex < pendingFiles.length) {
      setCurrentCropIndex(nextIndex);
      const reader = new FileReader();
      reader.onload = () => setCropImageSrc(reader.result as string);
      reader.readAsDataURL(pendingFiles[nextIndex]);
    }
  };

  // ─── Handlers ─────────────────────────────────────────

  const handleCreatePost = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !userData?.verified) {
      showToast('You must be verified to post.', 'error');
      return;
    }

    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const title = formData.get('title') as string;
    const content = formData.get('content') as string;
    const type = formData.get('type') as string;
    const privacy = (formData.get('privacy') as 'public' | 'private') || 'public';

    if (type === 'confession' && isAnonymous && !userData?.anonymousPersonaName) {
      showToast('You must set up an anonymous persona in Profile Settings first.', 'error');
      setIsSubmitting(false);
      return;
    }

    try {
      let imageUrls: string[] = [];
      if (imageFiles.length > 0) {
        imageUrls = await Promise.all(imageFiles.map(file => uploadPostImage(file)));
      }

      await addDoc(collection(db, 'posts'), {
        title,
        content,
        type,
        isAnonymous: type === 'confession' ? isAnonymous : false,
        personaName: (type === 'confession' && isAnonymous) ? userData.anonymousPersonaName : null,
        reactionsCount: type === 'confession' ? {} : null,
        city: userData.city || 'Lucknow',
        school: userData.school,
        authorId: user.uid,
        authorName: userData.name || user.email,
        authorProfilePicture: userData.profilePicture || null,
        status: 'pending',
        privacy,
        imageUrls,
        upvotesCount: 0,
        repliesCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      showToast('Post submitted for approval!', 'success');
      setIsModalOpen(false);
      setImageFiles([]);
      setPendingFiles([]);
      setIsAnonymous(false);
      setSelectedPostType('info');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'posts');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpvote = async (post: Post) => {
    if (!user) {
      window.location.href = '/login';
      return;
    }
    if (!userData?.verified) {
      showToast('You must be verified to like.', 'error');
      return;
    }

    try {
      const isUpvoted = upvotedPostIds.has(post.id);
      if (isUpvoted) {
        const upvoteId = upvoteMap[post.id];
        if (upvoteId) await deleteDoc(doc(db, 'post_upvotes', upvoteId));
        await updateDoc(doc(db, 'posts', post.id), {
          upvotesCount: Math.max(0, (post.upvotesCount || 0) - 1),
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'post_upvotes'), {
          userId: user.uid,
          postId: post.id
        });
        await updateDoc(doc(db, 'posts', post.id), {
          upvotesCount: (post.upvotesCount || 0) + 1,
          updatedAt: serverTimestamp()
        });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'posts');
    }
  };

  const handleUpvoteReply = async (replyId: string) => {
    if (!user) {
      window.location.href = '/login';
      return;
    }
    if (!userData?.verified) {
      showToast('You must be verified to like.', 'error');
      return;
    }
    try {
      const isUpvoted = replyUpvotedIds.has(replyId);
      const reply = replies.find(r => r.id === replyId);
      if (!reply) return;

      if (isUpvoted) {
        const upvoteId = replyUpvoteMap[replyId];
        if (upvoteId) await deleteDoc(doc(db, 'reply_upvotes', upvoteId));
        await updateDoc(doc(db, 'post_replies', replyId), {
          upvotesCount: Math.max(0, (reply.upvotesCount || 0) - 1),
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'reply_upvotes'), {
          userId: user.uid,
          replyId: replyId
        });
        await updateDoc(doc(db, 'post_replies', replyId), {
          upvotesCount: (reply.upvotesCount || 0) + 1,
          updatedAt: serverTimestamp()
        });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'post_replies');
    }
  };

  const handleReplyTo = (replyId: string, authorName: string) => {
    setReplyingTo({ id: replyId, name: authorName });
    document.getElementById('reply-input')?.focus();
  };

  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      window.location.href = '/login';
      return;
    }
    if (!userData?.verified) {
      showToast('You must be verified to reply.', 'error');
      return;
    }
    if (!selectedPost || !replyContent.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const replyData = {
        postId: selectedPost.id,
        content: replyContent.trim(),
        authorId: user.uid,
        authorName: userData?.name || user.email?.split('@')[0] || 'Anonymous',
        authorSchool: userData?.school || 'Unknown School',
        createdAt: serverTimestamp(),
        ...(replyingTo && { parentId: replyingTo.id })
      };

      await addDoc(collection(db, 'post_replies'), replyData);
      
      const postRef = doc(db, 'posts', selectedPost.id);
      await updateDoc(postRef, {
        repliesCount: (selectedPost.repliesCount || 0) + 1
      });
      
      if (replyingTo) {
        const parentReplyRef = doc(db, 'post_replies', replyingTo.id);
        const parentReply = replies.find(r => r.id === replyingTo.id);
        if (parentReply) {
          await updateDoc(parentReplyRef, {
            repliesCount: (parentReply.repliesCount || 0) + 1,
            updatedAt: serverTimestamp()
          });
        }
      }

      setReplyContent('');
      setReplyingTo(null);
      showToast('Reply posted!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'post_replies');
      showToast('Failed to post reply', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShare = async (post: Post) => {
    const text = `Check out "${post.title}" by ${post.authorName} on Nextbench Community!`;
    const url = window.location.origin + '/community';

    if (navigator.share) {
      try {
        await navigator.share({ title: post.title, text, url });
      } catch (err) { /* cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(`${text} ${url}`);
        showToast('Link copied to clipboard!', 'success');
      } catch (err) {
        showToast('Failed to copy link', 'error');
      }
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!window.confirm('Are you sure you want to delete this post? This will also delete all comments and likes.')) return;
    try {
      const batch = writeBatch(db);
      
      const repliesQ = query(collection(db, 'post_replies'), where('postId', '==', postId));
      const repliesSnap = await getDocs(repliesQ);
      repliesSnap.forEach(docSnap => batch.delete(docSnap.ref));
      
      const upvotesQ = query(collection(db, 'post_upvotes'), where('postId', '==', postId));
      const upvotesSnap = await getDocs(upvotesQ);
      upvotesSnap.forEach(docSnap => batch.delete(docSnap.ref));

      const reactionsQ = query(collection(db, 'post_reactions'), where('postId', '==', postId));
      const reactionsSnap = await getDocs(reactionsQ);
      reactionsSnap.forEach(docSnap => batch.delete(docSnap.ref));
      
      batch.delete(doc(db, 'posts', postId));
      
      await batch.commit();
      
      showToast('Post deleted successfully', 'success');
      setSelectedPost(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'posts');
    }
  };

  const handleDeleteReply = async (replyId: string) => {
    if (!window.confirm('Are you sure you want to delete this reply?')) return;
    try {
      await deleteDoc(doc(db, 'post_replies', replyId));
      if (selectedPost) {
        await updateDoc(doc(db, 'posts', selectedPost.id), {
          repliesCount: Math.max(0, (selectedPost.repliesCount || 0) - 1),
          updatedAt: serverTimestamp()
        });
      }
      showToast('Reply deleted', 'success');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'post_replies');
    }
  };

  // ─── Filtering (block system) ────────────────────────────

  const filteredPosts = posts.filter(p => {
    if (blockedIds.has(p.authorId) || blockedByIds.has(p.authorId)) return false;
    if (p.privacy === 'private' && p.authorId !== user?.uid && !friendIds.has(p.authorId)) return false;
    return true;
  });
  const filteredProducts = products.filter(p => !blockedIds.has(p.sellerId) && !blockedByIds.has(p.sellerId));

  const combinedFeed = useMemo(() => {
    let combined: any[] = [];
    if (contentType === 'all' || contentType === 'posts') {
      combined = [...combined, ...filteredPosts.map(p => ({ ...p, _kind: 'post' }))];
    }
    if (contentType === 'all' || contentType === 'marketplace') {
      combined = [...combined, ...filteredProducts.map(p => ({ ...p, _kind: 'product' }))];
    }
    
    // Sort combined by feedScore (for posts) and time
    combined.sort((a, b) => {
      const timeA = a.createdAt?.toMillis() || 0;
      const timeB = b.createdAt?.toMillis() || 0;
      return timeB - timeA;
    });
    return combined;
  }, [filteredPosts, filteredProducts, contentType]);

  // Get unique recent authors for story-style row
  const recentAuthors = useMemo(() => {
    const map = new Map<string, Post>();
    posts.slice(0, 20).forEach(p => {
      if (!map.has(p.authorId)) map.set(p.authorId, p);
    });
    return Array.from(map.values()).slice(0, 10);
  }, [posts]);

  return (
    <div className="pt-6 pb-20 px-0 sm:px-4 md:px-0 max-w-2xl mx-auto w-full">
      <SEO 
        title="Home" 
        description="Discover school info, notes, and interschool events on Nextbench Community." 
      />

      {/* Sticky Header Tabs */}
      <div className="sticky top-0 z-40 nav-glass border-b pt-2 sm:pt-4 flex items-center justify-between px-4 sm:px-6 mb-4 sm:mb-8 gap-4" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex-1 flex items-center justify-center sm:justify-start gap-4 sm:gap-6 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setContentType('all')}
            className={`py-3 sm:py-4 text-xs font-bold uppercase tracking-widest transition-all border-b-2 whitespace-nowrap shrink-0 ${contentType === 'all' ? 'border-luxury-ink text-luxury-ink' : 'border-transparent text-luxury-ink/30 hover:text-luxury-ink/60'}`}
          >
            All
          </button>

          <button
            onClick={() => setContentType('marketplace')}
            className={`py-3 sm:py-4 text-xs font-bold uppercase tracking-widest transition-all border-b-2 whitespace-nowrap shrink-0 ${contentType === 'marketplace' ? 'border-luxury-ink text-luxury-ink' : 'border-transparent text-luxury-ink/30 hover:text-luxury-ink/60'}`}
          >
            Marketplace
          </button>
        </div>
        
        {user && userData?.verified && (
          <div className="hidden sm:block shrink-0 mb-1 ml-auto">
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 bg-luxury-ink text-surface-base px-5 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-luxury-ink/80 transition-colors shadow-lg"
            >
              <Plus size={14} /> Post
            </button>
          </div>
        )}
      </div>

      {/* Floating Action Button for Mobile */}
      {user && userData?.verified && (
        <button
          onClick={() => setIsModalOpen(true)}
          className="fixed bottom-24 right-4 sm:hidden z-50 flex items-center justify-center w-14 h-14 bg-luxury-ink text-surface-base rounded-full shadow-2xl shadow-luxury-ink/30 hover:scale-105 active:scale-95 transition-all"
        >
          <Plus size={24} />
        </button>
      )}

      {/* Stories-style Recent Posters */}
      {recentAuthors.length > 0 && (
        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-6 mb-2 px-4 sm:px-0">
          {recentAuthors.map(post => (
            <Link key={post.authorId} to={`/profile/${post.authorId}`} className="flex flex-col items-center gap-1.5 shrink-0 group">
              <div className="story-ring rounded-full">
                <div className="w-16 h-16 rounded-full bg-surface-card flex items-center justify-center overflow-hidden">
                  {post.authorProfilePicture ? (
                    <img src={getOptimizedImageUrl(post.authorProfilePicture)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="text-brand-pink font-serif font-bold text-xl">{post.authorName[0]?.toUpperCase()}</span>
                  )}
                </div>
              </div>
              <span className="text-[10px] font-bold text-luxury-ink/40 group-hover:text-brand-teal transition-colors max-w-[70px] truncate text-center">
                {post.authorName.split(' ')[0]}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Grid / Feed */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="w-10 h-10 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-luxury-ink/40 text-xs font-bold uppercase tracking-widest">Calculating Hype...</p>
        </div>
      ) : (
        <>
          {/* Vertical Feed */}
          <div className="flex flex-col gap-8 w-full pb-20">
            <AnimatePresence>
              {combinedFeed.map((item, index) => {
                const isProduct = item._kind === 'product';
                
                const card = isProduct ? (
                  <ProductCard 
                    key={`prod-${item.id}`} 
                    product={item as Product} 
                    isWishlisted={wishlisted.has(item.id)} 
                    wishlistDocId={wishlistMap[item.id]} 
                  />
                ) : (
                  <PostCard 
                    key={`post-${item.id}`} 
                    post={item as Post} 
                    hasUpvoted={upvotedPostIds.has(item.id)} 
                    onClick={() => setSelectedPost(item as Post)} 
                  />
                );

                const showClubs = index === 2 || (combinedFeed.length <= 2 && index === combinedFeed.length - 1);

                if (showClubs) {
                  return (
                    <React.Fragment key={`feed-item-${item.id}`}>
                      {card}
                      <HorizontalDiscoverClubs />
                    </React.Fragment>
                  );
                }

                return card;
              })}
            </AnimatePresence>
          </div>

          {!loading && combinedFeed.length === 0 && (
            <div className="py-20 text-center theme-card rounded-3xl border luxury-shadow" style={{ borderColor: 'var(--color-border)' }}>
              <GraduationCap className="mx-auto text-luxury-ink/15 mb-4" size={56} />
              <p className="text-luxury-ink/40 font-serif italic text-xl mb-2">
                {contentType === 'marketplace' ? 'No items listed yet.' : 'No posts found.'}
              </p>
              <p className="text-xs font-bold uppercase tracking-widest text-brand-teal/40">
                {contentType === 'marketplace' ? 'Be the first to list an item!' : 'Be the first to share something!'}
              </p>
            </div>
          )}
        </>
      )}

      {/* ─── Post Detail Modal ──────────────────────────── */}
      <AnimatePresence>
        {selectedPost && (
          <PostDetailModal
            post={selectedPost}
            onClose={() => { setSelectedPost(null); setReplyingTo(null); }}
            onUpvote={handleUpvote}
            hasUpvoted={upvotedPostIds.has(selectedPost.id)}
            onShare={handleShare}
            onDelete={handleDeletePost}
            onDeleteReply={handleDeleteReply}
            onUpvoteReply={handleUpvoteReply}
            onReply={handleReplyTo}
            replyUpvotedIds={replyUpvotedIds}
            replyingTo={replyingTo}
            clearReplyingTo={() => setReplyingTo(null)}
            isAdmin={userData?.role === 'admin'}
            replies={replies}
            replyContent={replyContent}
            setReplyContent={setReplyContent}
            onSubmitReply={handleSubmitReply}
            isSubmitting={isSubmitting}
          />
        )}
      </AnimatePresence>

      {/* ─── Create Post Modal ──────────────────────────── */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-luxury-ink/20 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface-card rounded-3xl w-full max-w-2xl relative shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              {/* Full-Screen Loading Overlay inside Modal */}
              <AnimatePresence>
                {isSubmitting && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center"
                  >
                    <div className="w-12 h-12 border-4 border-brand-teal border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-luxury-ink font-bold text-lg">Posting...</p>
                    <p className="text-luxury-ink/50 text-sm mt-1">Uploading media and publishing to community</p>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="p-8 overflow-y-auto flex-1 min-h-0">
                <button
                  onClick={() => { setIsModalOpen(false); setImageFiles([]); setPendingFiles([]); }}
                  className="absolute top-6 right-6 p-2 text-luxury-ink/40 hover:text-luxury-ink bg-surface-base rounded-full transition-colors"
                >
                  <X size={20} />
                </button>

                <h2 className="text-3xl font-serif font-bold text-luxury-ink italic mb-2">Create Post</h2>
                <p className="text-xs font-bold uppercase tracking-widest text-luxury-ink/40 mb-8">Share with the community</p>

                <form onSubmit={handleCreatePost} className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/60 ml-1">Post Type</label>
                      <select
                        name="type"
                        required
                        value={selectedPostType}
                        onChange={(e) => {
                          setSelectedPostType(e.target.value);
                          if (e.target.value === 'confession') {
                            setIsAnonymous(true);
                          } else {
                            setIsAnonymous(false);
                          }
                        }}
                        className="w-full bg-surface-base border border-luxury-ink/5 rounded-xl py-4 px-6 text-sm font-medium focus:outline-none focus:border-brand-teal transition-all appearance-none"
                      >
                        {POST_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/60 ml-1">Privacy</label>
                      <select
                        name="privacy"
                        required
                        className="w-full bg-surface-base border border-luxury-ink/5 rounded-xl py-4 px-6 text-sm font-medium focus:outline-none focus:border-brand-teal transition-all appearance-none"
                      >
                        <option value="public">Public</option>
                        <option value="private">Friends Only</option>
                      </select>
                    </div>
                  </div>

                  {selectedPostType === 'confession' && (
                    <div className="bg-purple-500/5 border border-purple-500/10 rounded-2xl p-6 space-y-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-purple-700">Anonymous Mode</h4>
                          <p className="text-[10px] uppercase tracking-widest text-purple-700/60 font-bold">Hide your real identity</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer mt-1">
                          <input type="checkbox" className="sr-only peer" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} />
                          <div className="w-11 h-6 bg-luxury-ink/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                        </label>
                      </div>

                      {isAnonymous && (
                        <div className="space-y-4 pt-4 border-t border-purple-500/10">
                          {userData?.anonymousPersonaName ? (
                            <p className="text-sm font-medium text-purple-700">
                              You will post as: <span className="font-bold">{userData.anonymousPersonaName}</span>
                            </p>
                          ) : (
                            <div className="bg-white/50 border border-purple-500/20 rounded-xl p-4 text-center">
                              <p className="text-xs text-purple-700 mb-3">You haven't set up an anonymous persona yet.</p>
                              <Link 
                                to={`/profile/${user?.uid}`}
                                onClick={() => setIsModalOpen(false)}
                                className="inline-block px-4 py-2 bg-purple-600 text-white rounded-lg text-xs font-bold transition-colors"
                              >
                                Set Up Persona
                              </Link>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/60 ml-1">Title</label>
                    <input
                      name="title"
                      type="text"
                      required
                      placeholder="Enter a descriptive title..."
                      className="w-full bg-surface-base border border-luxury-ink/5 rounded-xl py-4 px-6 text-sm font-medium focus:outline-none focus:border-brand-teal transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/60 ml-1">Content</label>
                    <textarea
                      name="content"
                      required
                      rows={4}
                      placeholder="Write your details here..."
                      className="w-full bg-surface-base border border-luxury-ink/5 rounded-xl py-4 px-6 text-sm font-medium focus:outline-none focus:border-brand-teal transition-all resize-none"
                    ></textarea>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/60 ml-1">
                      Images (Optional — will be cropped)
                    </label>
                    <div className="relative">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            handleFilesSelected(e.target.files);
                          }
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <div className="w-full bg-surface-base border-2 border-dashed border-luxury-ink/10 rounded-xl py-8 px-6 flex flex-col items-center justify-center text-center hover:border-brand-teal/50 hover:bg-brand-teal/5 transition-all">
                        <ImageIcon className="text-luxury-ink/20 mb-2" size={32} />
                        <p className="text-sm font-bold text-luxury-ink/60">Click or drag images here</p>
                        <p className="text-xs font-medium text-luxury-ink/40 mt-1">Images will be cropped before upload</p>
                      </div>
                    </div>

                    {imageFiles.length > 0 && (
                      <div className="mt-4 flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                        {imageFiles.map((file, index) => (
                          <div key={index} className="relative group shrink-0">
                            <div className="w-20 h-20 rounded-xl overflow-hidden border-2 border-luxury-ink/10">
                              <img src={URL.createObjectURL(file)} alt="Preview" className="w-full h-full object-cover" />
                            </div>
                            <button
                              type="button"
                              onClick={() => setImageFiles(prev => prev.filter((_, i) => i !== index))}
                              className="absolute -top-1.5 -right-1.5 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-4 flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 max-w-[200px]">
                      Your post will be tagged with your registered city ({userData?.city || 'Lucknow'}).
                    </p>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="bg-gradient-to-r from-brand-teal to-brand-mint text-white px-8 py-4 rounded-xl text-[11px] font-bold uppercase tracking-[0.2em] hover:shadow-xl hover:shadow-brand-teal/20 transition-all disabled:opacity-50"
                    >
                      {isSubmitting ? 'Submitting...' : 'Submit Post'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Image Cropper ──────────────────────────────── */}
      {cropImageSrc && (
        <ImageCropper
          imageSrc={cropImageSrc}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
          aspect={1}
        />
      )}

    </div>
  );
}

function HorizontalDiscoverClubs() {
  const { user, userData } = useAuth();
  const { showToast } = useToast();
  const { clubs, loading } = usePublicClubs(userData?.school, userData?.city, user?.uid);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const handleJoin = async (e: React.MouseEvent, clubId: string) => {
    e.preventDefault();
    if (!user || joiningId) return;
    setJoiningId(clubId);
    try {
      await joinClub(user.uid, clubId);
      showToast('Joined club!', 'success');
    } catch {
      showToast('Failed to join', 'error');
    } finally {
      setJoiningId(null);
    }
  };

  if (loading || clubs.length === 0) return null;

  return (
    <div className="py-6 my-2 border-y border-luxury-ink/5 bg-surface-soft/20 -mx-4 px-4 sm:mx-0 sm:rounded-3xl sm:border sm:px-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-brand-teal" />
          <h3 className="text-sm font-bold text-luxury-ink">Discover Clubs</h3>
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
        {clubs.map((club) => (
          <Link 
            key={club.id} 
            to={`/club/${club.id}`} 
            className="flex-shrink-0 w-48 theme-card p-4 rounded-2xl border border-luxury-ink/5 hover:border-brand-teal/30 transition-colors group flex flex-col"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-teal/15 to-brand-pink/15 flex items-center justify-center overflow-hidden mb-3 border border-luxury-ink/5">
              {club.avatar ? (
                <img src={getOptimizedImageUrl(club.avatar)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <Users size={20} className="text-brand-teal" />
              )}
            </div>
            <p className="text-sm font-bold text-luxury-ink truncate group-hover:text-brand-teal transition-colors mb-1">{club.name}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30 mb-4">{club.memberCount} members</p>
            <button
              onClick={(e) => handleJoin(e, club.id)}
              disabled={joiningId === club.id}
              className="mt-auto w-full py-2 bg-brand-teal text-white rounded-xl text-xs font-bold hover:bg-brand-pink transition-colors shadow-sm disabled:opacity-50"
            >
              {joiningId === club.id ? 'Joining...' : 'Join Club'}
            </button>
          </Link>
        ))}
      </div>
    </div>
  );
}
