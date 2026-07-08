import React, { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, MapPin, School, Flame, ChevronLeft, ChevronRight, Heart, MessageSquare, Share2, Image as ImageIcon, Trash2, Pencil, Users as UsersIcon } from 'lucide-react';
import { collection, addDoc, serverTimestamp, doc, updateDoc, query, where, getDocs, getDoc, limit } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { getOptimizedImageUrl } from '../../lib/utils';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { uploadReplyImage } from '../../lib/storage';
import { checkImageSafety } from '../../lib/imageModeration';
import { createNotification } from '../../lib/notifications';
import { notifyMentionedUsers } from '../../lib/mentions';
import { getPersonaDisplay } from '../../lib/confessions';
import { getUserReaction, togglePostReaction, ReactionType } from '../../lib/reactions';
import { useAllBlockedUserIds } from '../../lib/blocks';
import { getPostReplies } from '../../lib/discovery';
import PollDisplay from '../ui/PollDisplay';
import MentionInput from '../ui/MentionInput';
import type { Post } from '../../pages/Dashboard/Feed';

// Lazy-load the heavy video player — only parsed when a post actually has video.
const VideoPlayer = lazy(() => import('../ui/VideoPlayer'));

// Minimal spinner used as Suspense fallback for lazy components.
const LazyFallback = () => (
  <div className="flex items-center justify-center p-4">
    <div className="w-5 h-5 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
  </div>
);

const POST_TYPES = [
  { id: 'info', label: 'School Info' },
  { id: 'notes', label: 'Notes' },
  { id: 'event', label: 'Interschool Event' },
  { id: 'confession', label: 'Anonymous Post' },
  { id: 'others', label: 'Others' },
];

function Comment({ reply, repliesMap, onReply, onDeleteReply, onEditReply, onUpvoteReply, replyUpvotedIds, isAdmin, user, level = 0 }: any) {
  const children = repliesMap[reply.id] || [];
  const hasUpvoted = replyUpvotedIds.has(reply.id);
  const canEdit = reply.authorId === user?.uid;

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(reply.content || '');

  const handleSaveEdit = () => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === reply.content?.trim()) {
      setIsEditing(false);
      return;
    }
    onEditReply(reply.id, trimmed);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditText(reply.content || '');
    setIsEditing(false);
  };

  // Avatar URL — populated by the parent onSnapshot handler which batch-resolves
  // all missing avatars in a single query before calling setReplies().
  // The individual getDoc fallback has been removed to eliminate N+1 Firestore reads.
  const [avatarUrl] = useState<string | undefined>(reply.authorProfilePicture);


  return (
    <div className={`mt-4 ${level > 0 ? 'ml-4 md:ml-6 border-l-2 border-brand-teal/20 pl-4 md:pl-6' : ''}`}>
      <div className="bg-surface-soft/30 p-4 rounded-2xl border border-luxury-ink/5">
        <div className="flex items-center gap-3 mb-2">
          <Link to={`/profile/${reply.authorId}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-6 h-6 rounded-full bg-brand-teal/10 flex items-center justify-center text-brand-teal font-bold text-[10px] shrink-0 overflow-hidden">
              {avatarUrl ? (
                <img src={getOptimizedImageUrl(avatarUrl)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />

              ) : reply.authorName[0]?.toUpperCase()}
            </div>
            <div>
              <p className="text-[11px] font-bold text-luxury-ink">{reply.authorName}</p>
              <p className="text-[8px] font-bold uppercase tracking-widest text-luxury-ink/30">{reply.authorSchool}</p>
            </div>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => onUpvoteReply(reply)}
              className={`flex items-center gap-1 p-1.5 rounded-full text-[10px] font-bold transition-all ${hasUpvoted ? 'text-brand-pink bg-brand-pink/10' : 'text-luxury-ink/40 hover:bg-surface-soft hover:text-brand-pink'}`}
            >
              <Heart size={18} className={hasUpvoted ? 'fill-brand-pink' : ''} />
              {reply.upvotesCount || 0}
            </button>
            <button
              onClick={() => onReply(reply.id, reply.authorName)}
              className="flex items-center gap-1 p-1.5 hover:bg-surface-soft rounded-full text-[10px] font-bold text-luxury-ink/40 hover:text-brand-teal transition-all"
            >
              <MessageSquare size={18} />
              Reply
            </button>
            {canEdit && !isEditing && onEditReply && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 p-1.5 hover:bg-surface-soft rounded-full text-[10px] font-bold text-luxury-ink/40 hover:text-brand-teal transition-all"
              >
                <Pencil size={16} />
                Edit
              </button>
            )}
            {(isAdmin || reply.authorId === user?.uid) && onDeleteReply && (
              <button
                onClick={() => onDeleteReply(reply.id)}
                className="p-1.5 hover:bg-red-500/10 hover:text-red-500 rounded-full text-luxury-ink/20 transition-all"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        {isEditing ? (
          <div className="mt-1">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              autoFocus
              rows={2}
              className="w-full bg-surface-base border border-luxury-ink/10 rounded-xl p-2.5 text-sm text-luxury-ink/80 focus:outline-none focus:border-brand-teal resize-none"
            />
            <div className="flex gap-3 mt-2">
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={!editText.trim()}
                className="text-[11px] font-bold text-brand-teal hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="text-[11px] font-bold text-luxury-ink/40 hover:text-luxury-ink/70 hover:underline"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {reply.content?.trim() && (
              <p className="text-sm text-luxury-ink/80 leading-relaxed">
                {reply.content}
                {reply.edited && <span className="text-[10px] text-luxury-ink/30 font-normal ml-1.5">(edited)</span>}
              </p>
            )}
            {reply.imageUrl && (
              <img
                src={getOptimizedImageUrl(reply.imageUrl)}
                alt=""
                className="mt-3 max-h-60 rounded-xl object-cover"
                referrerPolicy="no-referrer"
              />
            )}
          </>
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
              onEditReply={onEditReply}
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
  const nav = useNavigate();

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

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-luxury-ink/40 backdrop-blur-sm"
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
                      nav(liker.username ? `/u/${liker.username}` : `/profile/${liker.uid}`);
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
    </motion.div>
  );
}

// ─── Post Detail Modal (Instagram-style) ──────────────────
// Owns all reply state (the live replies subscription + the compose box) so that
// loading replies or typing a reply re-renders only this modal — never the feed
// behind it. Post-level actions (vote/save/share/delete) stay in Feed and arrive
// as props so the feed list and this modal remain in sync.

interface PostDetailModalProps {
  post: Post;
  onClose: () => void;
  onUpvote: (post: Post) => void;
  hasUpvoted: boolean;
  onDownvote: (post: Post) => void;
  hasDownvoted: boolean;
  onShare: (post: Post) => void;
  onDelete?: (postId: string) => void;
  onDeleteReply?: (replyId: string) => void | Promise<void>;
  onEditReply: (replyId: string, newContent: string) => void | Promise<void>;
  onUpvoteReply: (reply: any) => void;
  replyUpvotedIds: Set<string>;
  isAdmin?: boolean;
}

export default function PostDetailModal({
  post,
  onClose,
  onUpvote,
  hasUpvoted,
  onDownvote,
  hasDownvoted,
  onShare,
  onDelete,
  onDeleteReply,
  onEditReply,
  onUpvoteReply,
  replyUpvotedIds,
  isAdmin,
}: PostDetailModalProps) {
  const { user, userData } = useAuth();
  const { showToast } = useToast();
  const allBlockedIds = useAllBlockedUserIds();

  // ─── Reply state (owned locally — see component note above) ───
  const [replies, setReplies] = useState<any[]>([]);
  const [replyContent, setReplyContent] = useState('');
  const [replyImageFile, setReplyImageFile] = useState<File | null>(null);
  const [isUploadingReplyImage, setIsUploadingReplyImage] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);
  const [replyGifUrl, setReplyGifUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const clearReplyingTo = () => setReplyingTo(null);

  const postImageUrls = post.imageUrls && post.imageUrls.length > 0
    ? post.imageUrls
    : (post.imageUrl ? [post.imageUrl] : []);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [userReaction, setUserReaction] = useState<ReactionType | null>(null);
  const [showLikedBy, setShowLikedBy] = useState(false);
  const navigate = useNavigate();

  // GIF picker state
  const giphyKey = import.meta.env.VITE_GIPHY_API_KEY;
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [gifResults, setGifResults] = useState<any[]>([]);
  const [gifLoading, setGifLoading] = useState(false);

  const displayInfo = getPersonaDisplay(post, isAdmin);

  const repliesMap = useMemo(() => {
    const map: Record<string, any[]> = {};
    replies.forEach(r => {
      // Filter out comments from blocked users
      if (allBlockedIds.has(r.authorId)) return;

      const parentId = r.parentId || 'root';
      if (!map[parentId]) map[parentId] = [];
      map[parentId].push(r);
    });
    return map;
  }, [replies, allBlockedIds]);

  const [commentSort, setCommentSort] = useState<'recent' | 'top' | 'discussed'>('recent');

  // Stable blob URL for reply image preview — avoids memory leak from inline createObjectURL
  const replyImagePreviewUrl = useMemo(
    () => (replyImageFile ? URL.createObjectURL(replyImageFile) : null),
    [replyImageFile]
  );
  useEffect(() => {
    return () => { if (replyImagePreviewUrl) URL.revokeObjectURL(replyImagePreviewUrl); };
  }, [replyImagePreviewUrl]);

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

  // ─── Live replies subscription (moved out of Feed) ───
  useEffect(() => {
    let cancelled = false;
    getPostReplies(post.id)
      .then((reps) => {
        if (!cancelled) setReplies(reps);
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('Failed to load replies:', err);
          setReplies([]);
        }
      });
    return () => { cancelled = true; };
  }, [post.id]);

  // ─── Paste to add image to reply (moved out of Feed) ───
  useEffect(() => {
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
  }, [post.id]);

  useEffect(() => {
    if (user && post.type === 'confession') {
      getUserReaction(post.id, user.uid).then(r => setUserReaction(r));
    }
  }, [post.id, user?.uid, post.type]);

  const handleReactionClick = async (reaction: ReactionType) => {
    if (!user) return;
    await togglePostReaction(post.id, user.uid, reaction);
    const newReaction = await getUserReaction(post.id, user.uid);
    setUserReaction(newReaction);
  };

  // GIPHY search
  useEffect(() => {
    if (!showGifPicker) return;
    const controller = new AbortController();
    const delay = setTimeout(async () => {
      setGifLoading(true);
      try {
        const endpoint = gifSearch.trim()
          ? `https://api.giphy.com/v1/gifs/search?api_key=${giphyKey}&q=${encodeURIComponent(gifSearch)}&limit=24&rating=g`
          : `https://api.giphy.com/v1/gifs/trending?api_key=${giphyKey}&limit=24&rating=g`;
        const res = await fetch(endpoint, { signal: controller.signal });
        const json = await res.json();
        setGifResults(json.data || []);
      } catch (e) {
        if ((e as any).name !== 'AbortError') console.error(e);
      } finally {
        setGifLoading(false);
      }
    }, 400);
    return () => { clearTimeout(delay); controller.abort(); };
  }, [gifSearch, showGifPicker]);

  const handleReplyTo = (replyId: string, authorName: string) => {
    setReplyingTo({ id: replyId, name: authorName });
    document.getElementById('reply-input')?.focus();
  };

  const handleDeleteReply = async (replyId: string) => {
    if (!onDeleteReply) return;
    await onDeleteReply(replyId);
    setReplies(prev => prev.filter(reply => reply.id !== replyId && reply.parentId !== replyId));
  };

  const handleEditReply = async (replyId: string, newContent: string) => {
    await onEditReply(replyId, newContent);
    setReplies(prev => prev.map(reply =>
      reply.id === replyId
        ? { ...reply, content: newContent, edited: true, updatedAt: new Date() }
        : reply
    ));
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
    if ((!replyContent.trim() && !replyImageFile && !replyGifUrl) || isSubmitting) return;

    setIsSubmitting(true);
    try {
      let imageUrl: string | null = null;
      if (replyGifUrl) {
        // GIF — use URL directly, no upload needed
        imageUrl = replyGifUrl;
      } else if (replyImageFile) {
        setIsUploadingReplyImage(true);
        const safety = await checkImageSafety(replyImageFile);
        if (!safety.isSafe) {
          if (safety.isUnavailable) {
            showToast('Image verification is temporarily offline. Please try again later.', 'error');
          } else {
            showToast('Image flagged by safety check. Please choose a different image.', 'error');
          }
          setIsUploadingReplyImage(false);
          setIsSubmitting(false);
          return;
        }
        imageUrl = await uploadReplyImage(replyImageFile);
        setIsUploadingReplyImage(false);
      }

      const replyData = {
        postId: post.id,
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
      getPostReplies(post.id).then(setReplies).catch(() => {});

      const postRef = doc(db, 'posts', post.id);
      await updateDoc(postRef, {
        repliesCount: (post.repliesCount || 0) + 1
      });

      // Send notification to post author
      if (post.authorId !== user.uid) {
        createNotification({
          userId: post.authorId,
          type: 'new_message',
          title: 'New Comment',
          message: `${userData?.name || user.email?.split('@')[0]} commented on your post`,
          link: `/post/${post.id}`,
          postId: post.id
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
              link: `/post/${post.id}`,
              postId: post.id
            });
          }
        }
      }

      // Notify mentioned users in the reply
      if (replyContent) {
        notifyMentionedUsers(replyContent, user.uid, userData?.name || 'Someone', {
          type: 'post_reply',
          link: `/post/${post.id}`,
          postId: post.id,
        }).catch(err => console.warn('Failed to notify mentioned users:', err));
      }

      setReplyContent('');
      setReplyImageFile(null);
      setReplyGifUrl(null);
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

  return (
    <>
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
            <X size={20} />
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
                {post.isHot && (
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

          {/* Video */}
          {(post as any).videoUrl && (
            <div className="relative mb-6 w-full rounded-2xl overflow-hidden bg-black">
              <Suspense fallback={<LazyFallback />}>
                <VideoPlayer
                  src={(post as any).videoUrl}
                  poster={postImageUrls?.[0] || (post as any).imageUrl}
                  className="w-full h-auto max-h-[60vh] object-contain"
                />
              </Suspense>
            </div>
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
                  onReply={handleReplyTo}
                  onDeleteReply={handleDeleteReply}
                  onEditReply={handleEditReply}
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
              onSubmit={handleSubmitReply}
              className="mt-4"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file && file.type.startsWith('image/')) {
                  setReplyImageFile(file);
                  setReplyGifUrl(null);
                }
              }}
            >
              {/* GIF or image preview */}
              {replyGifUrl ? (
                <div className="relative inline-block mb-3">
                  <img src={replyGifUrl} alt="GIF" className="h-24 rounded-xl border border-luxury-ink/10 object-cover" />
                  <button
                    type="button"
                    onClick={() => setReplyGifUrl(null)}
                    className="absolute -top-1.5 -right-1.5 bg-luxury-ink text-white p-1 rounded-full"
                  >
                    <X size={10} />
                  </button>
                </div>
              ) : replyImageFile ? (
                <div className="relative inline-block mb-3">
                  <div className="w-20 h-20 rounded-xl overflow-hidden border border-luxury-ink/10">
                    <img src={replyImagePreviewUrl!} alt="Preview" className="w-full h-full object-cover" />

                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyImageFile(null)}
                    className="absolute -top-1.5 -right-1.5 bg-luxury-ink text-white p-1 rounded-full"
                  >
                    <X size={10} />
                  </button>
                </div>
              ) : null}

              {/* GIF Picker Panel */}
              {showGifPicker && (
                <div className="mb-3 rounded-2xl border border-luxury-ink/8 bg-surface-base overflow-hidden">
                  <div className="p-2 border-b border-luxury-ink/5">
                    <input
                      type="text"
                      value={gifSearch}
                      onChange={(e) => setGifSearch(e.target.value)}
                      placeholder="Search GIFs..."
                      autoFocus
                      className="w-full bg-surface-soft rounded-xl px-3 py-2 text-sm font-medium text-luxury-ink focus:outline-none focus:ring-2 focus:ring-brand-teal/20 placeholder-luxury-ink/30"
                    />
                  </div>
                  <div className="h-52 overflow-y-auto p-2">
                    {gifLoading ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="w-5 h-5 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : gifResults.length > 0 ? (
                      <div className="grid grid-cols-3 gap-1.5">
                        {gifResults.map((gif: any) => (
                          <button
                            key={gif.id}
                            type="button"
                            onClick={() => {
                              setReplyGifUrl(gif.images.fixed_height.url);
                              setReplyImageFile(null);
                              setShowGifPicker(false);
                              setGifSearch('');
                              setGifResults([]);
                            }}
                            className="aspect-square rounded-lg overflow-hidden hover:ring-2 hover:ring-brand-teal transition-all"
                          >
                            <img
                              src={gif.images.fixed_height_small.url}
                              alt={gif.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-luxury-ink/30 text-sm font-medium">
                        {gifSearch ? 'No GIFs found' : 'Trending GIFs loading...'}
                      </div>
                    )}
                  </div>
                  <div className="px-3 py-1.5 border-t border-luxury-ink/5 flex justify-between items-center">
                    <span className="text-[10px] text-luxury-ink/25 font-semibold tracking-wide uppercase">Powered by GIPHY</span>
                    <button
                      type="button"
                      onClick={() => { setShowGifPicker(false); setGifSearch(''); }}
                      className="text-[11px] font-bold text-luxury-ink/40 hover:text-luxury-ink transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-2 items-end">
                <MentionInput
                  id="reply-input"
                  value={replyContent}
                  onChange={(val) => setReplyContent(val)}
                  placeholder="Write a reply..."
                  className="w-full bg-surface-base border border-luxury-ink/5 rounded-xl py-3 px-4 focus:outline-none focus:border-brand-teal text-sm font-medium"
                />
                {/* GIF button */}
                <button
                  type="button"
                  onClick={() => {
                    setShowGifPicker(p => !p);
                    if (!showGifPicker) { setReplyImageFile(null); setReplyGifUrl(null); }
                  }}
                  className={`p-3 rounded-xl border text-[11px] font-bold tracking-wide shrink-0 transition-colors ${
                    showGifPicker
                      ? 'border-brand-teal/40 text-brand-teal bg-brand-teal/5'
                      : 'border-luxury-ink/5 text-luxury-ink/40 hover:text-brand-teal hover:border-brand-teal/30'
                  }`}
                >
                  GIF
                </button>
                <label className="p-3 rounded-xl border border-luxury-ink/5 text-luxury-ink/40 hover:text-brand-teal hover:border-brand-teal/30 cursor-pointer transition-colors shrink-0">
                  <ImageIcon size={18} />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setReplyImageFile(e.target.files[0]);
                        setReplyGifUrl(null);
                        setShowGifPicker(false);
                      }
                    }}
                    className="hidden"
                  />
                </label>
                <button
                  type="submit"
                  disabled={(!replyContent.trim() && !replyImageFile && !replyGifUrl) || isSubmitting}
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
                    <Heart size={26} className={hasUpvoted ? 'fill-brand-pink' : ''} />
                    <button
                      type="button"
                      className="hover:underline cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); if ((post.upvotesCount || 0) > 0) setShowLikedBy(true); }}
                      aria-label="See who liked this"
                    >
                      {post.upvotesCount || 0}
                    </button>
                  </button>
                  <div className="w-1px h-6 bg-luxury-ink/10"></div>
                  <button
                    onClick={() => onDownvote(post)}
                    className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-sm font-bold transition-all ${hasDownvoted ? 'bg-indigo-500/10 text-indigo-500' : 'hover:bg-white text-luxury-ink/40 hover:text-indigo-500'}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill={hasDownvoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path>
                    </svg>
                    {post.downvotesCount || 0}
                  </button>
              </div>

              <div className="flex items-center gap-1 sm:gap-2">
                <button
                  onClick={() => document.getElementById('reply-input')?.focus()}
                  className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-3 hover:bg-surface-soft rounded-2xl text-sm font-bold text-luxury-ink/40 hover:text-brand-teal transition-all"
                >
                  <MessageSquare size={26} />
                  {post.repliesCount || 0}
                </button>
                <button
                  onClick={() => onShare(post)}
                  className="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 hover:bg-surface-soft rounded-xl text-xs font-bold text-luxury-ink/40 hover:text-brand-teal transition-all"
                >
                  <Share2 size={24} />
                </button>
              </div>
            </div>
            {(isAdmin || post.authorId === user?.uid) && onDelete && (
            <button
              onClick={() => onDelete(post.id)}
              className="flex items-center gap-1.5 px-4 py-2.5 hover:bg-red-500/10 hover:text-red-500 rounded-xl text-xs font-bold text-luxury-ink/20 transition-all"
            >
              <Trash2 size={18} />
            </button>
          )}
          </div>
        </div>
      </motion.div>
    </motion.div>

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
