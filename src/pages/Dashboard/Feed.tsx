import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, X, Search, MapPin, School, GraduationCap, Calendar, FileText, Info, ArrowBigUp, MessageSquare, Flame, Share2, Image as ImageIcon, Trash2, Heart, Users, Grid3X3, UserCheck, Bookmark, MoreHorizontal, Globe, Lock, Settings, BarChart3, ChevronLeft, ChevronRight } from 'lucide-react';
import { collection, onSnapshot, query, where, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import SEO from '../../components/seo/SEO';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { uploadPostImage, uploadReplyImage } from '../../lib/storage';
import { getOptimizedImageUrl } from '../../lib/utils';
import { useFollowingIds } from '../../lib/follows';
import { isTextSafe } from '../../lib/moderation';
import { checkAllImagesSafety, checkImageSafety, preloadModerationModel } from '../../lib/imageModeration';
import { createNotification } from '../../lib/notifications';
import ShareModal from '../../components/ui/ShareModal';
import { Link, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import ImageCropper from '../../components/ui/ImageCropper';
import ProductCard from '../../components/ui/ProductCard';
import PostCard from '../../components/ui/PostCard';
import PollDisplay from '../../components/ui/PollDisplay';
import LinkifiedText from '../../components/ui/LinkifiedText';
import { useScrollLock } from '../../hooks/useScrollLock';
import { useBlockedIds, useBlockedByIds } from '../../lib/blocks';
import { getPersonaDisplay } from '../../lib/confessions';
import { togglePostReaction, getUserReaction, REACTION_TYPES, REACTION_KEYS, ReactionType } from '../../lib/reactions';
import { usePublicClubs, joinClub } from '../../lib/clubs';
import { savePost, unsavePost } from '../../lib/saves';

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
  downvotesCount?: number;
  repliesCount: number;
  feedScore?: number;
  poll?: {
    choices: string[];
    expiresAt: any;
    votes: Record<string, number>;
  };
}

interface Product {
  id: string;
  title: string;
  price: number;
  category: string;
  condition: string;
  image: string;
  images?: string[];
  status: string;
  sellerId: string;
  sellerName: string;
  sellerSchool: string;
  sellerProfilePicture?: string;
  city?: string;
  createdAt: any;
}

export const POST_TYPES = [
  { id: 'info', label: 'School Info' },
  { id: 'notes', label: 'Notes' },
  { id: 'event', label: 'Interschool Event' },
  { id: 'confession', label: 'Anonymous Post' },
  { id: 'others', label: 'Others' },
];

// ─── Post Card Skeleton ────────────────────────────────────
function PostCardSkeleton() {
  return (
    <div className="p-4 sm:p-6 md:p-8 flex flex-col w-full border-b animate-pulse" style={{ borderColor: 'var(--color-border)' }}>
      {/* Avatar + meta row */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-full bg-luxury-ink/8 shrink-0" />
        <div className="flex gap-2 flex-1">
          <div className="h-3 w-24 rounded-full bg-luxury-ink/8" />
          <div className="h-3 w-10 rounded-full bg-luxury-ink/6" />
        </div>
        <div className="h-5 w-14 rounded bg-luxury-ink/6" />
      </div>
      {/* Title */}
      <div className="h-4 w-2/3 rounded-full bg-luxury-ink/10 mb-3" />
      {/* Content lines */}
      <div className="space-y-2 mb-5">
        <div className="h-3 w-full rounded-full bg-luxury-ink/7" />
        <div className="h-3 w-5/6 rounded-full bg-luxury-ink/7" />
        <div className="h-3 w-4/6 rounded-full bg-luxury-ink/6" />
      </div>
      {/* Action bar */}
      <div className="flex items-center gap-6 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <div className="h-3 w-10 rounded-full bg-luxury-ink/8" />
        <div className="h-3 w-10 rounded-full bg-luxury-ink/8" />
        <div className="h-3 w-10 rounded-full bg-luxury-ink/8" />
      </div>
    </div>
  );
}

// ─── Infinite Scroll Sentinel ──────────────────────────────
function InfiniteScrollSentinel({ onVisible }: { onVisible: () => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) onVisible(); },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onVisible]);

  return (
    <div ref={ref} className="flex flex-col w-full min-w-0">
      {Array.from({ length: 3 }).map((_, i) => <PostCardSkeleton key={i} />)}
    </div>
  );
}

function Comment({ reply, repliesMap, onReply, onDeleteReply, onUpvoteReply, replyUpvotedIds, isAdmin, user, level = 0 }: any) {
  const children = repliesMap[reply.id] || [];
  const hasUpvoted = replyUpvotedIds.has(reply.id);

  // Show stored pic immediately; fall back to live Firestore fetch if missing
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(reply.authorProfilePicture);
  useEffect(() => {
    if (reply.authorProfilePicture || !reply.authorId) return;
    getDoc(doc(db, 'users', reply.authorId)).then(snap => {
      if (snap.exists()) {
        const pic = snap.data()?.profilePicture;
        if (pic) setAvatarUrl(pic);
      }
    }).catch(() => {});
  }, [reply.authorId, reply.authorProfilePicture]);
  return (
    <div className={`mt-4 ${level > 0 ? 'ml-4 md:ml-6 border-l-2 border-brand-teal/20 pl-4 md:pl-6' : ''}`}>
      <div className="bg-surface-soft/30 p-4 rounded-2xl border border-luxury-ink/5">
        <div className="flex items-center gap-3 mb-2">
          <Link to={`/profile/${reply.authorId}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-6 h-6 rounded-full bg-brand-teal/10 flex items-center justify-center text-brand-teal font-bold text-[10px] shrink-0 overflow-hidden">
              {avatarUrl ? (
                <img src={getOptimizedImageUrl(avatarUrl)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : reply.authorName[0]?.toUpperCase()}
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
        {reply.content?.trim() && (
          <p className="text-sm text-luxury-ink/80 leading-relaxed">{reply.content}</p>
        )}
        {reply.imageUrl && (
          <img
            src={getOptimizedImageUrl(reply.imageUrl)}
            alt=""
            className="mt-3 max-h-60 rounded-xl object-cover"
            referrerPolicy="no-referrer"
          />
        )}
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
  onDownvote,
  hasDownvoted,
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
  isSubmitting,
  replyImageFile,
  setReplyImageFile,
  isUploadingReplyImage
}: {
  post: Post;
  onClose: () => void;
  onUpvote: (post: Post) => void;
  hasUpvoted: boolean;
  onDownvote: (post: Post) => void;
  hasDownvoted: boolean;
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
  replyImageFile: File | null;
  setReplyImageFile: (f: File | null) => void;
  isUploadingReplyImage: boolean;
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

  const [commentSort, setCommentSort] = useState<'recent' | 'top' | 'discussed'>('recent');

  const sortedRootReplies = useMemo(() => {
    const roots = repliesMap['root'] || [];
    if (commentSort === 'top') {
      return [...roots].sort((a, b) => (b.upvotesCount || 0) - (a.upvotesCount || 0));
    }
    if (commentSort === 'discussed') {
      return [...roots].sort((a, b) => (repliesMap[b.id]?.length || 0) - (repliesMap[a.id]?.length || 0));
    }
    return roots;
  }, [repliesMap, commentSort]);

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
      className="fixed inset-0 z-100 flex items-center justify-center p-0 sm:p-4 backdrop-blur-md"
      style={{ background: 'var(--color-overlay-heavy)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full h-full sm:h-auto sm:max-h-[92vh] max-w-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Scrollable Container */}
        <div className="flex-1 overflow-y-auto flex flex-col relative p-4 pt-14 sm:p-6 sm:pt-6 md:p-8">
          <button onClick={onClose} className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 bg-surface-base text-luxury-ink/40 rounded-full hover:bg-surface-soft hover:text-luxury-ink transition-all z-10">
            <X size={18} />
          </button>

          {/* Author */}
          <div className="flex items-center gap-3 mb-5">
            <Link to={displayInfo.isAnonymous ? '#' : `/profile/${post.authorId}`} onClick={displayInfo.isAnonymous ? (e) => { e.preventDefault(); /* showToast handle here */ } : onClose} className={`shrink-0 ${displayInfo.isAnonymous ? 'cursor-pointer' : ''}`}>
              <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg font-serif overflow-hidden border-2 border-white shadow-sm ${displayInfo.isAnonymous ? 'bg-linear-to-br from-purple-500/20 to-blue-500/20 text-purple-600' : 'bg-brand-pink/10 text-brand-pink'}`}>
                {!displayInfo.isAnonymous && post.authorProfilePicture ? (
                  <img src={getOptimizedImageUrl(post.authorProfilePicture)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : displayInfo.name[0]?.toUpperCase()}
              </div>
            </Link>
            <div className="flex-1 min-w-0">
              <Link to={displayInfo.isAnonymous ? '#' : `/profile/${post.authorId}`} onClick={displayInfo.isAnonymous ? (e) => { e.preventDefault(); /* showToast handle here */ } : onClose} className={`text-sm font-bold text-luxury-ink transition-colors ${displayInfo.isAnonymous ? 'hover:text-purple-600 cursor-pointer' : 'hover:text-brand-teal'}`}>
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
          <h2 className="text-xl sm:text-2xl font-bold text-luxury-ink mb-3 leading-tight">{post.title}</h2>
          <p className="text-luxury-ink/70 leading-relaxed whitespace-pre-wrap wrap-break-word text-[15px] mb-6">{post.content}</p>

          {/* Poll */}
          {post.poll && post.poll.choices?.length > 0 && (
            <PollDisplay postId={post.id} poll={post.poll} />
          )}

          {/* Image Section Moved Here */}
          {postImageUrls.length > 0 && (
            <div className="relative bg-luxury-ink/5 rounded-2xl overflow-hidden mb-6 border border-luxury-ink/5 shrink-0 group">
              <img
                src={getOptimizedImageUrl(postImageUrls[currentImageIndex])}
                alt={post.title}
                className="post-detail-image rounded-2xl"
                referrerPolicy="no-referrer"
              />

              {postImageUrls.length > 1 && (
                <>
                  {currentImageIndex > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentImageIndex(i => i - 1);
                      }}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-black/40 hover:bg-black/60 text-white rounded-full backdrop-blur-sm transition-all"
                    >
                      <ChevronLeft size={20} />
                    </button>
                  )}

                  {currentImageIndex < postImageUrls.length - 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentImageIndex(i => i + 1);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-black/40 hover:bg-black/60 text-white rounded-full backdrop-blur-sm transition-all"
                    >
                      <ChevronRight size={20} />
                    </button>
                  )}

                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 bg-luxury-ink/40 backdrop-blur-md px-3 py-1.5 rounded-full">
                    {postImageUrls.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentImageIndex(i)}
                        className={`w-2 h-2 rounded-full transition-all ${i === currentImageIndex ? 'bg-white w-4' : 'bg-white/50 hover:bg-white/80'}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Time */}
          <p className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/20 mt-4 mb-8 border-b border-luxury-ink/5 pb-6">
            {post.createdAt?.toDate?.()?.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) || 'Recently'}
          </p>

          {/* Replies Section */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
              <h3 className="text-lg font-bold text-luxury-ink">Discussions</h3>
              {replies.length > 1 && (
                <div className="flex items-center gap-1 p-0.5 bg-surface-soft rounded-xl text-[11px] font-bold">
                  {(['recent', 'top', 'discussed'] as const).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setCommentSort(s)}
                      className={`px-3 py-1.5 rounded-lg transition-all ${
                        commentSort === s
                          ? 'bg-surface-card text-luxury-ink shadow-sm'
                          : 'text-luxury-ink/40 hover:text-luxury-ink'
                      }`}
                    >
                      {s === 'recent' ? 'Recent' : s === 'top' ? 'Top' : 'Active'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {replies.length === 0 ? (
              <div className="text-center py-6">
                <MessageSquare className="mx-auto text-luxury-ink/10 mb-2" size={24} />
                <p className="text-luxury-ink/40 font-serif italic text-sm">No replies yet. Start the discussion!</p>
              </div>
            ) : (
              <div className="space-y-4 mb-6">
                {sortedRootReplies.map(reply => (
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
            <form 
              onSubmit={onSubmitReply} 
              className="mt-4"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file && file.type.startsWith('image/')) {
                  setReplyImageFile(file);
                }
              }}
            >
              {replyImageFile && (
                <div className="relative inline-block mb-3">
                  <div className="w-20 h-20 rounded-xl overflow-hidden border border-luxury-ink/10">
                    <img src={URL.createObjectURL(replyImageFile)} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyImageFile(null)}
                    className="absolute -top-1.5 -right-1.5 bg-luxury-ink text-white p-1 rounded-full"
                  >
                    <X size={10} />
                  </button>
                </div>
              )}
              <div className="flex gap-3 items-end">
                <input
                  id="reply-input"
                  type="text"
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="Write a reply..."
                  className="flex-1 bg-surface-base border border-luxury-ink/5 rounded-xl py-3 px-4 focus:outline-none focus:border-brand-teal text-sm font-medium"
                />
                <label className="p-3 rounded-xl border border-luxury-ink/5 text-luxury-ink/40 hover:text-brand-teal hover:border-brand-teal/30 cursor-pointer transition-colors shrink-0">
                  <ImageIcon size={18} />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setReplyImageFile(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />
                </label>
                <button
                  type="submit"
                  disabled={(!replyContent.trim() && !replyImageFile) || isSubmitting}
                  className="bg-brand-teal text-white px-5 py-3 rounded-xl text-[11px] font-bold uppercase tracking-[0.2em] shadow-lg shadow-brand-teal/20 hover:bg-brand-pink transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {isUploadingReplyImage ? '...' : 'Send'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Action Bar */}
        <div className="px-4 sm:px-6 md:px-8 py-4 border-t border-luxury-ink/5 flex flex-col gap-4 bg-surface-base/50">
          
          <div className="flex items-center justify-between w-full flex-wrap gap-2">
            <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
              <div className="flex items-center gap-1 bg-surface-soft/50 rounded-2xl p-1">
                  <button
                    onClick={() => onUpvote(post)}
                    className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-sm font-bold transition-all ${hasUpvoted ? 'bg-brand-pink/10 text-brand-pink' : 'hover:bg-white text-luxury-ink/40 hover:text-brand-pink'}`}
                  >
                    <Heart size={20} className={hasUpvoted ? 'fill-brand-pink' : ''} />
                    {post.upvotesCount || 0}
                  </button>
                  <div className="w-1px h-6 bg-luxury-ink/10"></div>
                  <button
                    onClick={() => onDownvote(post)}
                    className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-sm font-bold transition-all ${hasDownvoted ? 'bg-indigo-500/10 text-indigo-500' : 'hover:bg-white text-luxury-ink/40 hover:text-indigo-500'}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill={hasDownvoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path>
                    </svg>
                    {post.downvotesCount || 0}
                  </button>
                </div>
              <button
                onClick={() => document.getElementById('reply-input')?.focus()}
                className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-3 hover:bg-surface-soft rounded-2xl text-sm font-bold text-luxury-ink/40 hover:text-brand-teal transition-all"
              >
                <MessageSquare size={20} className="sm:w-6 sm:h-6" />
                {post.repliesCount || 0}
              </button>
              <button
                onClick={() => onShare(post)}
                className="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 hover:bg-surface-soft rounded-xl text-xs font-bold text-luxury-ink/40 hover:text-brand-teal transition-all"
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
  const [privacy, setPrivacy] = useState('public');
  const [showPostOptions, setShowPostOptions] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingStatus, setSubmittingStatus] = useState('Posting...');
  const [contentType, setContentType] = useState<'all' | 'posts' | 'marketplace'>('all');
  const [shareModalData, setShareModalData] = useState<{isOpen: boolean, url: string, title: string, sharedPost?: any}>({isOpen: false, url: '', title: ''});

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
  const [downvotedPostIds, setDownvotedPostIds] = useState<Set<string>>(new Set());
  const [savedPostIds, setSavedPostIds] = useState<Set<string>>(new Set());
  const [downvoteMap, setDownvoteMap] = useState<Record<string, string>>({});

  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [replies, setReplies] = useState<any[]>([]);
  const [replyContent, setReplyContent] = useState('');
  const [replyImageFile, setReplyImageFile] = useState<File | null>(null);
  const [isUploadingReplyImage, setIsUploadingReplyImage] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{id: string, name: string} | null>(null);
  const [replyUpvotedIds, setReplyUpvotedIds] = useState<Set<string>>(new Set());
  const [replyUpvoteMap, setReplyUpvoteMap] = useState<Record<string, string>>({});

  // Lock body scroll when a modal is open
  useScrollLock(isModalOpen || !!selectedPost || cropImageSrc !== null);

  const [wishlisted, setWishlisted] = useState<Set<string>>(new Set());
  const [wishlistMap, setWishlistMap] = useState<Record<string, string>>({});

  const [rawPosts, setRawPosts] = useState<Post[]>([]);
  const [visibleCount, setVisibleCount] = useState(6); // Show 6 items initially, load more on scroll

  const [searchParams, setSearchParams] = useSearchParams();
  const postIdFromUrl = searchParams.get('postId');
  
  useEffect(() => {
    if (!postIdFromUrl) return;

    // Clear the query param immediately so it doesn't re-trigger
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('postId');
    setSearchParams(newParams, { replace: true });

    // Try to find the post locally first
    const localPost = rawPosts.find(p => p.id === postIdFromUrl);
    if (localPost) {
      setSelectedPost(localPost);
      return;
    }

    // Not in local feed — fetch directly from Firestore
    getDoc(doc(db, 'posts', postIdFromUrl)).then(snap => {
      if (snap.exists()) {
        setSelectedPost({ id: snap.id, ...snap.data() } as Post);
      }
    });
  }, [postIdFromUrl]);
  
  // Confession state
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [selectedPostType, setSelectedPostType] = useState('info');

  // Poll state
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollChoices, setPollChoices] = useState<string[]>(['', '']);
  const [pollDays, setPollDays] = useState(1);
  const [pollHours, setPollHours] = useState(0);
  const [pollMinutes, setPollMinutes] = useState(0);

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
          const isPostAnon = data.isAnonymous === true;
          const authorData = isPostAnon ? {} : (userCache[data.authorId] || {});
          
          fetchedPosts.push({
            id: docSnap.id,
            ...data,
            // Prioritize real-time user data, fallback to denormalized data
            authorName: isPostAnon ? (data.authorName || data.personaName || 'Anonymous') : (authorData.name || data.authorName || 'Unknown User'),
            authorProfilePicture: isPostAnon ? null : (authorData.profilePicture || data.authorProfilePicture || null),
            school: authorData.school || data.school || 'Unknown School',
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
    const sellerCache: Record<string, any> = {};

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        const fetchedProducts: Product[] = [];

        const uncachedIds = new Set<string>();
        snapshot.forEach(docSnap => {
          const sellerId = docSnap.data().sellerId;
          if (sellerId && !sellerCache[sellerId]) uncachedIds.add(sellerId);
        });
        if (uncachedIds.size > 0) {
          await Promise.all(Array.from(uncachedIds).map(async (uid) => {
            const uDoc = await getDoc(doc(db, 'users', uid));
            sellerCache[uid] = uDoc.exists() ? uDoc.data() : {};
          }));
        }

        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          const sellerData = sellerCache[data.sellerId] || {};
          fetchedProducts.push({
            id: docSnap.id,
            ...data,
            sellerName: sellerData.name || data.sellerName || 'Unknown User',
            sellerSchool: sellerData.school || data.sellerSchool || 'Unknown School',
            sellerProfilePicture: sellerData.profilePicture || data.sellerProfilePicture || null,
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
    const q = query(collection(db, 'post_downvotes'), where('userId', '==', user.uid));
    const unsub = onSnapshot(q, snap => {
      const ids = new Set<string>();
      const map: Record<string, string> = {};
      snap.forEach(d => {
        ids.add(d.data().postId);
        map[d.data().postId] = d.id;
      });
      setDownvotedPostIds(ids);
      setDownvoteMap(map);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'saved_posts'), where('userId', '==', user.uid));
    const unsub = onSnapshot(q, snap => {
      const ids = new Set<string>();
      snap.forEach(d => {
        ids.add(d.data().postId);
      });
      setSavedPostIds(ids);
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

  // ─── Paste to add image ───────────────────────────────
  useEffect(() => {
    if (!isModalOpen) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const pastedImages: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) pastedImages.push(file);
        }
      }
      if (pastedImages.length > 0) {
        const dt = new DataTransfer();
        pastedImages.forEach(f => dt.items.add(f));
        handleFilesSelected(dt.files);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isModalOpen]);

  // ─── Paste to add image to reply ───────────────────────────────
  useEffect(() => {
    if (!selectedPost) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            setReplyImageFile(file);
            e.preventDefault();
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [selectedPost]);

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

    let personaName = userData?.anonymousPersonaName || '';
    const isPostAnonymous = type === 'confession' && isAnonymous;

    if (isPostAnonymous && !personaName) {
      const inputName = window.prompt('Please enter an anonymous persona name (e.g. Lost Freshman) to post anonymously:');
      if (!inputName || !inputName.trim()) {
        showToast('Anonymous persona name is required to post anonymously.', 'error');
        setIsSubmitting(false);
        return;
      }
      personaName = inputName.trim();
      
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          anonymousPersonaName: personaName,
          updatedAt: serverTimestamp()
        });
        if (userData) {
          userData.anonymousPersonaName = personaName;
        }
        showToast('Anonymous persona name set successfully!', 'success');
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
        setIsSubmitting(false);
        return;
      }
    }

    try {
      let imageUrls: string[] = [];
      if (imageFiles.length > 0) {
        setSubmittingStatus('Uploading images...');
        imageUrls = await Promise.all(imageFiles.map(file => uploadPostImage(file)));
      }

      const isTextClean = isTextSafe(title) && isTextSafe(content);
      let areImagesSafe = true;

      if (imageUrls.length > 0 && isTextClean) {
        // Only run NSFW scan if text is already clean (otherwise post goes to pending anyway)
        setSubmittingStatus('Scanning images for safety...');
        const moderationResult = await checkAllImagesSafety(imageFiles);
        areImagesSafe = moderationResult.isSafe;
        if (!areImagesSafe) {
          console.log('[Feed] Image flagged:', moderationResult.reason);
        }
      }

      const shouldAutoApprove = isTextClean && areImagesSafe;
      const initialStatus = shouldAutoApprove ? 'approved' : 'pending';
      setSubmittingStatus('Publishing...');

      const postDocRef = await addDoc(collection(db, 'posts'), {
        title,
        content,
        type,
        isAnonymous: isPostAnonymous,
        personaName: isPostAnonymous ? personaName : null,
        reactionsCount: type === 'confession' ? {} : null,
        city: userData.city || 'Lucknow',
        school: userData.school,
        authorId: user.uid,
        authorName: isPostAnonymous ? personaName : (userData.name || user.email),
        authorProfilePicture: isPostAnonymous ? null : (userData.profilePicture || null),
        status: initialStatus,
        privacy,
        imageUrls,
        upvotesCount: 0,
        repliesCount: 0,
        ...(showPollCreator && pollChoices.filter(c => c.trim()).length >= 2 ? {
          poll: {
            choices: pollChoices.filter(c => c.trim()),
            expiresAt: new Date(Date.now() + (pollDays * 86400000) + (pollHours * 3600000) + (pollMinutes * 60000)),
            votes: {},
          }
        } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (shouldAutoApprove) {
        showToast('Post published successfully!', 'success');
        
        // Notify followers of the author in real-time (skip for anonymous posts)
        if (!isPostAnonymous) {
          const authorName = userData.name || user.email;
          const followsSnap = await getDocs(query(collection(db, 'follows'), where('followingId', '==', user.uid)));
          followsSnap.forEach(f => {
            const followerId = f.data().followerId;
            createNotification({ 
              userId: followerId, 
              type: 'new_message', 
              title: 'New Post', 
              message: `${authorName} just posted: "${title}"`, 
              link: `/dashboard`,
              postId: postDocRef.id
            });
          });
        }
      } else {
        if (!isTextClean) {
          showToast('Post flagged for containing sensitive words. Submitted for review.', 'warning');
        } else if (!areImagesSafe) {
          showToast('Image flagged by safety check. Submitted for manual review.', 'warning');
        } else {
          showToast('Post submitted for approval!', 'success');
        }
      }

      setIsModalOpen(false);
      setImageFiles([]);
      setPendingFiles([]);
      setIsAnonymous(false);
      setSelectedPostType('info');
      setShowPollCreator(false);
      setPollChoices(['', '']);
      setPollDays(1);
      setPollHours(0);
      setPollMinutes(0);
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

    const isUpvoted = upvotedPostIds.has(post.id);
    const isDownvoted = downvotedPostIds.has(post.id);

    // Optimistic UI update
    setUpvotedPostIds(prev => {
      const next = new Set(prev);
      if (isUpvoted) next.delete(post.id);
      else next.add(post.id);
      return next;
    });

    if (!isUpvoted && isDownvoted) {
      setDownvotedPostIds(prev => {
        const next = new Set(prev);
        next.delete(post.id);
        return next;
      });
    }

    try {
      if (isUpvoted) {
        const upvoteId = upvoteMap[post.id];
        if (upvoteId) await deleteDoc(doc(db, 'post_upvotes', upvoteId));
        await updateDoc(doc(db, 'posts', post.id), {
          upvotesCount: Math.max(0, (post.upvotesCount || 0) - 1),
          updatedAt: serverTimestamp()
        });
      } else {
        // Remove downvote if it exists
        if (downvotedPostIds.has(post.id)) {
          const downvoteId = downvoteMap[post.id];
          if (downvoteId) await deleteDoc(doc(db, 'post_downvotes', downvoteId));
          await updateDoc(doc(db, 'posts', post.id), {
            upvotesCount: (post.upvotesCount || 0) + 1,
            downvotesCount: Math.max(0, (post.downvotesCount || 0) - 1),
            updatedAt: serverTimestamp()
          });
        } else {
          await updateDoc(doc(db, 'posts', post.id), {
            upvotesCount: (post.upvotesCount || 0) + 1,
            updatedAt: serverTimestamp()
          });
        }
        await addDoc(collection(db, 'post_upvotes'), {
          userId: user.uid,
          postId: post.id
        });
      }
    } catch (e) {
      // Revert optimistic update
      setUpvotedPostIds(prev => {
        const next = new Set(prev);
        if (isUpvoted) next.add(post.id);
        else next.delete(post.id);
        return next;
      });
      if (!isUpvoted && isDownvoted) {
        setDownvotedPostIds(prev => {
          const next = new Set(prev);
          next.add(post.id);
          return next;
        });
      }
      handleFirestoreError(e, OperationType.UPDATE, 'posts');
    }
  };

  const handleDownvote = async (post: Post) => {
    if (!user) {
      window.location.href = '/login';
      return;
    }
    if (!userData?.verified) {
      showToast('You must be verified to dislike.', 'error');
      return;
    }

    const isDownvoted = downvotedPostIds.has(post.id);
    const isUpvoted = upvotedPostIds.has(post.id);

    // Optimistic UI update
    setDownvotedPostIds(prev => {
      const next = new Set(prev);
      if (isDownvoted) next.delete(post.id);
      else next.add(post.id);
      return next;
    });

    if (!isDownvoted && isUpvoted) {
      setUpvotedPostIds(prev => {
        const next = new Set(prev);
        next.delete(post.id);
        return next;
      });
    }

    try {
      if (isDownvoted) {
        const downvoteId = downvoteMap[post.id];
        if (downvoteId) await deleteDoc(doc(db, 'post_downvotes', downvoteId));
        await updateDoc(doc(db, 'posts', post.id), {
          downvotesCount: Math.max(0, (post.downvotesCount || 0) - 1),
          updatedAt: serverTimestamp()
        });
      } else {
        // Remove upvote if it exists
        if (upvotedPostIds.has(post.id)) {
          const upvoteId = upvoteMap[post.id];
          if (upvoteId) await deleteDoc(doc(db, 'post_upvotes', upvoteId));
          await updateDoc(doc(db, 'posts', post.id), {
            downvotesCount: (post.downvotesCount || 0) + 1,
            upvotesCount: Math.max(0, (post.upvotesCount || 0) - 1),
            updatedAt: serverTimestamp()
          });
        } else {
          await updateDoc(doc(db, 'posts', post.id), {
            downvotesCount: (post.downvotesCount || 0) + 1,
            updatedAt: serverTimestamp()
          });
        }
        await addDoc(collection(db, 'post_downvotes'), {
          userId: user.uid,
          postId: post.id
        });
      }
    } catch (e) {
      // Revert optimistic update
      setDownvotedPostIds(prev => {
        const next = new Set(prev);
        if (isDownvoted) next.add(post.id);
        else next.delete(post.id);
        return next;
      });
      if (!isDownvoted && isUpvoted) {
        setUpvotedPostIds(prev => {
          const next = new Set(prev);
          next.add(post.id);
          return next;
        });
      }
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
    const isUpvoted = replyUpvotedIds.has(replyId);

    // Optimistic UI update
    setReplyUpvotedIds(prev => {
      const next = new Set(prev);
      if (isUpvoted) next.delete(replyId);
      else next.add(replyId);
      return next;
    });

    try {
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
      // Revert optimistic update
      setReplyUpvotedIds(prev => {
        const next = new Set(prev);
        if (isUpvoted) next.add(replyId);
        else next.delete(replyId);
        return next;
      });
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
    if (!selectedPost || (!replyContent.trim() && !replyImageFile) || isSubmitting) return;

    setIsSubmitting(true);
    try {
      let imageUrl: string | null = null;
      if (replyImageFile) {
        setIsUploadingReplyImage(true);
        const safety = await checkImageSafety(replyImageFile);
        if (!safety.isSafe) {
          showToast('Image flagged by safety check. Please choose a different image.', 'error');
          setIsUploadingReplyImage(false);
          setIsSubmitting(false);
          return;
        }
        imageUrl = await uploadReplyImage(replyImageFile);
        setIsUploadingReplyImage(false);
      }

      const replyData = {
        postId: selectedPost.id,
        content: replyContent.trim() || ' ',
        authorId: user.uid,
        authorName: userData?.name || user.email?.split('@')[0] || 'Anonymous',
        authorSchool: userData?.school || 'Unknown School',
        authorProfilePicture: userData?.profilePicture || null,
        createdAt: serverTimestamp(),
        ...(imageUrl && { imageUrl }),
        ...(replyingTo && { parentId: replyingTo.id })
      };

      await addDoc(collection(db, 'post_replies'), replyData);
      
      const postRef = doc(db, 'posts', selectedPost.id);
      await updateDoc(postRef, {
        repliesCount: (selectedPost.repliesCount || 0) + 1
      });

      // Send notification to post author
      if (selectedPost.authorId !== user.uid) {
        createNotification({
          userId: selectedPost.authorId,
          type: 'new_message',
          title: 'New Comment',
          message: `${userData?.name || user.email?.split('@')[0]} commented on your post`,
          link: `/post/${selectedPost.id}`,
          postId: selectedPost.id
        });
      }
      
      if (replyingTo) {
        const parentReplyRef = doc(db, 'post_replies', replyingTo.id);
        const parentReply = replies.find(r => r.id === replyingTo.id);
        if (parentReply) {
          await updateDoc(parentReplyRef, {
            repliesCount: (parentReply.repliesCount || 0) + 1,
            updatedAt: serverTimestamp()
          });

          // Send notification to parent reply author
          if (parentReply.authorId !== user.uid) {
            createNotification({
              userId: parentReply.authorId,
              type: 'new_message',
              title: 'New Reply',
              message: `${userData?.name || user.email?.split('@')[0]} replied to your comment`,
              link: `/post/${selectedPost.id}`,
              postId: selectedPost.id
            });
          }
        }
      }

      setReplyContent('');
      setReplyImageFile(null);
      setReplyingTo(null);
      showToast('Reply posted!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'post_replies');
      showToast('Failed to post reply', 'error');
    } finally {
      setIsSubmitting(false);
      setIsUploadingReplyImage(false);
    }
  };

  const handleShare = (post: Post) => {
    const url = window.location.origin + '/post/' + post.id;
    setShareModalData({
      isOpen: true,
      url,
      title: post.title,
      sharedPost: {
        id: post.id,
        title: post.title,
        description: post.content || '',
        image: post.imageUrls?.[0] || post.imageUrl || undefined,
        authorName: post.authorName || 'Unknown User',
        kind: 'post',
      }
    });
  };

  const handleShareProduct = (product: Product) => {
    const url = window.location.origin + '/product/' + product.id;
    setShareModalData({
      isOpen: true,
      url,
      title: product.title,
      sharedPost: {
        id: product.id,
        title: product.title,
        description: typeof product.price === 'number' ? `₹${product.price}` : '',
        image: product.images?.[0] || product.image || undefined,
        authorName: product.sellerName || 'Unknown User',
        kind: 'product',
      }
    });
  };

  const handleSavePost = async (post: Post) => {
    if (!user) {
      showToast('Please log in to save posts', 'error');
      return;
    }
    try {
      if (savedPostIds.has(post.id)) {
        await unsavePost(user.uid, post.id);
        showToast('Post removed from saved', 'info');
      } else {
        await savePost(user.uid, post.id);
        showToast('Post saved!', 'success');
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to save post', 'error');
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

      const downvotesQ = query(collection(db, 'post_downvotes'), where('postId', '==', postId));
      const downvotesSnap = await getDocs(downvotesQ);
      downvotesSnap.forEach(docSnap => batch.delete(docSnap.ref));

      const reactionsQ = query(collection(db, 'post_reactions'), where('postId', '==', postId));
      const reactionsSnap = await getDocs(reactionsQ);
      reactionsSnap.forEach(docSnap => batch.delete(docSnap.ref));

      // We do not delete notifications here because it violates security rules 
      // (some notifications might belong to other users), and standard behavior
      // is to simply show "Post not found" when clicking an old notification.

      await batch.commit();

      // Delete the post separately AFTER the batch. If the post is deleted inside
      // the batch, the security rules evaluating `get()` for the related documents 
      // will fail because the post is considered deleted during evaluation.
      await deleteDoc(doc(db, 'posts', postId));
      
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
    <div className="pb-20 w-full overflow-x-hidden">
      <SEO 
        title="Home" 
        description="Discover school info, notes, and interschool events on Nextbench Community." 
      />

      {/* Sticky Header Tabs */}
      <div className="sticky top-0 z-40 nav-glass border-b flex items-center px-4 sm:px-6 gap-1" style={{ borderColor: 'var(--color-border)' }}>
        <button
          onClick={() => { setContentType('all'); setVisibleCount(6); }}
          className={`py-3.5 px-4 text-sm font-semibold transition-all border-b-2 whitespace-nowrap ${contentType === 'all' ? 'border-luxury-ink text-luxury-ink' : 'border-transparent text-luxury-ink/40 hover:text-luxury-ink/70'}`}
        >
          For you
        </button>
        <button
          onClick={() => { setContentType('posts'); setVisibleCount(6); }}
          className={`py-3.5 px-4 text-sm font-semibold transition-all border-b-2 whitespace-nowrap ${contentType === 'posts' ? 'border-luxury-ink text-luxury-ink' : 'border-transparent text-luxury-ink/40 hover:text-luxury-ink/70'}`}
        >
          Posts
        </button>
        <button
          onClick={() => { setContentType('marketplace'); setVisibleCount(6); }}
          className={`py-3.5 px-4 text-sm font-semibold transition-all border-b-2 whitespace-nowrap ${contentType === 'marketplace' ? 'border-luxury-ink text-luxury-ink' : 'border-transparent text-luxury-ink/40 hover:text-luxury-ink/70'}`}
        >
          Marketplace
        </button>
      </div>

      {/* Compose Bar — LinkedIn style */}
      {user && userData?.verified && (
        <div className="border-b px-4 py-3 flex items-center gap-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-card)' }}>
          <div className="w-9 h-9 rounded-full bg-surface-soft flex items-center justify-center overflow-hidden shrink-0">
            {userData?.profilePicture ? (
              <img src={getOptimizedImageUrl(userData.profilePicture)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <span className="text-brand-teal font-semibold text-sm">{(userData?.name || 'U')[0].toUpperCase()}</span>
            )}
          </div>
          <button
            onClick={() => { setIsModalOpen(true); preloadModerationModel(); }}
            className="flex-1 text-left px-4 py-2.5 rounded-full border text-sm text-luxury-ink/40 hover:bg-surface-soft transition-colors"
            style={{ borderColor: 'var(--color-border)' }}
          >
            What's on your mind?
          </button>
        </div>
      )}

      {/* Floating Action Button for Mobile */}
      {user && userData?.verified && (
        <button
          onClick={() => { setIsModalOpen(true); preloadModerationModel(); }}
          className="fixed bottom-24 right-4 sm:hidden z-50 flex items-center justify-center w-14 h-14 bg-brand-teal text-white rounded-full shadow-xl hover:scale-105 active:scale-95 transition-all"
        >
          <Plus size={24} />
        </button>
      )}

      {/* Feed */}
      {loading ? (
        <div className="flex flex-col w-full min-w-0">
          {Array.from({ length: 5 }).map((_, i) => <PostCardSkeleton key={i} />)}
        </div>
      ) : (
        <>
          <div className="flex flex-col w-full min-w-0">
            <AnimatePresence>
              {combinedFeed.slice(0, visibleCount).map((item, index) => {
                const isProduct = item._kind === 'product';
                
                const card = isProduct ? (
                  <ProductCard 
                    key={`prod-${item.id}`} 
                    product={item as Product} 
                    isWishlisted={wishlisted.has(item.id)} 
                    wishlistDocId={wishlistMap[item.id]} 
                    onShare={handleShareProduct}
                  />
                ) : (
                  <PostCard 
                    key={`post-${item.id}`} 
                    post={item as Post} 
                    hasUpvoted={upvotedPostIds.has(item.id)} 
                    hasDownvoted={downvotedPostIds.has(item.id)}
                    hasSaved={savedPostIds.has(item.id)}
                    onClick={() => setSelectedPost(item as Post)}
                    onUpvote={handleUpvote}
                    onDownvote={handleDownvote}
                    onShare={handleShare}
                    onSave={handleSavePost}
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

            {/* Load-more skeletons shown while more items exist */}
            {visibleCount < combinedFeed.length && (
              <InfiniteScrollSentinel onVisible={() => setVisibleCount(v => v + 6)} />
            )}
          </div>

          {!loading && combinedFeed.length === 0 && (
            <div className="py-20 text-center px-4">
              <GraduationCap className="mx-auto text-luxury-ink/10 mb-4" size={48} />
              <p className="text-luxury-ink/50 text-base mb-1">
                {contentType === 'marketplace' ? 'No items listed yet.' : 'No posts yet.'}
              </p>
              <p className="text-sm text-luxury-ink/30">
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
            onDownvote={handleDownvote}
            hasDownvoted={downvotedPostIds.has(selectedPost.id)}
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
            replyImageFile={replyImageFile}
            setReplyImageFile={setReplyImageFile}
            isUploadingReplyImage={isUploadingReplyImage}
          />
        )}
      </AnimatePresence>

      {/* ─── Create Post Modal ──────────────────────────── */}
      {createPortal(
        <AnimatePresence>
          {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => {
              if (isSubmitting) return;
              const form = document.getElementById('create-post-form') as HTMLFormElement;
              const titleNode = form?.elements.namedItem('title') as HTMLInputElement;
              const contentNode = form?.elements.namedItem('content') as HTMLTextAreaElement;
              const title = titleNode?.value || '';
              const content = contentNode?.value || '';
              if (title.trim() || content.trim() || imageFiles.length > 0) {
                if (window.confirm('Discard your post?')) {
                  setIsModalOpen(false);
                  setImageFiles([]);
                  setPendingFiles([]);
                }
              } else {
                setIsModalOpen(false);
                setImageFiles([]);
                setPendingFiles([]);
              }
            }}
            className="fixed inset-0 z-100 flex items-center justify-center p-0 sm:p-4 bg-luxury-ink/20 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-surface-card w-full h-full sm:h-auto sm:rounded-3xl sm:max-w-2xl relative shadow-2xl overflow-hidden sm:max-h-[90vh] flex flex-col"
            >
              {/* Close Button */}
              <button
                type="button"
                onClick={() => {
                  if (isSubmitting) return;
                  const form = document.getElementById('create-post-form') as HTMLFormElement;
                  const titleNode = form?.elements.namedItem('title') as HTMLInputElement;
                  const contentNode = form?.elements.namedItem('content') as HTMLTextAreaElement;
                  const title = titleNode?.value || '';
                  const content = contentNode?.value || '';
                  if (title.trim() || content.trim() || imageFiles.length > 0) {
                    if (window.confirm('Discard your post?')) {
                      setIsModalOpen(false);
                      setImageFiles([]);
                      setPendingFiles([]);
                    }
                  } else {
                    setIsModalOpen(false);
                    setImageFiles([]);
                    setPendingFiles([]);
                  }
                }}
                className="absolute top-4 right-4 z-50 w-8 h-8 flex items-center justify-center rounded-full bg-luxury-ink/10 hover:bg-luxury-ink/20 text-luxury-ink/50 hover:text-luxury-ink/80 transition-all"
              >
                <X size={16} />
              </button>

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
                    <p className="text-luxury-ink font-bold text-lg">{submittingStatus}</p>
                    <p className="text-luxury-ink/50 text-sm mt-1">{submittingStatus === 'Scanning images for safety...' ? 'AI is checking your images — this only takes a moment' : 'Uploading media and publishing to community'}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="p-6 pb-24 md:p-8 overflow-y-auto flex-1 flex flex-col min-h-0">
                <form id="create-post-form" onSubmit={handleCreatePost} className="flex flex-col h-full relative flex-1">
                  <input type="hidden" name="type" value={selectedPostType} />
                  <input type="hidden" name="privacy" value={privacy} />
                  
                  {/* Top Bar with Avatar */}
                  <div className="flex items-center gap-3 mb-6 px-1">
                    <div className="w-10 h-10 rounded-full bg-brand-teal/10 flex items-center justify-center text-brand-teal font-bold text-sm overflow-hidden shrink-0">
                      {userData?.profilePicture ? (
                        <img src={getOptimizedImageUrl(userData.profilePicture)} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        userData?.name?.[0]?.toUpperCase() || <Users size={16} />
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[15px] font-semibold text-luxury-ink">
                        {selectedPostType === 'confession' && isAnonymous 
                          ? userData?.anonymousPersonaName || 'Anonymous' 
                          : (userData?.name || 'User')}
                      </span>
                      {selectedPostType === 'confession' && !isAnonymous && (
                        <span className="text-[11px] text-amber-500 font-semibold flex items-center gap-1">
                          Posting publicly in anonymous posts!
                        </span>
                      )}
                      {selectedPostType === 'confession' && isAnonymous && !userData?.anonymousPersonaName && (
                         <Link to={`/profile/${user?.uid}`} onClick={() => setIsModalOpen(false)} className="text-[11px] text-purple-600 hover:underline">Set up anonymous persona</Link>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4 flex-1 px-1 flex flex-col">
                    <input
                      name="title"
                      type="text"
                      required
                      placeholder="Title"
                      className="w-full bg-transparent text-3xl font-bold text-luxury-ink placeholder-luxury-ink/30 focus:outline-none"
                    />

                    <textarea
                      name="content"
                      required
                      placeholder="What's on your mind?"
                      className="w-full flex-1 bg-transparent text-[16px] leading-relaxed text-luxury-ink/80 placeholder-luxury-ink/40 focus:outline-none resize-none min-h-75"
                    ></textarea>

                    {/* Poll Creator */}
                    {showPollCreator && (
                      <div className="mx-1 mb-4 p-4 rounded-2xl border border-luxury-ink/10 bg-surface-base/50">
                        <div className="space-y-3 mb-4">
                          {pollChoices.map((choice, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg bg-luxury-ink/5 flex items-center justify-center shrink-0">
                                <BarChart3 size={14} className="text-luxury-ink/30" />
                              </div>
                              <input
                                type="text"
                                value={choice}
                                onChange={(e) => {
                                  const newChoices = [...pollChoices];
                                  newChoices[i] = e.target.value;
                                  setPollChoices(newChoices);
                                }}
                                placeholder={`Choice ${i + 1}`}
                                maxLength={25}
                                className="flex-1 bg-transparent border border-luxury-ink/10 rounded-xl px-3 py-2 text-sm font-medium text-luxury-ink placeholder-luxury-ink/30 focus:outline-none focus:border-brand-teal transition-colors"
                              />
                              <span className="text-[11px] text-luxury-ink/30 font-mono shrink-0">{choice.length}/25</span>
                              {pollChoices.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => setPollChoices(pollChoices.filter((_, j) => j !== i))}
                                  className="p-1 text-luxury-ink/30 hover:text-red-500 transition-colors"
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        {pollChoices.length < 4 && (
                          <button
                            type="button"
                            onClick={() => setPollChoices([...pollChoices, ''])}
                            className="flex items-center gap-2 text-[13px] font-semibold text-brand-teal hover:text-brand-teal/80 transition-colors mb-4"
                          >
                            <Plus size={14} /> Add choice
                          </button>
                        )}
                        <div className="border-t border-luxury-ink/5 pt-4">
                          <p className="text-[12px] font-bold text-luxury-ink/50 mb-3">Poll length</p>
                          <div className="flex gap-3">
                            <div className="flex-1">
                              <label className="text-[10px] text-luxury-ink/40 font-semibold">Days</label>
                              <select value={pollDays} onChange={(e) => setPollDays(Number(e.target.value))} className="w-full mt-1 bg-surface-card border border-luxury-ink/10 rounded-xl px-3 py-2 text-sm font-semibold text-luxury-ink focus:outline-none focus:border-brand-teal appearance-none cursor-pointer">
                                {[0,1,2,3,4,5,6,7].map(d => <option key={d} value={d}>{d}</option>)}
                              </select>
                            </div>
                            <div className="flex-1">
                              <label className="text-[10px] text-luxury-ink/40 font-semibold">Hours</label>
                              <select value={pollHours} onChange={(e) => setPollHours(Number(e.target.value))} className="w-full mt-1 bg-surface-card border border-luxury-ink/10 rounded-xl px-3 py-2 text-sm font-semibold text-luxury-ink focus:outline-none focus:border-brand-teal appearance-none cursor-pointer">
                                {Array.from({length:24},(_,i)=>i).map(h => <option key={h} value={h}>{h}</option>)}
                              </select>
                            </div>
                            <div className="flex-1">
                              <label className="text-[10px] text-luxury-ink/40 font-semibold">Minutes</label>
                              <select value={pollMinutes} onChange={(e) => setPollMinutes(Number(e.target.value))} className="w-full mt-1 bg-surface-card border border-luxury-ink/10 rounded-xl px-3 py-2 text-sm font-semibold text-luxury-ink focus:outline-none focus:border-brand-teal appearance-none cursor-pointer">
                                {[0,5,10,15,20,25,30,45].map(m => <option key={m} value={m}>{m}</option>)}
                              </select>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setShowPollCreator(false); setPollChoices(['', '']); }}
                          className="mt-4 w-full text-center text-[13px] font-semibold text-red-400 hover:text-red-500 transition-colors"
                        >
                          Remove poll
                        </button>
                      </div>
                    )}

                    {/* Image Previews */}
                    {imageFiles.length > 0 && (
                      <div className="mt-4 flex gap-2 overflow-x-auto pb-2 no-scrollbar shrink-0">
                        {imageFiles.map((file, index) => (
                          <div key={index} className="relative group shrink-0">
                            <div className="w-24 h-24 rounded-xl overflow-hidden border border-luxury-ink/10">
                              <img src={URL.createObjectURL(file)} alt="Preview" className="w-full h-full object-cover" />
                            </div>
                            <button
                              type="button"
                              onClick={() => setImageFiles(prev => prev.filter((_, i) => i !== index))}
                              className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Bottom Toolbar */}
                  <div className="mt-4 pt-4 border-t border-luxury-ink/5 flex flex-wrap items-center justify-between gap-y-3 relative px-1 bottom-0 bg-surface-card pb-2">
                    <div className="flex items-center gap-1 relative">
                      <label className="p-2.5 rounded-full hover:bg-surface-soft text-luxury-ink/50 hover:text-brand-teal transition-colors cursor-pointer group relative">
                        <ImageIcon size={22} />
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                              handleFilesSelected(e.target.files);
                            }
                          }}
                          className="hidden"
                        />
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-gray-100 text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">Add Image</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowPollCreator(!showPollCreator)}
                        className={`p-2.5 rounded-full transition-colors group relative ${showPollCreator ? 'bg-brand-teal/10 text-brand-teal' : 'hover:bg-surface-soft text-luxury-ink/50 hover:text-brand-teal'}`}
                      >
                        <BarChart3 size={22} />
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-gray-100 text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">Add Poll</span>
                      </button>

                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowPostOptions(!showPostOptions)}
                          className={`p-2.5 rounded-full transition-colors ${showPostOptions ? 'bg-surface-soft text-brand-teal' : 'hover:bg-surface-soft text-luxury-ink/50 hover:text-brand-teal'}`}
                        >
                          <MoreHorizontal size={22} />
                        </button>
                        
                        {/* Options Popover */}
                        <AnimatePresence>
                          {showPostOptions && (
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              className="absolute bottom-full left-0 mb-2 w-64 bg-surface-card rounded-2xl shadow-xl border border-luxury-ink/10 overflow-hidden z-20 p-2"
                            >
                              <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-luxury-ink/40">Privacy</div>
                              <button type="button" onClick={() => { setPrivacy('public'); setShowPostOptions(false); }} className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-surface-soft rounded-xl text-[13px] font-semibold text-luxury-ink transition-colors">
                                <span className="flex items-center gap-2"><Globe size={16} className="text-brand-teal" /> Public</span>
                                {privacy === 'public' && <div className="w-1.5 h-1.5 rounded-full bg-brand-teal"></div>}
                              </button>
                              <button type="button" onClick={() => { setPrivacy('private'); setShowPostOptions(false); }} className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-surface-soft rounded-xl text-[13px] font-semibold text-luxury-ink transition-colors">
                                <span className="flex items-center gap-2"><Lock size={16} className="text-brand-teal" /> Friends Only</span>
                                {privacy === 'private' && <div className="w-1.5 h-1.5 rounded-full bg-brand-teal"></div>}
                              </button>
                              
                              <div className="px-3 py-2 mt-2 border-t border-luxury-ink/5 text-[10px] font-bold uppercase tracking-widest text-luxury-ink/40">Post Type</div>
                              {POST_TYPES.map(t => (
                                <button 
                                  key={t.id} 
                                  type="button" 
                                  onClick={() => { 
                                    setSelectedPostType(t.id); 
                                    if (t.id === 'confession') setIsAnonymous(true); 
                                    else setIsAnonymous(false);
                                    setShowPostOptions(false);
                                  }} 
                                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-surface-soft rounded-xl text-[13px] font-semibold text-luxury-ink transition-colors"
                                >
                                  <span>{t.label}</span>
                                  {selectedPostType === t.id && <div className="w-1.5 h-1.5 rounded-full bg-brand-teal"></div>}
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      
                      {/* Active selections indicator */}
                      <div className="ml-2 flex items-center gap-2">
                        {privacy === 'private' && (
                          <button type="button" onClick={() => setShowPostOptions(!showPostOptions)} className="flex items-center gap-1 text-[10px] font-semibold bg-surface-soft hover:bg-surface-soft/80 transition-colors text-luxury-ink/60 px-2 py-0.5 rounded-full cursor-pointer">
                            <Lock size={10} /> Friends
                          </button>
                        )}
                        <button type="button" onClick={() => setShowPostOptions(!showPostOptions)} className="flex items-center gap-1 text-[10px] font-semibold bg-surface-soft hover:bg-surface-soft/80 transition-colors text-luxury-ink/60 px-2 py-0.5 rounded-full cursor-pointer">
                          {POST_TYPES.find(t => t.id === selectedPostType)?.label || 'Post Type'}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const form = document.getElementById('create-post-form') as HTMLFormElement;
                          const titleNode = form?.elements.namedItem('title') as HTMLInputElement;
                          const contentNode = form?.elements.namedItem('content') as HTMLTextAreaElement;
                          const title = titleNode?.value || '';
                          const content = contentNode?.value || '';
                          if (title.trim() || content.trim() || imageFiles.length > 0) {
                            if (window.confirm('Discard your post?')) {
                              setIsModalOpen(false);
                              setImageFiles([]);
                              setPendingFiles([]);
                            }
                          } else {
                            setIsModalOpen(false);
                            setImageFiles([]);
                            setPendingFiles([]);
                          }
                        }}
                        className="px-4 py-2 text-[14px] font-semibold text-luxury-ink/50 hover:text-luxury-ink transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="bg-luxury-ink hover:bg-black text-surface-base px-6 py-2 rounded-full text-[14px] font-semibold shadow-sm transition-all disabled:opacity-50"
                      >
                        {isSubmitting ? 'Posting...' : 'Post'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
    )}

      {/* ─── Image Cropper ──────────────────────────────── */}
      {cropImageSrc && (
        <ImageCropper
          imageSrc={cropImageSrc}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
          aspect={1}
        />
      )}
      {/* ─── Share Modal ──────────────────────────────── */}
      <ShareModal
        isOpen={shareModalData.isOpen}
        onClose={() => setShareModalData(prev => ({...prev, isOpen: false}))}
        postUrl={shareModalData.url}
        postTitle={shareModalData.title}
        sharedPost={shareModalData.sharedPost}
      />

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
    <div className="py-8 my-2 border-y border-luxury-ink/5 bg-linear-to-r from-surface-soft/40 via-transparent to-surface-soft/40 px-4 sm:px-0 relative overflow-hidden">
      {/* Subtle decorative glow */}
      <div className="absolute top-0 left-1/4 w-1/2 h-px bg-linear-to-r from-transparent via-brand-teal/20 to-transparent"></div>
      
      <div className="flex items-center justify-between mb-6 px-2">
        <div className="flex flex-col">
          <h3 className="text-[15px] font-semibold text-luxury-ink flex items-center gap-2">
            <Users size={16} className="text-brand-teal" />
            Clubs for you
          </h3>
          <p className="text-[13px] text-luxury-ink/40 mt-1">Find your community on Nextbench</p>
        </div>
      </div>
      
      <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4 px-2 snap-x">
        {clubs.map((club) => (
          <Link 
            key={club.id} 
            to={`/club/${club.id}`} 
            className="snap-start shrink-0 w-160px bg-surface-card/70 backdrop-blur-sm rounded-2xl p-4 border border-luxury-ink/5 hover:border-brand-teal/20 transition-all group flex flex-col items-center text-center shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_20px_-4px_rgba(0,0,0,0.08)] hover:-translate-y-1"
          >
            <div className="w-16 h-16 rounded-full bg-surface-soft flex items-center justify-center overflow-hidden mb-3 border-[3px] border-surface-card shadow-sm ring-1 ring-luxury-ink/5">
              {club.avatar ? (
                <img src={getOptimizedImageUrl(club.avatar)} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" referrerPolicy="no-referrer" />
              ) : (
                <Users size={20} className="text-brand-teal/50" />
              )}
            </div>
            <p className="text-[14px] font-semibold text-luxury-ink truncate w-full group-hover:text-brand-teal transition-colors mb-1">{club.name}</p>
            <p className="text-[12px] text-luxury-ink/40 mb-4">{club.memberCount} members</p>
            
            <button
              onClick={(e) => handleJoin(e, club.id)}
              disabled={joiningId === club.id}
              className="mt-auto w-full py-1.5 rounded-full border border-luxury-ink/10 text-[13px] font-semibold text-luxury-ink/70 hover:bg-brand-teal hover:text-white hover:border-brand-teal transition-all disabled:opacity-50 flex items-center justify-center"
            >
              {joiningId === club.id ? 'Joining' : 'Join'}
            </button>
          </Link>
        ))}
      </div>
    </div>
  );
}
