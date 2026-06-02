import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Share2, Bookmark, Flag, Flame } from 'lucide-react';
import { motion } from 'motion/react';
import { getOptimizedImageUrl } from '../../lib/utils';
import { POST_TYPES } from '../../pages/Dashboard/Feed';
import { getPersonaDisplay } from '../../lib/confessions';
import ReportModal from './ReportModal';
import { useToast } from '../../lib/ToastContext';

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
  imageUrl?: string;
  imageUrls?: string[];
  upvotesCount: number;
  repliesCount: number;
  feedScore?: number;
  city?: string;
  createdAt: any;
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
  const postImageUrls = post.imageUrls && post.imageUrls.length > 0
    ? post.imageUrls
    : (post.imageUrl ? [post.imageUrl] : []);
  const hasImage = postImageUrls.length > 0;
  const [showReport, setShowReport] = useState(false);
  const navigate = useNavigate();

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

  return (
    <>
      <motion.article
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className={`post-card-clean cursor-pointer p-4 sm:p-6 md:p-8 flex flex-col w-full min-w-0 overflow-x-hidden ${post.type === 'confession' ? 'is-confession' : ''}`}
        onClick={onClick}
      >
        {/* Title */}
        {post.title && (
          <h3 className="text-[17px] md:text-[19px] font-semibold text-luxury-ink/90 leading-snug tracking-normal mb-2 break-words">
            {post.title}
          </h3>
        )}

        {/* Metadata Row */}
        <div className="mb-4" onClick={handleProfileClick}>
          <div className="flex items-center gap-2 min-w-0">
            {/* Avatar */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold overflow-hidden shrink-0 ${displayInfo.isAnonymous ? 'bg-purple-500/10 text-purple-600' : 'bg-brand-teal/10 text-brand-teal'}`}>
              {!displayInfo.isAnonymous && post.authorProfilePicture ? (
                <img src={getOptimizedImageUrl(post.authorProfilePicture)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : displayInfo.name[0]?.toUpperCase()}
            </div>
            
            <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
              <span className="text-[13px] sm:text-[14px] font-semibold text-luxury-ink hover:underline cursor-pointer truncate max-w-[120px] sm:max-w-[180px]">{displayInfo.name}</span>
              <span className="text-[13px] text-luxury-ink/40">·</span>
              <span className="text-[13px] sm:text-[14px] text-luxury-ink/50 font-medium shrink-0">{timeAgo(post.createdAt)}</span>
              <span className="text-[13px] text-luxury-ink/40 hidden sm:inline">·</span>
              <span className="text-[13px] sm:text-[14px] text-luxury-ink/50 font-medium truncate max-w-[100px] sm:max-w-[180px] hidden sm:inline">{displayInfo.school}</span>
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

        {/* Content Preview */}
        <div className="mb-5">
          <p className="text-[15px] md:text-[16px] text-luxury-ink/60 leading-relaxed font-normal line-clamp-4 break-words overflow-wrap-anywhere">
            {post.content}
          </p>
        </div>

        {/* Image */}
        {hasImage && (
          <div className="relative mt-2 mb-6 w-full rounded-[20px] overflow-hidden">
            <img
              src={getOptimizedImageUrl(postImageUrls[0])}
              alt={post.title}
              className="w-full h-auto"
              referrerPolicy="no-referrer"
            />
            {postImageUrls.length > 1 && (
              <div className="absolute top-3 right-3 bg-luxury-ink/60 backdrop-blur-md text-white px-2.5 py-1 rounded-md text-[11px] font-bold tracking-widest">
                1/{postImageUrls.length}
              </div>
            )}
          </div>
        )}

        {/* Action Bar */}
        <div className="flex flex-wrap items-center justify-between pt-4 border-t gap-y-4" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex flex-wrap items-center gap-3 sm:gap-6">
            <button 
              onClick={(e) => { e.stopPropagation(); onUpvote?.(post); }}
              className={`flex items-center gap-1.5 text-[13px] transition-colors group ${hasUpvoted ? 'text-brand-pink font-bold' : 'text-luxury-ink/40 hover:text-brand-pink font-semibold'}`}
            >
              <div className="p-2 rounded-full group-hover:bg-brand-pink/10 transition-colors">
                <Heart size={16} className={hasUpvoted ? 'fill-brand-pink' : ''} />
              </div>
              {(post.upvotesCount > 0 || true) && <span className="relative -left-1">{post.upvotesCount || 0}</span>}
            </button>
            
            <button 
              onClick={(e) => { e.stopPropagation(); onDownvote?.(post); }}
              className={`flex items-center gap-1.5 text-[13px] transition-colors group ${hasDownvoted ? 'text-indigo-500 font-bold' : 'text-luxury-ink/40 hover:text-indigo-500 font-semibold'}`}
            >
              <div className="p-2 rounded-full group-hover:bg-indigo-500/10 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill={hasDownvoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path>
                </svg>
              </div>
              {(post.downvotesCount || 0) > 0 && <span className="relative -left-1">{post.downvotesCount || 0}</span>}
            </button>

            <button 
              onClick={(e) => { e.stopPropagation(); onClick(); }}
              className="flex items-center gap-2 text-[14px] text-luxury-ink/40 hover:text-brand-teal transition-colors group font-semibold"
            >
              <MessageCircle size={18} className="transition-transform group-hover:scale-110" />
              {(post.repliesCount > 0 || true) && <span>{post.repliesCount || 0}</span>}
            </button>

            <button 
              onClick={(e) => { e.stopPropagation(); onShare?.(post); }}
              className="flex items-center text-[14px] text-luxury-ink/40 hover:text-brand-teal transition-colors group"
            >
              <Share2 size={18} className="transition-transform group-hover:scale-110" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={(e) => { e.stopPropagation(); onSave?.(post); }}
              className={`transition-colors hover:scale-110 ${hasSaved ? 'text-brand-teal' : 'text-luxury-ink/40 hover:text-brand-teal'}`}
            >
              <Bookmark size={18} className={hasSaved ? 'fill-brand-teal' : ''} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setShowReport(true); }}
              className="text-luxury-ink/20 hover:text-red-400 hover:scale-110 transition-all"
            >
              <Flag size={16} />
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
