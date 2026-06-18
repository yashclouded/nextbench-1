import React, { useState, useEffect, useRef } from 'react';
import PollDisplay from './PollDisplay';
import { useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Share2, Bookmark, Flag, Flame, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import PdfViewer, { PdfPreview } from './PdfViewer';
import { motion, AnimatePresence } from 'motion/react';
import { getOptimizedImageUrl } from '../../lib/utils';
import { POST_TYPES } from '../../pages/Dashboard/Feed';
import { getPersonaDisplay } from '../../lib/confessions';
import ReportModal from './ReportModal';
import LinkifiedText from './LinkifiedText';
import { useToast } from '../../lib/ToastContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

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

  // Fetch live profile picture from Firestore — covers cases where pic was set after posting
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
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className={`post-card-clean relative p-4 sm:p-6 md:p-8 flex flex-col w-full min-w-0 overflow-x-hidden ${post.type === 'confession' ? 'is-confession' : ''}`}
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
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold overflow-hidden shrink-0 ${displayInfo.isAnonymous ? 'bg-purple-500/10 text-purple-600' : 'bg-brand-teal/10 text-brand-teal'}`}>
              {!displayInfo.isAnonymous && liveProfilePicture ? (
                <img src={getOptimizedImageUrl(liveProfilePicture)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : displayInfo.name[0]?.toUpperCase()}
            </div>
            
            <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
              <span className="text-[13px] sm:text-[14px] font-semibold text-luxury-ink hover:underline cursor-pointer truncate max-w-30 sm:max-w-180px">{displayInfo.name}</span>
              <span className="text-[13px] text-luxury-ink/40">·</span>
              <span className="text-[13px] sm:text-[14px] text-luxury-ink/50 font-medium shrink-0">{timeAgo(post.createdAt)}</span>
              <span className="text-[13px] text-luxury-ink/40 hidden sm:inline">·</span>
              <span className="text-[13px] sm:text-[14px] text-luxury-ink/50 font-medium truncate max-w-100px sm:max-w-180px hidden sm:inline">{displayInfo.school}</span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {post.feedScore && post.feedScore > 10 && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 text-amber-500 rounded text-[10px] font-bold uppercase tracking-wide">
                  <Flame size={10} /> Hot
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
            className="text-[15px] md:text-[16px] text-luxury-ink/60 leading-relaxed font-normal line-clamp-4 wrap-break-word overflow-wrap-anywhere block" 
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
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-black/40 hover:bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={nextImage}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-black/40 hover:bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                >
                  <ChevronRight size={18} />
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
          <PdfPreview pdfUrl={post.pdfUrl} totalPages={post.pdfPages || 1} title={post.title} />
        )}

        {/* Video */}
        {(post as any).videoUrl && (
          <div className="relative mt-2 mb-6 w-full rounded-[20px] overflow-hidden bg-black/5">
            <video
              src={(post as any).videoUrl}
              controls
              playsInline
              preload="metadata"
              className="w-full h-auto max-h-[60vh] object-contain rounded-[20px]"
            />
          </div>
        )}

        {/* Action Bar */}
        <div className="flex flex-wrap items-center justify-between pt-4 border-t gap-y-4" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex flex-wrap items-center gap-3 sm:gap-6">
            <button 
              onClick={(e) => { e.stopPropagation(); onUpvote?.(post); }}
              className={`flex items-center gap-1.5 text-[15px] transition-colors group ${hasUpvoted ? 'text-brand-pink font-bold' : 'text-luxury-ink/40 hover:text-brand-pink font-semibold'}`}
            >
              <motion.div
                className="p-2 rounded-full group-hover:bg-brand-pink/10 transition-colors"
                whileTap={{ scale: 0.8 }}
              >
                <motion.div
                  key={likeBurst}
                  initial={likeBurst > 0 ? { scale: 0.5 } : false}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 600, damping: 14 }}
                >
                  <Heart size={24} className={hasUpvoted ? 'fill-brand-pink' : ''} />
                </motion.div>
              </motion.div>
              {(post.upvotesCount > 0 || true) && (
                <AnimatePresence mode="popLayout">
                  <motion.span
                    key={post.upvotesCount || 0}
                    initial={{ y: -6, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 6, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="relative -left-1"
                  >
                    {post.upvotesCount || 0}
                  </motion.span>
                </AnimatePresence>
              )}
            </button>
            
            <button 
              onClick={(e) => { e.stopPropagation(); onDownvote?.(post); }}
              className={`flex items-center gap-1.5 text-[15px] transition-colors group ${hasDownvoted ? 'text-indigo-500 font-bold' : 'text-luxury-ink/40 hover:text-indigo-500 font-semibold'}`}
            >
              <motion.div className="p-2 rounded-full group-hover:bg-indigo-500/10 transition-colors" whileTap={{ scale: 0.8 }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={hasDownvoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path>
                </svg>
              </motion.div>
              {(post.downvotesCount || 0) > 0 && <span className="relative -left-1">{post.downvotesCount || 0}</span>}
            </button>

            <button 
              onClick={(e) => { e.stopPropagation(); onClick(); }}
              className="flex items-center gap-2 text-[15px] text-luxury-ink/40 hover:text-brand-teal transition-colors group font-semibold"
            >
              <motion.div whileTap={{ scale: 0.8 }}>
                <MessageCircle size={24} className="transition-transform group-hover:scale-110" />
              </motion.div>
              {(post.repliesCount > 0 || true) && <span>{post.repliesCount || 0}</span>}
            </button>

            <button 
              onClick={(e) => { e.stopPropagation(); onShare?.(post); }}
              className="flex items-center text-[15px] text-luxury-ink/40 hover:text-brand-teal transition-colors group"
            >
              <motion.div whileTap={{ scale: 0.8 }}>
                <Share2 size={24} className="transition-transform group-hover:scale-110" />
              </motion.div>
            </button>
          </div>

          <div className="flex items-center gap-4">
            <motion.button 
              onClick={(e) => { e.stopPropagation(); onSave?.(post); }}
              whileTap={{ scale: 0.8 }}
              className={`transition-colors hover:scale-110 ${hasSaved ? 'text-brand-teal' : 'text-luxury-ink/40 hover:text-brand-teal'}`}
            >
              <motion.div
                key={saveBurst}
                initial={saveBurst > 0 ? { scale: 0.5 } : false}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 600, damping: 14 }}
              >
                <Bookmark size={22} className={hasSaved ? 'fill-brand-teal' : ''} />
              </motion.div>
            </motion.button>
            <button
              onClick={(e) => { e.stopPropagation(); setShowReport(true); }}
              className="text-luxury-ink/20 hover:text-red-400 hover:scale-110 transition-all"
            >
              <Flag size={18} />
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
    </>
  );
}