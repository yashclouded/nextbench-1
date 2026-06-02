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

  const totalReactions = post.type === 'confession' && post.reactionsCount
    ? Object.values(post.reactionsCount).reduce((a, b) => a + b, 0)
    : post.upvotesCount;

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
        className="post-card-clean cursor-pointer"
        onClick={onClick}
      >
        {/* Author Row */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <div onClick={handleProfileClick} className="shrink-0 cursor-pointer">
            <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold overflow-hidden ${displayInfo.isAnonymous ? 'bg-purple-500/10 text-purple-500' : 'bg-surface-soft'}`}>
              {!displayInfo.isAnonymous && post.authorProfilePicture ? (
                <img src={getOptimizedImageUrl(post.authorProfilePicture)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : displayInfo.name[0]?.toUpperCase()}
            </div>
          </div>
          <div className="flex-1 min-w-0" onClick={handleProfileClick}>
            <div className="flex items-center gap-2 cursor-pointer">
              <span className="text-[14px] font-semibold text-luxury-ink hover:underline truncate">{displayInfo.name}</span>
              <span className="text-luxury-ink/30 text-xs">·</span>
              <span className="text-xs text-luxury-ink/40">{timeAgo(post.createdAt)}</span>
            </div>
            <p className="text-[11px] text-luxury-ink/40 truncate">{displayInfo.school}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {post.feedScore && post.feedScore > 10 && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 text-amber-500 rounded-full text-[10px] font-semibold">
                <Flame size={10} /> Hot
              </span>
            )}
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${post.type === 'confession' ? 'bg-purple-500/10 text-purple-500' : 'bg-brand-teal/8 text-brand-teal'}`}>
              {typeLabel}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 pb-3">
          <h3 className="text-[16px] font-semibold text-luxury-ink leading-snug">{post.title}</h3>
          <p className="text-[14px] text-luxury-ink/60 leading-relaxed mt-1.5 line-clamp-3">{post.content}</p>
        </div>

        {/* Image */}
        {hasImage && (
          <div className="relative mt-1 mx-4 rounded-xl overflow-hidden bg-surface-soft">
            <img
              src={getOptimizedImageUrl(postImageUrls[0])}
              alt={post.title}
              className="w-full max-h-[400px] object-cover"
              referrerPolicy="no-referrer"
            />
            {postImageUrls.length > 1 && (
              <div className="absolute top-3 right-3 bg-luxury-ink/50 backdrop-blur-sm text-white px-2 py-0.5 rounded-lg text-[10px] font-semibold">
                1/{postImageUrls.length}
              </div>
            )}
          </div>
        )}

        {/* Action Bar */}
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5 bg-surface-soft/50 rounded-full px-2 py-0.5">
              <button 
                onClick={(e) => { e.stopPropagation(); onUpvote?.(post); }}
                className={`flex items-center gap-1.5 text-[13px] transition-colors ${hasUpvoted && post.type !== 'confession' ? 'text-brand-pink font-semibold' : 'text-luxury-ink/40 hover:text-brand-pink'}`}
              >
                <Heart size={16} className={hasUpvoted && post.type !== 'confession' ? 'fill-brand-pink' : ''} />
                {totalReactions || 0}
              </button>
              <div className="w-[1px] h-3 bg-luxury-ink/10 mx-0.5"></div>
              <button 
                onClick={(e) => { e.stopPropagation(); onDownvote?.(post); }}
                className={`flex items-center gap-1.5 text-[13px] transition-colors ${hasDownvoted && post.type !== 'confession' ? 'text-indigo-500 font-semibold' : 'text-luxury-ink/40 hover:text-indigo-500'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill={hasDownvoted && post.type !== 'confession' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={hasDownvoted && post.type !== 'confession' ? 'text-indigo-500' : ''}>
                  <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path>
                </svg>
                {post.downvotesCount || 0}
              </button>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); onClick(); }}
              className="flex items-center gap-1.5 text-[13px] text-luxury-ink/40 hover:text-brand-teal transition-colors"
            >
              <MessageCircle size={18} />
              {post.repliesCount || 0}
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onShare?.(post); }}
              className="flex items-center text-luxury-ink/40 hover:text-luxury-ink/60 transition-colors"
            >
              <Share2 size={16} />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onSave?.(post); }}
              className={`flex items-center transition-colors ${hasSaved ? 'text-brand-teal' : 'text-luxury-ink/40 hover:text-brand-teal'}`}
            >
              <Bookmark size={16} className={hasSaved ? 'fill-brand-teal' : ''} />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => { e.stopPropagation(); setShowReport(true); }}
              className="text-luxury-ink/20 hover:text-red-400 transition-colors"
              title="Report"
            >
              <Flag size={14} />
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
