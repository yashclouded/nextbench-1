import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import PollDisplay from './PollDisplay';
import { useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Share2, Bookmark, Flag, Flame, ChevronLeft, ChevronRight, FileText, X, Users as UsersIcon } from 'lucide-react';
// Lazy-load heavy renderers — only needed for posts with PDF or video content
const PdfViewer = lazy(() => import('./PdfViewer'));
const PdfPreview = lazy(() => import('./PdfViewer').then(m => ({ default: m.PdfPreview })));
const VideoPlayer = lazy(() => import('./VideoPlayer'));
import { motion, AnimatePresence } from 'motion/react';
import { getOptimizedImageUrl } from '../../lib/utils';
import { POST_TYPES } from '../../pages/Dashboard/Feed';
import { getPersonaDisplay } from '../../lib/confessions';
import ReportModal from './ReportModal';
import LinkifiedText from './LinkifiedText';
import { useToast } from '../../lib/ToastContext';
import { doc, getDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { createPortal } from 'react-dom';

const LazyFallback = () => (
  <div className="flex items-center justify-center p-4">
    <div className="w-4 h-4 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
  </div>
);

// ─── Liked By Modal ─────────────────────────────────────────
interface LikerUser {
  uid: string;
  name: string;
  profilePicture?: string;
  username?: string;
}

function LikedByModal({ postId, count, onClose }: { postId: string; count: number; onClose: () => void }) {
  const [likers, setLikers] = useState<LikerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const fetchLikers = async () => {
      try {
        const q = query(
          collection(db, 'post_upvotes'),
          where('postId', '==', postId),
          limit(100)
        );
        const snap = await getDocs(q);
        const userIds = snap.docs.map(d => d.data().userId as string).filter(Boolean);
        // Batch fetch user profiles
        const users = await Promise.all(
          userIds.map(async (uid) => {
            try {
              const userSnap = await getDoc(doc(db, 'users', uid));
              if (userSnap.exists()) {
                const data = userSnap.data();
                return { uid, name: data.name || 'User', profilePicture: data.profilePicture, username: data.username };
              }
            } catch {}
            return { uid, name: 'User' };
          })
        );
        if (!cancelled) setLikers(users);
      } catch {}
      if (!cancelled) setLoading(false);
    };
    fetchLikers();
    return () => { cancelled = true; };
  }, [postId]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-luxury-ink/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        onClick={e => e.stopPropagation()}
        className="bg-surface-card w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-luxury-ink/8">
          <div className="flex items-center gap-2">
            <Heart size={18} className="fill-brand-pink text-brand-pink" />
            <span className="font-bold text-luxury-ink text-[15px]">
              {count > 0 ? `${count} Like${count !== 1 ? 's' : ''}` : 'Likes'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-luxury-ink/8 hover:bg-luxury-ink/15 text-luxury-ink/50 hover:text-luxury-ink transition-all"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
            </div>
          ) : likers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <UsersIcon size={28} className="text-luxury-ink/20" />
              <p className="text-[13px] text-luxury-ink/40 font-medium">No likes yet</p>
            </div>
          ) : (
            <ul className="divide-y divide-luxury-ink/5">
              {likers.map(liker => (
                <li key={liker.uid}>
                  <button
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-surface-soft transition-colors text-left"
                    onClick={() => {
                      onClose();
                      navigate(liker.username ? `/u/${liker.username}` : `/profile/${liker.uid}`);
                    }}
                  >
                    <div className="w-9 h-9 rounded-full bg-brand-teal/10 flex items-center justify-center text-brand-teal font-bold text-sm overflow-hidden shrink-0">
                      {liker.profilePicture ? (
                        <img src={getOptimizedImageUrl(liker.profilePicture)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
                      ) : liker.name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-luxury-ink truncate">{liker.name}</p>
                      {liker.username && (
                        <p className="text-[11px] text-luxury-ink/40 font-medium">@{liker.username}</p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}

interface Post {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  authorProfilePicture?: string;
  authorUsername?: string;
  isAnonymous?: boolean;
  personaName?: string;
  reactionsCount?: Record<string, number>;
  school: string;
  type: string;
  status: string;
  imageUrl?: string;
  imageUrls?: string[];
  pdfUrl?: string;
  pdfPages?: number;
  upvotesCount: number;
  downvotesCount?: number;
  repliesCount: number;
  feedScore?: number;
  isHot?: boolean;
  city?: string;
  createdAt: any;
  poll?: {
    choices: string[];
    expiresAt: any;
    votes: Record<string, number>;
  };
}

interface PostCardProps {
  key?: React.Key;
  post: Post;
  hasUpvoted: boolean;
  hasDownvoted?: boolean;
  hasSaved?: boolean;
  onClick: () => void;
  onUpvote?: (post: Post) => void;
  onDownvote?: (post: Post) => void;
  onShare?: (post: Post) => void;
  onSave?: (post: Post) => void;
}

function timeAgo(date: any): string {
  if (!date?.toDate) return '';
  const now = Date.now();
  const then = date.toDate().getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return date.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function PostCard({ post, hasUpvoted, hasDownvoted, hasSaved, onClick, onUpvote, onDownvote, onShare, onSave }: PostCardProps) {
  const { showToast } = useToast();

  // The feed's batch user resolver pre-populates authorProfilePicture for all posts,
  // so this fallback getDoc almost never fires in normal usage. It only activates
  // for posts that arrive via direct URL or without an author cache hit.
  const [liveProfilePicture, setLiveProfilePicture] = useState<string | undefined>(
    post.authorProfilePicture
  );
  useEffect(() => {
    if (!post.authorId || post.isAnonymous || post.authorProfilePicture) return;
    const fetchProfilePic = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', post.authorId));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data?.profilePicture) setLiveProfilePicture(data.profilePicture);
        }
      } catch {}
    };
    fetchProfilePic();
  }, [post.authorId, post.authorProfilePicture, post.isAnonymous]);


  const postImageUrls = post.imageUrls && post.imageUrls.length > 0
    ? post.imageUrls
    : (post.imageUrl ? [post.imageUrl] : []);
  const hasImage = postImageUrls.length > 0;
  const [showReport, setShowReport] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const navigate = useNavigate();

  // Instagram-style feedback: pop the heart icon only on the false -> true transition
  const [likeBurst, setLikeBurst] = useState(0);
  const prevUpvoted = useRef(hasUpvoted);
  useEffect(() => {
    if (hasUpvoted && !prevUpvoted.current) setLikeBurst((n) => n + 1);
    prevUpvoted.current = hasUpvoted;
  }, [hasUpvoted]);

  // Big center heart on double-tap, like Instagram
  const [showBigHeart, setShowBigHeart] = useState(false);
  const bigHeartTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onUpvote?.(post);
    setShowBigHeart(false);
    clearTimeout(bigHeartTimeout.current);
    // brief tick lets the exit/enter cycle restart cleanly on rapid double-taps
    requestAnimationFrame(() => setShowBigHeart(true));
    bigHeartTimeout.current = setTimeout(() => setShowBigHeart(false), 800);
  };

  // Small bounce on save/bookmark toggle
  const [saveBurst, setSaveBurst] = useState(0);
  const prevSaved = useRef(hasSaved);
  useEffect(() => {
    if (hasSaved && !prevSaved.current) setSaveBurst((n) => n + 1);
    prevSaved.current = hasSaved;
  }, [hasSaved]);

  const displayInfo = getPersonaDisplay(post, false);
  const profileLink = displayInfo.isAnonymous ? '#' : (post.authorUsername ? `/u/${post.authorUsername}` : `/profile/${post.authorId}`);

  const typeLabel = POST_TYPES.find(t => t.id === post.type)?.label || post.type;

  // Liked-by modal
  const [showLikedBy, setShowLikedBy] = useState(false);

  const handleProfileClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!displayInfo.isAnonymous) {
      navigate(profileLink);
    } else {
      showToast(`Anonymous ID: Anon-${post.authorId.substring(0, 5).toUpperCase()}`, 'info');
    }
  };

  const prevImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev - 1 + postImageUrls.length) % postImageUrls.length);
  };

  const nextImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev + 1) % postImageUrls.length);
  };

  return (
    <>
      <motion.article
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className={`post-card-clean relative p-5 sm:p-6 md:p-8 flex flex-col w-full min-w-0 overflow-x-hidden ${post.type === 'confession' ? 'is-confession' : ''}`}
        onDoubleClick={handleDoubleClick}
      >
        {/* Big center heart burst, Instagram-style double-tap feedback */}
        <AnimatePresence>
          {showBigHeart && (
            <motion.div
              className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
            >
              <motion.div
                initial={{ scale: 0, rotate: -8 }}
                animate={{ scale: [0, 1.15, 1], rotate: 0 }}
                exit={{ scale: 0.85, opacity: 0 }}
                transition={{ duration: 0.45, times: [0, 0.6, 1], ease: 'easeOut' }}
              >
                <Heart size={96} className="fill-white text-white drop-shadow-2xl" />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Metadata Row */}
        <div className="mb-3" onClick={handleProfileClick}>
          <div className="flex items-center gap-2 min-w-0">
            {/* Avatar */}
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold overflow-hidden shrink-0 ring-1 ring-inset ring-luxury-ink/[0.06] ${displayInfo.isAnonymous ? 'bg-purple-500/10 text-purple-600' : 'bg-brand-teal/10 text-brand-teal'}`}>
              {!displayInfo.isAnonymous && liveProfilePicture ? (
                <img src={getOptimizedImageUrl(liveProfilePicture)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />

              ) : displayInfo.name[0]?.toUpperCase()}
            </div>
            
            <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
              <span className="text-[13px] sm:text-[14px] font-semibold text-luxury-ink hover:underline cursor-pointer truncate max-w-[7.5rem] sm:max-w-[11rem]">{displayInfo.name}</span>
              <span className="text-[13px] text-luxury-ink/40">·</span>
              <span className="text-[13px] sm:text-[14px] text-luxury-ink/50 font-medium shrink-0">{timeAgo(post.createdAt)}</span>
              <span className="text-[13px] text-luxury-ink/40 hidden sm:inline">·</span>
              <span className="text-[13px] sm:text-[14px] text-luxury-ink/50 font-medium truncate max-w-[6rem] sm:max-w-[11rem] hidden sm:inline">{displayInfo.school}</span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {post.isHot && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 text-amber-500 rounded text-[10px] font-bold uppercase tracking-wide">
                  <Flame size={10} strokeWidth={2} /> Hot
                </span>
              )}
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${post.type === 'confession' ? 'bg-purple-500/10 text-purple-600' : 'bg-brand-teal/10 text-brand-teal'}`}>
                {typeLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Title */}
        {post.title && (
          <h3 className="text-[17px] md:text-[19px] font-semibold text-luxury-ink/90 leading-snug tracking-normal mb-2 wrap-break-word">
            {post.title}
          </h3>
        )}

        {/* Content Preview */}
        <div className="mb-5">
          <LinkifiedText
            text={post.content}
            className="text-[15px] md:text-[16px] text-luxury-ink/60 leading-relaxed font-normal line-clamp-5 wrap-break-word overflow-wrap-anywhere block"
          />
        </div>

        {/* Poll */}
        {(post as any).poll && (post as any).poll.choices?.length > 0 && (
          <PollDisplay postId={post.id} poll={(post as any).poll} compact />
        )}

        {/* Image */}
        {hasImage && (
          <div className="relative mt-2 mb-6 w-full rounded-[20px] overflow-hidden group bg-black/5">
            {/* Single visible image — no scroll container */}
            <img
              src={getOptimizedImageUrl(postImageUrls[currentImageIndex])}
              alt={post.title || "Post image"}
              className="w-full h-auto pointer-events-none"
              referrerPolicy="no-referrer"
              draggable={false}
              loading="lazy"
            />


            {postImageUrls.length > 1 && (
              <>
                {/* Counter badge */}
                <div className="absolute top-3 right-3 bg-luxury-ink/60 backdrop-blur-md text-white px-2.5 py-1 rounded-md text-[11px] font-bold tracking-widest z-10 pointer-events-none">
                  {currentImageIndex + 1}/{postImageUrls.length}
                </div>

                {/* Navigation arrows */}
                <button
                  onClick={prevImage}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-black/40 hover:bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 backdrop-blur-sm"
                >
                  <ChevronLeft size={18} strokeWidth={2} />
                </button>
                <button
                  onClick={nextImage}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-black/40 hover:bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 backdrop-blur-sm"
                >
                  <ChevronRight size={18} strokeWidth={2} />
                </button>

                {/* Bottom dots indicator */}
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10 pointer-events-none">
                  {postImageUrls.map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-1.5 rounded-full transition-all ${idx === currentImageIndex ? 'w-4 bg-white shadow-sm' : 'w-1.5 bg-white/60'}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* PDF Preview + Full Viewer */}
        {post.pdfUrl && (
          <Suspense fallback={<LazyFallback />}>
            <PdfPreview pdfUrl={post.pdfUrl} totalPages={post.pdfPages || 1} title={post.title} />
          </Suspense>
        )}


        {/* Video */}
        {(post as any).videoUrl && (
          <div className="relative mt-2 mb-6 w-full">
            <Suspense fallback={<LazyFallback />}>
              <VideoPlayer src={(post as any).videoUrl} poster={post.imageUrls?.[0] || post.imageUrl} />
            </Suspense>
          </div>
        )}


        {/* Action Bar — unified icon pills, consistent 1.75 stroke */}
        <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-0.5 sm:gap-1.5 -ml-1.5 text-[14px] font-semibold">
            {/* Like */}
            <button
              onClick={(e) => { e.stopPropagation(); onUpvote?.(post); }}
              aria-label="Like"
              className={`flex items-center gap-0.5 rounded-full transition-colors group ${hasUpvoted ? 'text-brand-pink' : 'text-luxury-ink/45 hover:text-brand-pink'}`}
            >
              <motion.span
                className="grid place-items-center w-10 h-10 rounded-full group-hover:bg-brand-pink/10 transition-colors"
                whileTap={{ scale: 0.85 }}
              >
                <motion.span
                  key={likeBurst}
                  initial={likeBurst > 0 ? { scale: 0.5 } : false}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 600, damping: 14 }}
                  className="grid place-items-center"
                >
                  <Heart size={22} strokeWidth={1.75} className={hasUpvoted ? 'fill-brand-pink' : ''} />
                </motion.span>
              </motion.span>
              <AnimatePresence mode="popLayout">
                <motion.button
                  key={post.upvotesCount || 0}
                  initial={{ y: -6, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 6, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="tabular-nums pr-1.5 hover:underline cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); if ((post.upvotesCount || 0) > 0) setShowLikedBy(true); }}
                  aria-label="See who liked this post"
                  type="button"
                >
                  {post.upvotesCount || 0}
                </motion.button>
              </AnimatePresence>
            </button>

            {/* Dislike */}
            <button
              onClick={(e) => { e.stopPropagation(); onDownvote?.(post); }}
              aria-label="Dislike"
              className={`flex items-center gap-0.5 rounded-full transition-colors group ${hasDownvoted ? 'text-indigo-500' : 'text-luxury-ink/45 hover:text-indigo-500'}`}
            >
              <motion.span className="grid place-items-center w-10 h-10 rounded-full group-hover:bg-indigo-500/10 transition-colors" whileTap={{ scale: 0.85 }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={hasDownvoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path>
                </svg>
              </motion.span>
              {(post.downvotesCount || 0) > 0 && <span className="tabular-nums pr-1.5">{post.downvotesCount || 0}</span>}
            </button>

            {/* Comment */}
            <button
              onClick={(e) => { e.stopPropagation(); onClick(); }}
              aria-label="Comments"
              className="flex items-center gap-0.5 rounded-full text-luxury-ink/45 hover:text-brand-teal transition-colors group"
            >
              <motion.span className="grid place-items-center w-10 h-10 rounded-full group-hover:bg-brand-teal/10 transition-colors" whileTap={{ scale: 0.85 }}>
                <MessageCircle size={22} strokeWidth={1.75} />
              </motion.span>
              <span className="tabular-nums pr-1.5">{post.repliesCount || 0}</span>
            </button>

            {/* Share */}
            <button
              onClick={(e) => { e.stopPropagation(); onShare?.(post); }}
              aria-label="Share"
              className="flex items-center rounded-full text-luxury-ink/45 hover:text-brand-teal transition-colors group"
            >
              <motion.span className="grid place-items-center w-10 h-10 rounded-full group-hover:bg-brand-teal/10 transition-colors" whileTap={{ scale: 0.85 }}>
                <Share2 size={22} strokeWidth={1.75} />
              </motion.span>
            </button>
          </div>

          <div className="flex items-center -mr-1.5">
            {/* Save */}
            <button
              onClick={(e) => { e.stopPropagation(); onSave?.(post); }}
              aria-label="Save"
              className={`grid place-items-center rounded-full transition-colors group ${hasSaved ? 'text-brand-teal' : 'text-luxury-ink/45 hover:text-brand-teal'}`}
            >
              <motion.span className="grid place-items-center w-10 h-10 rounded-full group-hover:bg-brand-teal/10 transition-colors" whileTap={{ scale: 0.85 }}>
                <motion.span
                  key={saveBurst}
                  initial={saveBurst > 0 ? { scale: 0.5 } : false}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 600, damping: 14 }}
                  className="grid place-items-center"
                >
                  <Bookmark size={21} strokeWidth={1.75} className={hasSaved ? 'fill-brand-teal' : ''} />
                </motion.span>
              </motion.span>
            </button>
            {/* Report */}
            <button
              onClick={(e) => { e.stopPropagation(); setShowReport(true); }}
              aria-label="Report"
              className="grid place-items-center w-10 h-10 rounded-full text-luxury-ink/25 hover:text-red-400 hover:bg-red-400/10 transition-colors group"
            >
              <Flag size={18} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </motion.article>

      {/* Report Modal */}
      <ReportModal
        isOpen={showReport}
        onClose={() => setShowReport(false)}
        contentType="post"
        contentId={post.id}
      />

      {/* Liked By Modal */}
      <AnimatePresence>
        {showLikedBy && (
          <LikedByModal
            postId={post.id}
            count={post.upvotesCount || 0}
            onClose={() => setShowLikedBy(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}