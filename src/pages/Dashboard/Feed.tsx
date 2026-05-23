import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, X, Search, MapPin, School, GraduationCap, Calendar, FileText, Info, ArrowBigUp, MessageSquare, Flame, Share2, Image as ImageIcon, Trash2, Heart, Users, Grid3X3, UserCheck, Bookmark } from 'lucide-react';
import { collection, onSnapshot, query, where, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';
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

interface Post {
  id: string;
  title: string;
  content: string;
  type: string;
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
  { id: 'others', label: 'Others' },
];

// ─── Post Detail Modal (Instagram-style) ──────────────────

function PostDetailModal({ post, onClose, onUpvote, hasUpvoted, onShare, onDelete, isAdmin, replies, replyContent, setReplyContent, onSubmitReply, isSubmitting }: {
  post: Post;
  onClose: () => void;
  onUpvote: (post: Post) => void;
  hasUpvoted: boolean;
  onShare: (post: Post) => void;
  onDelete?: (postId: string) => void;
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
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          {/* No image? show close button here */}
          {postImageUrls.length === 0 && (
            <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-surface-base text-luxury-ink/40 rounded-full hover:bg-surface-soft hover:text-luxury-ink transition-all">
              <X size={18} />
            </button>
          )}

          {/* Author */}
          <div className="flex items-center gap-3 mb-5">
            <Link to={`/profile/${post.authorId}`} onClick={onClose} className="shrink-0">
              <div className="w-11 h-11 rounded-full bg-brand-pink/10 flex items-center justify-center text-brand-pink font-bold text-lg font-serif overflow-hidden border-2 border-white shadow-sm">
                {post.authorProfilePicture ? (
                  <img src={getOptimizedImageUrl(post.authorProfilePicture)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : post.authorName[0]?.toUpperCase()}
              </div>
            </Link>
            <div className="flex-1 min-w-0">
              <Link to={`/profile/${post.authorId}`} onClick={onClose} className="text-sm font-bold text-luxury-ink hover:text-brand-teal transition-colors">
                {post.authorName}
              </Link>
              <p className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30 flex items-center gap-1">
                <School size={10} /> {post.school}
                {post.city && <><span className="mx-1">•</span><MapPin size={10} /> {post.city}</>}
              </p>
            </div>
            <div className="flex gap-1.5">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-teal/10 text-brand-teal rounded-full text-[9px] font-bold uppercase tracking-widest">
                {POST_TYPES.find(t => t.id === post.type)?.label || post.type}
              </span>
              {post.feedScore && post.feedScore > 10 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 text-amber-500 rounded-full text-[9px] font-bold uppercase tracking-widest">
                  <Flame size={10} /> Hot
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
                {replies.map(reply => (
                  <div key={reply.id} className="bg-surface-soft/30 p-4 rounded-2xl border border-luxury-ink/5">
                    <div className="flex items-center gap-3 mb-2">
                      <Link to={`/profile/${reply.authorId}`} onClick={onClose} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                        <div className="w-6 h-6 rounded-full bg-brand-teal/10 flex items-center justify-center text-brand-teal font-bold text-[10px] shrink-0">
                          {reply.authorName[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-luxury-ink">{reply.authorName}</p>
                          <p className="text-[8px] font-bold uppercase tracking-widest text-luxury-ink/30">{reply.authorSchool}</p>
                        </div>
                      </Link>
                    </div>
                    <p className="text-sm text-luxury-ink/80 leading-relaxed">{reply.content}</p>
                  </div>
                ))}
              </div>
            )}
            
            {/* Reply Input Form */}
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

        {/* Action Bar */}
        <div className="px-6 md:px-8 py-4 border-t border-luxury-ink/5 flex items-center justify-between bg-surface-base/50">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onUpvote(post)}
              className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${hasUpvoted ? 'bg-brand-pink/10 text-brand-pink' : 'hover:bg-surface-soft text-luxury-ink/40 hover:text-brand-pink'}`}
            >
              <Heart size={24} className={hasUpvoted ? 'fill-brand-pink' : ''} />
              {post.upvotesCount || 0}
            </button>
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
          {isAdmin && onDelete && (
            <button
              onClick={() => onDelete(post.id)}
              className="flex items-center gap-1.5 px-4 py-2.5 hover:bg-red-500/10 hover:text-red-500 rounded-xl text-xs font-bold text-luxury-ink/20 transition-all"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Posts Component ─────────────────────────────────

export default function Feed() {
  const [posts, setPosts] = useState<Post[]>([]);
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

  // Lock body scroll when a modal is open
  useScrollLock(isModalOpen || !!selectedPost || cropImageSrc !== null);

  const [wishlisted, setWishlisted] = useState<Set<string>>(new Set());
  const [wishlistMap, setWishlistMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const q = query(
      collection(db, 'posts'),
      where('status', '==', 'approved')
    );

    const now = Date.now();
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        const fetchedPosts: Post[] = [];
        const authorPostCount: Record<string, number> = {};
        
        // Pre-fetch unique authors (REMOVED to prevent N+1 queries)
        // Relying entirely on denormalized data on the post documents.

        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          const postTime = data.createdAt?.toMillis() || now;
          const hoursPassed = Math.max(0, (now - postTime) / (1000 * 60 * 60));

          // Improved algorithm
          const baseHype = ((data.upvotesCount || 0) * 2) + ((data.repliesCount || 0) * 3);
          const timePenalty = hoursPassed * 0.5;
          const cityBoost = (userData?.city && data.city === userData.city) ? 10 : 0;
          const schoolBoost = (userData?.school && data.school === userData.school) ? 15 : 0;
          const followBoost = followingIds.has(data.authorId) ? 20 : 0;
          const friendBoost = friendIds.has(data.authorId) ? 30 : 0;

          // Diversity penalty
          authorPostCount[data.authorId] = (authorPostCount[data.authorId] || 0) + 1;
          const diversityPenalty = authorPostCount[data.authorId] > 2 ? (authorPostCount[data.authorId] - 2) * 10 : 0;

          const feedScore = baseHype - timePenalty + cityBoost + schoolBoost + followBoost + friendBoost - diversityPenalty;

          // Use denormalized data
          const postData = {
            id: docSnap.id,
            feedScore,
            ...data,
            authorName: data.authorName || 'Unknown User',
            authorProfilePicture: data.authorProfilePicture || null,
          } as Post;

          fetchedPosts.push(postData);
        });

        fetchedPosts.sort((a, b) => {
          if (a.feedScore !== b.feedScore) {
            return (b.feedScore || 0) - (a.feedScore || 0);
          }
          const timeA = a.createdAt?.toMillis() || 0;
          const timeB = b.createdAt?.toMillis() || 0;
          return timeB - timeA;
        });

        setPosts(fetchedPosts);
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
  }, [userData, followingIds, friendIds]);

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

    try {
      let imageUrls: string[] = [];
      if (imageFiles.length > 0) {
        imageUrls = await Promise.all(imageFiles.map(file => uploadPostImage(file)));
      }

      await addDoc(collection(db, 'posts'), {
        title,
        content,
        type,
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

  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      window.location.href = '/login';
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
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'post_replies'), replyData);
      
      const postRef = doc(db, 'posts', selectedPost.id);
      await updateDoc(postRef, {
        repliesCount: (selectedPost.repliesCount || 0) + 1
      });

      setReplyContent('');
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
    if (!window.confirm('Are you sure you want to delete this post?')) return;
    try {
      await deleteDoc(doc(db, 'posts', postId));
      showToast('Post deleted successfully', 'success');
      setSelectedPost(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'posts');
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
            onClick={() => setContentType('posts')}
            className={`py-3 sm:py-4 text-xs font-bold uppercase tracking-widest transition-all border-b-2 whitespace-nowrap shrink-0 ${contentType === 'posts' ? 'border-luxury-ink text-luxury-ink' : 'border-transparent text-luxury-ink/30 hover:text-luxury-ink/60'}`}
          >
            Community
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
              {combinedFeed.map(item => {
                if (item._kind === 'product') {
                  return (
                    <ProductCard 
                      key={`prod-${item.id}`} 
                      product={item} 
                      isWishlisted={wishlisted.has(item.id)} 
                      wishlistDocId={wishlistMap[item.id]} 
                    />
                  );
                }

                // Otherwise, it's a Post
                const post = item as Post;
                const hasUpvoted = upvotedPostIds.has(post.id);

                return (
                  <PostCard 
                    key={`post-${post.id}`} 
                    post={post} 
                    hasUpvoted={hasUpvoted} 
                    onClick={() => setSelectedPost(post)} 
                  />
                );
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
            onClose={() => setSelectedPost(null)}
            onUpvote={handleUpvote}
            hasUpvoted={upvotedPostIds.has(selectedPost.id)}
            onShare={handleShare}
            onDelete={userData?.role === 'admin' ? handleDeletePost : undefined}
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
