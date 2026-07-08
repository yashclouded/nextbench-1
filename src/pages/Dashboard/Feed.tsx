import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect, useReducer, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, X, Search, MapPin, School, GraduationCap, Calendar, FileText, Info, ArrowBigUp, MessageSquare, Flame, Share2, Image as ImageIcon, Trash2, Heart, Users, Grid3X3, UserCheck, Bookmark, MoreHorizontal, Globe, Lock, Settings, BarChart3, ChevronLeft, ChevronRight, Paperclip, Film, Pencil } from 'lucide-react';
import { collection, query, where, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import SEO from '../../components/seo/SEO';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { uploadPostImage, uploadPostPdf, uploadPostVideo, extractVideoThumbnail, uploadVideoThumbnail } from '../../lib/storage';
import { getOptimizedImageUrl } from '../../lib/utils';
import { useFollowingIds } from '../../lib/follows';
import { isTextSafe } from '../../lib/moderation';
import { checkAllImagesSafety, preloadModerationModel } from '../../lib/imageModeration';
import { createNotification } from '../../lib/notifications';
import ShareModal from '../../components/ui/ShareModal';
import { Link, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
// Lazy-load heavy components — only bundled/parsed when actually needed
const ImageCropper = lazy(() => import('../../components/ui/ImageCropper'));
import ProductCard from '../../components/ui/ProductCard';
import PostCard from '../../components/ui/PostCard';
import PostDetailModal from '../../components/feed/PostDetailModal';
import Stories from '../../components/stories/Stories';
import { useScrollLock } from '../../hooks/useScrollLock';
import { useBlockedIds, useBlockedByIds } from '../../lib/blocks';
import { usePublicClubs, joinClub } from '../../lib/clubs';
import { savePost, unsavePost } from '../../lib/saves';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { deletePostCascade, getDiscoveryFeed } from '../../lib/discovery';

// Minimal spinner used as Suspense fallback for lazy components
const LazyFallback = () => (
  <div className="flex items-center justify-center p-4">
    <div className="w-5 h-5 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
  </div>
);




export interface Post {
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
  isHot?: boolean;
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
// Memoized: it takes no props, so it never needs to re-render once mounted.
const PostCardSkeleton = React.memo(function PostCardSkeleton() {
  return (
    <div className="p-5 sm:p-6 md:p-8 flex flex-col w-full border-b animate-pulse" style={{ borderColor: 'var(--color-border)' }}>
      {/* Avatar + meta row */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-9 h-9 rounded-full bg-luxury-ink/8 shrink-0" />
        <div className="flex gap-2 flex-1">
          <div className="h-3 w-28 rounded-full bg-luxury-ink/8" />
          <div className="h-3 w-10 rounded-full bg-luxury-ink/6" />
        </div>
        <div className="h-5 w-16 rounded-full bg-luxury-ink/6" />
      </div>
      {/* Title (serif — taller) */}
      <div className="h-6 w-3/4 rounded-lg bg-luxury-ink/10 mb-3" />
      {/* Content lines */}
      <div className="space-y-2.5 mb-6">
        <div className="h-3.5 w-full rounded-full bg-luxury-ink/7" />
        <div className="h-3.5 w-11/12 rounded-full bg-luxury-ink/7" />
        <div className="h-3.5 w-4/6 rounded-full bg-luxury-ink/6" />
      </div>
      {/* Action bar */}
      <div className="flex items-center gap-5 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <div className="h-8 w-12 rounded-full bg-luxury-ink/8" />
        <div className="h-8 w-12 rounded-full bg-luxury-ink/8" />
        <div className="h-8 w-10 rounded-full bg-luxury-ink/8" />
      </div>
    </div>
  );
});

// ─── Infinite Scroll Sentinel ──────────────────────────────
function InfiniteScrollSentinel({ onVisible }: { onVisible: () => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  // Store callback in a ref so the IntersectionObserver never needs to be
  // reconnected when the parent component re-renders with a new function reference.
  const callbackRef = React.useRef(onVisible);
  React.useEffect(() => { callbackRef.current = onVisible; }, [onVisible]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) callbackRef.current(); },
      { rootMargin: '600px' }  // Fire 600px before sentinel enters viewport
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []); // Stable — never re-connects

  return (
    <div ref={ref} className="flex flex-col w-full min-w-0">
      {Array.from({ length: 3 }).map((_, i) => <PostCardSkeleton key={i} />)}
    </div>
  );
}

// ─── Main Posts Component ─────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timestampMillis(value: any): number {
  if (typeof value === 'number') return value;
  return value?.toMillis?.() || 0;
}

// ─── Consolidated like / dislike / save interaction state ──────────────────
// Replaces 4 separate Sets (upvoted/downvoted/saved post ids, upvoted reply
// ids) and 3 lookup Maps (Firestore doc-id keyed by post/reply) with one
// reducer. A single optimistic toggle (e.g. liking a post that was disliked)
// becomes one atomic dispatch instead of several independent setState calls.
interface InteractionState {
  upvotedPostIds: Set<string>;
  downvotedPostIds: Set<string>;
  savedPostIds: Set<string>;
  replyUpvotedIds: Set<string>;
  upvoteMap: Record<string, string>;
  downvoteMap: Record<string, string>;
  replyUpvoteMap: Record<string, string>;
}

type InteractionAction =
  | { type: 'SET_UPVOTES'; ids: Set<string>; map: Record<string, string> }
  | { type: 'SET_DOWNVOTES'; ids: Set<string>; map: Record<string, string> }
  | { type: 'SET_SAVES'; ids: Set<string> }
  | { type: 'SET_REPLY_UPVOTES'; ids: Set<string>; map: Record<string, string> }
  | { type: 'SET_MEMBER'; key: 'upvotedPostIds' | 'downvotedPostIds' | 'savedPostIds' | 'replyUpvotedIds'; id: string; present: boolean };

const initialInteractionState: InteractionState = {
  upvotedPostIds: new Set(),
  downvotedPostIds: new Set(),
  savedPostIds: new Set(),
  replyUpvotedIds: new Set(),
  upvoteMap: {},
  downvoteMap: {},
  replyUpvoteMap: {},
};

function interactionReducer(state: InteractionState, action: InteractionAction): InteractionState {
  switch (action.type) {
    case 'SET_UPVOTES':
      return { ...state, upvotedPostIds: action.ids, upvoteMap: action.map };
    case 'SET_DOWNVOTES':
      return { ...state, downvotedPostIds: action.ids, downvoteMap: action.map };
    case 'SET_SAVES':
      return { ...state, savedPostIds: action.ids };
    case 'SET_REPLY_UPVOTES':
      return { ...state, replyUpvotedIds: action.ids, replyUpvoteMap: action.map };
    case 'SET_MEMBER': {
      const next = new Set(state[action.key]);
      if (action.present) next.add(action.id);
      else next.delete(action.id);
      return { ...state, [action.key]: next };
    }
    default:
      return state;
  }
}

// ─── Consolidated post-composer upload / crop / pre-upload state ────────────
// Replaces 10 separate useState hooks (selected/cropped image files, crop flow
// position, upload progress, and the background pre-upload results) with one
// reducer. PATCH merges any subset of fields in a single update; the image-file
// list also supports a functional updater so append/remove stay race-free.
interface UploadProgress { pct: number; loaded: number; total: number; }
interface PreUploadedPdf { url: string; pages: number; }

interface UploadState {
  imageFiles: File[];
  pendingFiles: File[];
  cropImageSrc: string | null;
  currentCropIndex: number;
  uploadProgress: UploadProgress | null;
  isPreUploading: boolean;
  preUploadLabel: string;
  preUploadedImageUrls: string[];
  preUploadedVideoUrl: string | null;
  preUploadedVideoThumbnail: string | null;
  preUploadedPdfData: PreUploadedPdf | null;
}

const initialUploadState: UploadState = {
  imageFiles: [],
  pendingFiles: [],
  cropImageSrc: null,
  currentCropIndex: 0,
  uploadProgress: null,
  isPreUploading: false,
  preUploadLabel: '',
  preUploadedImageUrls: [],
  preUploadedVideoUrl: null,
  preUploadedVideoThumbnail: null,
  preUploadedPdfData: null,
};

type UploadAction =
  | { type: 'PATCH'; patch: Partial<UploadState> }
  | { type: 'UPDATE_IMAGE_FILES'; updater: (prev: File[]) => File[] };

function uploadReducer(state: UploadState, action: UploadAction): UploadState {
  switch (action.type) {
    case 'PATCH':
      return { ...state, ...action.patch };
    case 'UPDATE_IMAGE_FILES':
      return { ...state, imageFiles: action.updater(state.imageFiles) };
    default:
      return state;
  }
}

export default function Feed() {
  const [privacy, setPrivacy] = useState('public');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [submittingStatus, setSubmittingStatus] = useState('Posting...');
  const [contentType, setContentType] = useState<'all' | 'posts' | 'marketplace'>('all');

  const { user, userData } = useAuth();
  const { showToast } = useToast();
  const { followingIds, friendIds } = useFollowingIds();
  const blockedIds = useBlockedIds();
  const blockedByIds = useBlockedByIds();

  // Consolidated like/dislike/save state (see interactionReducer above).
  const [interactionState, dispatchInteraction] = useReducer(interactionReducer, initialInteractionState);
  const { upvotedPostIds, downvotedPostIds, savedPostIds, replyUpvotedIds, upvoteMap, downvoteMap, replyUpvoteMap } = interactionState;

  // Consolidated upload / crop / pre-upload state (see uploadReducer above).
  // Thin same-named adapters keep every existing call site untouched while all
  // state lives in one reducer.
  const [uploadState, dispatchUpload] = useReducer(uploadReducer, initialUploadState);
  const { imageFiles, pendingFiles, cropImageSrc, currentCropIndex, uploadProgress, isPreUploading, preUploadLabel, preUploadedImageUrls, preUploadedVideoUrl, preUploadedVideoThumbnail, preUploadedPdfData } = uploadState;
  const patchUpload = (patch: Partial<UploadState>) => dispatchUpload({ type: 'PATCH', patch });
  const setImageFiles = (v: File[] | ((prev: File[]) => File[])) =>
    typeof v === 'function'
      ? dispatchUpload({ type: 'UPDATE_IMAGE_FILES', updater: v })
      : patchUpload({ imageFiles: v });
  const setPendingFiles = (v: File[]) => patchUpload({ pendingFiles: v });
  const setCropImageSrc = (v: string | null) => patchUpload({ cropImageSrc: v });
  const setCurrentCropIndex = (v: number) => patchUpload({ currentCropIndex: v });
  const setUploadProgress = (v: UploadProgress | null) => patchUpload({ uploadProgress: v });
  const setIsPreUploading = (v: boolean) => patchUpload({ isPreUploading: v });
  const setPreUploadLabel = (v: string) => patchUpload({ preUploadLabel: v });
  const setPreUploadedImageUrls = (v: string[]) => patchUpload({ preUploadedImageUrls: v });
  const setPreUploadedVideoUrl = (v: string | null) => patchUpload({ preUploadedVideoUrl: v });
  const setPreUploadedVideoThumbnail = (v: string | null) => patchUpload({ preUploadedVideoThumbnail: v });
  const setPreUploadedPdfData = (v: PreUploadedPdf | null) => patchUpload({ preUploadedPdfData: v });

  const [wishlisted, setWishlisted] = useState<Set<string>>(new Set());
  const [wishlistMap, setWishlistMap] = useState<Record<string, string>>({});
  const wishlistedProductIds = Array.from(wishlisted);

  // selectedPost drives the PostDetailModal; all reply state now lives inside
  // that modal so reply typing/loading no longer re-renders the feed.
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  // ─── Consolidated modal-visibility state ───────────────────────────────
  // One object for every composer/dialog flag instead of five useState hooks.
  // Same-named destructured values + setter adapters keep all call sites
  // unchanged. (Local type names avoid clashing with the ConfirmDialog component.)
  type ConfirmDialogState = { title: string; message: string; onConfirm: () => void } | null;
  type ShareModalState = { isOpen: boolean; url: string; title: string; sharedPost?: any };
  const [modalState, setModalState] = useState<{
    isModalOpen: boolean;
    showPostOptions: boolean;
    showPollCreator: boolean;
    confirmDialog: ConfirmDialogState;
    shareModalData: ShareModalState;
  }>({
    isModalOpen: false,
    showPostOptions: false,
    showPollCreator: false,
    confirmDialog: null,
    shareModalData: { isOpen: false, url: '', title: '' },
  });
  const { isModalOpen, showPostOptions, showPollCreator, confirmDialog, shareModalData } = modalState;
  const setIsModalOpen = (v: boolean) => setModalState(s => ({ ...s, isModalOpen: v }));
  const setShowPostOptions = (v: boolean) => setModalState(s => ({ ...s, showPostOptions: v }));
  const setShowPollCreator = (v: boolean) => setModalState(s => ({ ...s, showPollCreator: v }));
  const setConfirmDialog = (v: ConfirmDialogState) => setModalState(s => ({ ...s, confirmDialog: v }));
  const setShareModalData = (v: ShareModalState | ((prev: ShareModalState) => ShareModalState)) =>
    setModalState(s => ({ ...s, shareModalData: typeof v === 'function' ? v(s.shareModalData) : v }));

  const askConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmDialog({ title, message, onConfirm });
  };

  // Lock body scroll when a modal is open
  useScrollLock(isModalOpen || !!selectedPost || cropImageSrc !== null);

  const [rawPosts, setRawPosts] = useState<Post[]>([]);

  // Stable blob URLs for image-file previews in the post creation modal.
  // useMemo creates each URL once per imageFiles change; useEffect revokes
  // old URLs when imageFiles changes or the component unmounts.
  const imageFilePreviewUrls = useMemo(
    () => imageFiles.map(f => URL.createObjectURL(f)),
    [imageFiles]
  );
  useEffect(() => {
    return () => { imageFilePreviewUrls.forEach(u => URL.revokeObjectURL(u)); };
  }, [imageFilePreviewUrls]);

  // ─── Pagination state ────────────────────────────────────
  const [feedCursor, setFeedCursor] = useState<{ postCreatedAt?: number; productCreatedAt?: number }>({});
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

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

  // Poll state — showPollCreator lives in modalState (see above).
  // Consolidated poll-composer state — one object instead of four useState hooks.
  const [pollState, setPollState] = useState<{ choices: string[]; days: number; hours: number; minutes: number }>({
    choices: ['', ''],
    days: 1,
    hours: 0,
    minutes: 0,
  });
  const { choices: pollChoices, days: pollDays, hours: pollHours, minutes: pollMinutes } = pollState;
  const setPollChoices = (v: string[]) => setPollState(s => ({ ...s, choices: v }));
  const setPollDays = (v: number) => setPollState(s => ({ ...s, days: v }));
  const setPollHours = (v: number) => setPollState(s => ({ ...s, hours: v }));
  const setPollMinutes = (v: number) => setPollState(s => ({ ...s, minutes: v }));

  // Discovery feed is served through a callable so block relationships are
  // enforced before posts/listings reach the client.
  useEffect(() => {
    let cancelled = false;

    const fetchInitialFeed = async () => {
      try {
        const data = await getDiscoveryFeed();
        if (cancelled) return;
        setRawPosts(data.posts as Post[]);
        setProducts(data.products as Product[]);
        setFeedCursor(data.nextCursor || {});
        setHasMorePosts(data.hasMorePosts);
        setHasMoreProducts(data.hasMoreProducts);
      } catch (err) {
        console.error('Error fetching feed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchInitialFeed();
    return () => { cancelled = true; };
  }, [user?.uid]);

  // Feed scoring — Instagram-style curated algorithm
  const posts = useMemo(() => {
    const now = Date.now();
    const authorPostCount: Record<string, number> = {};

    const scored = rawPosts.map(post => {
      const postTime = timestampMillis(post.createdAt) || now;
      const hoursPassed = Math.max(0, (now - postTime) / (1000 * 60 * 60));

      // 1. Base Engagement (Hype)
      const baseHype = 1 + (post.upvotesCount || 0) * 2 + (post.repliesCount || 0) * 3;

      // 2. Exponential Time Decay (Gravity)
      // (hours + 2)^1.5 creates a smooth curve where fresh content is boosted 
      // but highly engaging older content can still surface
      const timeFactor = Math.pow(hoursPassed + 2, 1.5);

      // 3. Affinity Multipliers (Relevance)
      let affinityMultiplier = 1.0;
      if (userData?.city && post.city === userData.city) affinityMultiplier += 0.1;
      if (userData?.school && post.school === userData.school) affinityMultiplier += 0.2;
      if (followingIds.has(post.authorId)) affinityMultiplier += 0.5;
      if (friendIds.has(post.authorId)) affinityMultiplier += 0.8;

      // 4. Diversity Penalty (Anti-Spam)
      authorPostCount[post.authorId] = (authorPostCount[post.authorId] || 0) + 1;
      // 0.6x multiplier for each subsequent post by the same author in this batch
      const diversityMultiplier = Math.pow(0.6, Math.max(0, authorPostCount[post.authorId] - 1));

      // Final Score Calculation
      const feedScore = (baseHype / timeFactor) * affinityMultiplier * diversityMultiplier;

      // Hot status: High base hype relative to its age
      const isHot = baseHype >= 15 && hoursPassed < 48;

      return { ...post, feedScore, isHot };
    });

    scored.sort((a, b) => {
      if (a.feedScore !== b.feedScore) return (b.feedScore || 0) - (a.feedScore || 0);
      const timeA = timestampMillis(a.createdAt);
      const timeB = timestampMillis(b.createdAt);
      return timeB - timeA;
    });

    return scored;
  }, [rawPosts, userData, followingIds, friendIds]);

  // ─── Load more (cursor-based pagination) ────────────────────────
  const loadMoreFeed = useCallback(async () => {
    if (isLoadingMore) return;
    if (!hasMorePosts && !hasMoreProducts) return;
    setIsLoadingMore(true);

    try {
      const data = await getDiscoveryFeed(feedCursor);
      setRawPosts(prev => [...prev, ...(data.posts as Post[])]);
      setProducts(prev => [...prev, ...(data.products as Product[])]);
      setFeedCursor(data.nextCursor || {});
      setHasMorePosts(data.hasMorePosts);
      setHasMoreProducts(data.hasMoreProducts);
    } catch (err) {
      console.error('Error loading more feed items:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMorePosts, hasMoreProducts, feedCursor]);

  // \u2500\u2500\u2500 Background pre-upload when file is selected \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  useEffect(() => {
    if (!videoFile) { setPreUploadedVideoUrl(null); return; }
    let cancelled = false;
    setIsPreUploading(true);
    setPreUploadLabel('Uploading video...');
    setUploadProgress({ pct: 0, loaded: 0, total: videoFile.size });
    uploadPostVideo(videoFile, (pct, loaded, total) => {
      if (!cancelled) setUploadProgress({ pct, loaded, total });
    }).then(url => {
      if (!cancelled) { setPreUploadedVideoUrl(url); setUploadProgress(null); }
    }).catch(err => {
      console.error('Video pre-upload failed:', err);
      if (!cancelled) setUploadProgress(null);
    }).finally(() => {
      if (!cancelled) setIsPreUploading(false);
    });
    return () => { cancelled = true; };
  }, [videoFile]);

  useEffect(() => {
    if (!pdfFile) { setPreUploadedPdfData(null); return; }
    let cancelled = false;
    setIsPreUploading(true);
    setPreUploadLabel('Uploading PDF...');
    setUploadProgress({ pct: 0, loaded: 0, total: pdfFile.size });
    uploadPostPdf(pdfFile, (pct, loaded, total) => {
      if (!cancelled) setUploadProgress({ pct, loaded, total });
    }).then(result => {
      if (!cancelled) { setPreUploadedPdfData(result); setUploadProgress(null); }
    }).catch(err => {
      console.error('PDF pre-upload failed:', err);
      if (!cancelled) setUploadProgress(null);
    }).finally(() => {
      if (!cancelled) setIsPreUploading(false);
    });
    return () => { cancelled = true; };
  }, [pdfFile]);

  useEffect(() => {
    if (!imageFiles.length) { setPreUploadedImageUrls([]); return; }
    let cancelled = false;
    setIsPreUploading(true);
    setPreUploadLabel('Uploading images...');
    const totalSize = imageFiles.reduce((s, f) => s + f.size, 0);
    let uploadedSize = 0;
    setUploadProgress({ pct: 0, loaded: 0, total: totalSize });
    Promise.all(
      imageFiles.map(async (file) => {
        const url = await uploadPostImage(file, (pct, loaded) => {
          if (!cancelled) {
            const baseLoaded = uploadedSize;
            setUploadProgress({ pct: Math.round((baseLoaded + loaded) / totalSize * 100), loaded: baseLoaded + loaded, total: totalSize });
          }
        });
        uploadedSize += file.size;
        return url;
      })
    ).then(urls => {
      if (!cancelled) { setPreUploadedImageUrls(urls); setUploadProgress(null); }
    }).catch(err => {
      console.error('Image pre-upload failed:', err);
      if (!cancelled) setUploadProgress(null);
    }).finally(() => {
      if (!cancelled) setIsPreUploading(false);
    });
    return () => { cancelled = true; };
  }, [imageFiles]);


  useEffect(() => {
    if (!user) return;
    const fetchUpvotes = async () => {
      try {
        const q = query(collection(db, 'post_upvotes'), where('userId', '==', user.uid));
        const snap = await getDocs(q);
        const ids = new Set<string>();
        const map: Record<string, string> = {};
        snap.forEach(d => {
          ids.add(d.data().postId);
          map[d.data().postId] = d.id;
        });
        dispatchInteraction({ type: 'SET_UPVOTES', ids, map });
      } catch (err) {
        console.error('Error fetching upvotes:', err);
      }
    };
    fetchUpvotes();
  }, [user?.uid]);


  useEffect(() => {
    if (!user) return;
    const fetchDownvotes = async () => {
      try {
        const q = query(collection(db, 'post_downvotes'), where('userId', '==', user.uid));
        const snap = await getDocs(q);
        const ids = new Set<string>();
        const map: Record<string, string> = {};
        snap.forEach(d => {
          ids.add(d.data().postId);
          map[d.data().postId] = d.id;
        });
        dispatchInteraction({ type: 'SET_DOWNVOTES', ids, map });
      } catch (err) {
        console.error('Error fetching downvotes:', err);
      }
    };
    fetchDownvotes();
  }, [user?.uid]);

  useEffect(() => {
    if (!user) return;
    const fetchSaves = async () => {
      try {
        const q = query(collection(db, 'saved_posts'), where('userId', '==', user.uid));
        const snap = await getDocs(q);
        const ids = new Set<string>();
        snap.forEach(d => {
          ids.add(d.data().postId);
        });
        dispatchInteraction({ type: 'SET_SAVES', ids });
      } catch (err) {
        console.error('Error fetching saves:', err);
      }
    };
    fetchSaves();
  }, [user?.uid]);

  useEffect(() => {
    if (!user) return;
    const fetchReplyUpvotes = async () => {
      try {
        const q = query(collection(db, 'reply_upvotes'), where('userId', '==', user.uid));
        const snap = await getDocs(q);
        const ids = new Set<string>();
        const map: Record<string, string> = {};
        snap.forEach(d => {
          ids.add(d.data().replyId);
          map[d.data().replyId] = d.id;
        });
        dispatchInteraction({ type: 'SET_REPLY_UPVOTES', ids, map });
      } catch (err) {
        console.error('Error fetching reply upvotes:', err);
      }
    };
    fetchReplyUpvotes();
  }, [user?.uid]);


  useEffect(() => {
    if (!user) return;
    const fetchWishlists = async () => {
      try {
        const q = query(collection(db, 'wishlists'), where('userId', '==', user.uid));
        const snapshot = await getDocs(q);
        const ids = new Set<string>();
        const map: Record<string, string> = {};
        snapshot.forEach((d) => {
          const data = d.data();
          ids.add(data.productId);
          map[data.productId] = d.id;
        });
        setWishlisted(ids);
        setWishlistMap(map);
      } catch (err) {
        console.error('Error fetching wishlists:', err);
      }
    };
    fetchWishlists();
  }, [user?.uid]);

  // ─── Paste to add image/pdf ───────────────────────────────
  useEffect(() => {
    if (!isModalOpen) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const pastedImages: File[] = [];
      const pastedPdfs: File[] = [];
      const pastedVideos: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) pastedImages.push(file);
        } else if (item.type === 'application/pdf') {
          const file = item.getAsFile();
          if (file) pastedPdfs.push(file);
        } else if (item.type.startsWith('video/')) {
          const file = item.getAsFile();
          if (file) pastedVideos.push(file);
        }
      }
      
      if (pastedVideos.length > 0) {
        setVideoFile(pastedVideos[0]);
        setImageFiles([]);
        setPdfFile(null);
      } else {
        if (pastedImages.length > 0) {
          const dt = new DataTransfer();
          pastedImages.forEach(f => dt.items.add(f));
          handleFilesSelected(dt.files);
          setVideoFile(null);
        }
        if (pastedPdfs.length > 0) {
          setPdfFile(pastedPdfs[0]);
          setVideoFile(null);
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isModalOpen]);

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

  // ─── Drag and Drop Flow ───────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      const images = files.filter(f => f.type.startsWith('image/'));
      const pdfs = files.filter(f => f.type === 'application/pdf');
      const videos = files.filter(f => f.type.startsWith('video/'));
      
      if (videos.length > 0) {
        setVideoFile(videos[0]);
        setImageFiles([]);
        setPdfFile(null);
      } else {
        if (images.length > 0) {
          const dt = new DataTransfer();
          images.forEach(f => dt.items.add(f));
          handleFilesSelected(dt.files);
          setVideoFile(null);
        }
        if (pdfs.length > 0) {
          setPdfFile(pdfs[0]);
          setVideoFile(null);
        }
      }
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
      let pdfUrl: string | undefined = undefined;
      let pdfPages: number = 0;
      let videoUrl: string | undefined = undefined;

      // Use pre-uploaded URLs if the background upload already completed.
      // This makes "Post" near-instant after the user sees the upload finish.
      if (videoFile) {
        if (preUploadedVideoUrl) {
          videoUrl = preUploadedVideoUrl;
        } else {
          setSubmittingStatus('Uploading video...');
          setUploadProgress({ pct: 0, loaded: 0, total: videoFile.size });
          videoUrl = await uploadPostVideo(videoFile, (pct, loaded, total) => {
            setUploadProgress({ pct, loaded, total });
          });
          setUploadProgress(null);
        }
      } else if (pdfFile) {
        if (preUploadedPdfData) {
          pdfUrl = preUploadedPdfData.url;
          pdfPages = preUploadedPdfData.pages;
        } else {
          setSubmittingStatus('Uploading PDF...');
          setUploadProgress({ pct: 0, loaded: 0, total: pdfFile.size });
          const pdfResult = await uploadPostPdf(pdfFile, (pct, loaded, total) => {
            setUploadProgress({ pct, loaded, total });
          });
          setUploadProgress(null);
          pdfUrl = pdfResult.url;
          pdfPages = pdfResult.pages;
        }
      } else if (imageFiles.length > 0) {
        if (preUploadedImageUrls.length === imageFiles.length) {
          imageUrls = preUploadedImageUrls;
        } else {
          setSubmittingStatus('Uploading images...');
          const totalSize = imageFiles.reduce((sum, f) => sum + f.size, 0);
          let uploadedSize = 0;
          imageUrls = await Promise.all(
            imageFiles.map(async (file) => {
              setUploadProgress({ pct: Math.round((uploadedSize / totalSize) * 100), loaded: uploadedSize, total: totalSize });
              const url = await uploadPostImage(file, (pct, loaded) => {
                const baseLoaded = uploadedSize;
                setUploadProgress({ pct: Math.round((baseLoaded + loaded) / totalSize * 100), loaded: baseLoaded + loaded, total: totalSize });
              });
              uploadedSize += file.size;
              return url;
            })
          );
          setUploadProgress(null);
        }
      }


      const isTextClean = isTextSafe(title) && isTextSafe(content);
      let areImagesSafe = true;
      let isImageModerationUnavailable = false;

      if (imageUrls.length > 0 && isTextClean) {
        // Only run NSFW scan if text is already clean (otherwise post goes to pending anyway)
        setSubmittingStatus('Scanning images for safety...');
        const moderationResult = await checkAllImagesSafety(imageFiles);
        areImagesSafe = moderationResult.isSafe;
        isImageModerationUnavailable = !!moderationResult.isUnavailable;
        if (!areImagesSafe) {
          console.log('[Feed] Image flagged:', moderationResult.reason);
        }
      }

      const shouldAutoApprove = isTextClean && areImagesSafe && !isImageModerationUnavailable;
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
        ...(pdfUrl ? { pdfUrl, pdfPages } : {}),
        ...(videoUrl ? { videoUrl } : {}),
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
              type: 'new_post', 
              title: 'New Post', 
              message: title?.trim() ? `${authorName} just posted: "${title}"` : `${authorName} just shared a new post`, 
              link: `/post/${postDocRef.id}`,
              postId: postDocRef.id
            });
          });
        }
      } else {
        if (!isTextClean) {
          showToast('Post flagged for containing sensitive words. Submitted for review.', 'warning');
        } else if (isImageModerationUnavailable) {
          showToast('Image verification is temporarily offline. Post submitted for manual admin review.', 'warning');
        } else if (!areImagesSafe) {
          showToast('Image flagged by safety check. Submitted for manual review.', 'warning');
        } else {
          showToast('Post submitted for approval!', 'success');
        }
      }

      setIsModalOpen(false);
      setImageFiles([]);
      setPdfFile(null);
      setVideoFile(null);
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
      setUploadProgress(null);
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
    dispatchInteraction({ type: 'SET_MEMBER', key: 'upvotedPostIds', id: post.id, present: !isUpvoted });

    if (!isUpvoted && isDownvoted) {
      dispatchInteraction({ type: 'SET_MEMBER', key: 'downvotedPostIds', id: post.id, present: false });
    }

    setRawPosts(prev => prev.map(p => {
      if (p.id === post.id) {
        return {
          ...p,
          upvotesCount: isUpvoted ? Math.max(0, (p.upvotesCount || 0) - 1) : (p.upvotesCount || 0) + 1,
          downvotesCount: (!isUpvoted && isDownvoted) ? Math.max(0, (p.downvotesCount || 0) - 1) : (p.downvotesCount || 0)
        };
      }
      return p;
    }));

    if (selectedPost?.id === post.id) {
      setSelectedPost(prev => prev ? {
        ...prev,
        upvotesCount: isUpvoted ? Math.max(0, (prev.upvotesCount || 0) - 1) : (prev.upvotesCount || 0) + 1,
        downvotesCount: (!isUpvoted && isDownvoted) ? Math.max(0, (prev.downvotesCount || 0) - 1) : (prev.downvotesCount || 0)
      } : null);
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
      dispatchInteraction({ type: 'SET_MEMBER', key: 'upvotedPostIds', id: post.id, present: isUpvoted });
      if (!isUpvoted && isDownvoted) {
        dispatchInteraction({ type: 'SET_MEMBER', key: 'downvotedPostIds', id: post.id, present: true });
      }
      setRawPosts(prev => prev.map(p => 
        p.id === post.id ? { ...p, upvotesCount: post.upvotesCount, downvotesCount: post.downvotesCount } : p
      ));
      if (selectedPost?.id === post.id) {
        setSelectedPost(prev => prev ? { ...prev, upvotesCount: post.upvotesCount, downvotesCount: post.downvotesCount } : null);
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
    dispatchInteraction({ type: 'SET_MEMBER', key: 'downvotedPostIds', id: post.id, present: !isDownvoted });

    if (!isDownvoted && isUpvoted) {
      dispatchInteraction({ type: 'SET_MEMBER', key: 'upvotedPostIds', id: post.id, present: false });
    }

    setRawPosts(prev => prev.map(p => {
      if (p.id === post.id) {
        return {
          ...p,
          downvotesCount: isDownvoted ? Math.max(0, (p.downvotesCount || 0) - 1) : (p.downvotesCount || 0) + 1,
          upvotesCount: (!isDownvoted && isUpvoted) ? Math.max(0, (p.upvotesCount || 0) - 1) : (p.upvotesCount || 0)
        };
      }
      return p;
    }));

    if (selectedPost?.id === post.id) {
      setSelectedPost(prev => prev ? {
        ...prev,
        downvotesCount: isDownvoted ? Math.max(0, (prev.downvotesCount || 0) - 1) : (prev.downvotesCount || 0) + 1,
        upvotesCount: (!isDownvoted && isUpvoted) ? Math.max(0, (prev.upvotesCount || 0) - 1) : (prev.upvotesCount || 0)
      } : null);
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
      dispatchInteraction({ type: 'SET_MEMBER', key: 'downvotedPostIds', id: post.id, present: isDownvoted });
      if (!isDownvoted && isUpvoted) {
        dispatchInteraction({ type: 'SET_MEMBER', key: 'upvotedPostIds', id: post.id, present: true });
      }
      setRawPosts(prev => prev.map(p => 
        p.id === post.id ? { ...p, upvotesCount: post.upvotesCount, downvotesCount: post.downvotesCount } : p
      ));
      if (selectedPost?.id === post.id) {
        setSelectedPost(prev => prev ? { ...prev, upvotesCount: post.upvotesCount, downvotesCount: post.downvotesCount } : null);
      }
      handleFirestoreError(e, OperationType.UPDATE, 'posts');
    }
  };

  // Receives the full reply object (the modal owns the replies array now) so we
  // no longer need a local copy of replies to look up the upvote count.
  const handleUpvoteReply = async (reply: any) => {
    if (!user) {
      window.location.href = '/login';
      return;
    }
    if (!userData?.verified) {
      showToast('You must be verified to like.', 'error');
      return;
    }
    const replyId = reply.id;
    const isUpvoted = replyUpvotedIds.has(replyId);

    // Optimistic UI update
    dispatchInteraction({ type: 'SET_MEMBER', key: 'replyUpvotedIds', id: replyId, present: !isUpvoted });

    try {
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
      dispatchInteraction({ type: 'SET_MEMBER', key: 'replyUpvotedIds', id: replyId, present: isUpvoted });
      handleFirestoreError(e, OperationType.UPDATE, 'post_replies');
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

  const handleDeletePost = (postId: string) => {
    askConfirm(
      'Delete this post?',
      'This will also delete all comments and likes. This action cannot be undone.',
      async () => {
        setConfirmDialog(null);
        try {
          await deletePostCascade(postId);

          showToast('Post deleted successfully', 'success');
          setSelectedPost(null);
        } catch (e) {
          handleFirestoreError(e, OperationType.DELETE, 'posts');
        }
      }
    );
  };

  const handleDeleteReply = (replyId: string) => {
    askConfirm(
      'Delete this reply?',
      'This action cannot be undone.',
      async () => {
        setConfirmDialog(null);
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
      }
    );
  };

  const handleEditReply = async (replyId: string, newContent: string) => {
    try {
      await updateDoc(doc(db, 'post_replies', replyId), {
        content: newContent,
        edited: true,
        updatedAt: serverTimestamp()
      });
      showToast('Comment updated', 'success');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'post_replies');
    }
  };

  // ─── Filtering (block system) ────────────────────────────

  let filteredPosts = posts.filter(p => {
    if (blockedIds.has(p.authorId) || blockedByIds.has(p.authorId)) return false;
    if (p.privacy === 'private' && p.authorId !== user?.uid && !friendIds.has(p.authorId)) return false;
    return true;
  });
  let filteredProducts = products.filter(p => !blockedIds.has(p.sellerId) && !blockedByIds.has(p.sellerId));

  if (!user) {
    filteredPosts = filteredPosts.slice(0, 5);
    filteredProducts = filteredProducts.slice(0, 5);
  }

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
      const timeA = timestampMillis(a.createdAt);
      const timeB = timestampMillis(b.createdAt);
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

  // ─── Feed virtualization (window scroll) ─────────────────
  // Only visible rows + overscan are kept in the DOM. The feed scrolls with
  // the window (sticky header above), so we use the window virtualizer and
  // pass the list's document offset as scrollMargin.
  const feedListRef = useRef<HTMLDivElement>(null);
  const [feedListOffset, setFeedListOffset] = useState(0);

  useLayoutEffect(() => {
    const measureOffset = () => {
      if (feedListRef.current) {
        const rect = feedListRef.current.getBoundingClientRect();
        setFeedListOffset(rect.top + window.scrollY);
      }
    };
    measureOffset();
    window.addEventListener('resize', measureOffset);
    return () => window.removeEventListener('resize', measureOffset);
  }, [loading, user, userData?.verified]);

  const feedVirtualizer = useWindowVirtualizer({
    count: combinedFeed.length,
    estimateSize: () => 450,
    overscan: 5,
    scrollMargin: feedListOffset,
  });

  // Renders a single feed row (post or product card), injecting the "Clubs for
  // you" row after the 3rd item just like the original non-virtualized list.
  const renderFeedItem = (item: any, index: number) => {
    const isProduct = item._kind === 'product';
    const card = isProduct ? (
      <ProductCard
        product={item as Product}
        isWishlisted={wishlisted.has(item.id)}
        wishlistDocId={wishlistMap[item.id]}
        onShare={handleShareProduct}
      />
    ) : (
      <PostCard
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
        <>
          {card}
          <HorizontalDiscoverClubs />
        </>
      );
    }
    return card;
  };

  return (
    <div className="pb-20 w-full overflow-x-hidden">
      <SEO 
        title="Home" 
        description="Discover school info, notes, and interschool events on Nextbench Community." 
      />

      {/* Unauthenticated Banner */}
      {!user && (
        <div className="bg-luxury-ink text-surface-base px-4 py-3 text-center text-sm font-semibold flex items-center justify-center gap-3 relative z-40 flex-wrap">
          <span>Sign up to join the conversation, create posts, and get the full experience!</span>
          <Link to="/signup" className="bg-brand-teal text-white px-4 py-1.5 rounded-full hover:bg-brand-teal/90 transition-colors text-xs uppercase tracking-widest font-bold shrink-0">
            Sign Up
          </Link>
        </div>
      )}

      {/* Sticky Header Tabs */}
      <div className="sticky top-0 z-40 nav-glass border-b flex items-center px-2 sm:px-4 gap-0.5" style={{ borderColor: 'var(--color-border)' }}>
        {([
          { id: 'all', label: 'For you' },
          { id: 'posts', label: 'Posts' },
          { id: 'marketplace', label: 'Marketplace' },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setContentType(tab.id); }}
            className={`relative py-4 px-3 sm:px-4 text-sm font-semibold transition-colors whitespace-nowrap rounded-t-lg ${contentType === tab.id ? 'text-luxury-ink' : 'text-luxury-ink/40 hover:text-luxury-ink/70 hover:bg-surface-soft/50'}`}
          >
            {tab.label}
            {contentType === tab.id && (
              <motion.div
                layoutId="feed-tab-underline"
                className="absolute -bottom-px left-2 right-2 sm:left-3 sm:right-3 h-[3px] rounded-full bg-brand-pink"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Stories row */}
      <Stories />

      {/* Compose Bar */}
      {user && userData?.verified && (
        <div className="border-b px-4 py-3 flex items-center gap-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-card)' }}>
          <div className="w-9 h-9 rounded-full bg-surface-soft flex items-center justify-center overflow-hidden shrink-0 ring-1 ring-inset ring-luxury-ink/[0.06]">
            {userData?.profilePicture ? (
              <img src={getOptimizedImageUrl(userData.profilePicture)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />

            ) : (
              <span className="text-brand-teal font-semibold text-sm">{(userData?.name || 'U')[0].toUpperCase()}</span>
            )}
          </div>
          <button
            onClick={() => { setIsModalOpen(true); preloadModerationModel(); }}
            className="flex-1 flex items-center justify-between gap-2 text-left pl-4 pr-3 py-2.5 rounded-full border text-sm text-luxury-ink/40 hover:bg-surface-soft hover:border-luxury-ink/15 transition-colors"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <span>What's on your mind?</span>
            <Pencil size={15} strokeWidth={2} className="shrink-0 text-luxury-ink/30" />
          </button>
        </div>
      )}

      {/* Floating Action Button for Mobile */}
      {user && userData?.verified && (
        <button
          onClick={() => { setIsModalOpen(true); preloadModerationModel(); }}
          aria-label="Create post"
          className="fixed bottom-24 right-4 sm:hidden z-50 flex items-center justify-center w-14 h-14 bg-brand-teal text-white rounded-full shadow-lg shadow-brand-teal/30 hover:scale-105 active:scale-95 transition-transform"
        >
          <Plus size={24} strokeWidth={2} />
        </button>
      )}

      {/* Feed */}
      {loading ? (
        <div className="flex flex-col w-full min-w-0">
          {Array.from({ length: 5 }).map((_, i) => <PostCardSkeleton key={i} />)}
        </div>
      ) : (
        <>
          <div ref={feedListRef} className="flex flex-col w-full min-w-0">
            {/* Virtualized feed — only visible rows + 5 overscan are in the DOM */}
            {combinedFeed.length > 0 && (
              <div style={{ height: `${feedVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                {feedVirtualizer.getVirtualItems().map((virtualRow) => (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={feedVirtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start - feedVirtualizer.options.scrollMargin}px)`,
                    }}
                  >
                    {renderFeedItem(combinedFeed[virtualRow.index], virtualRow.index)}
                  </div>
                ))}
              </div>
            )}

            {/* Infinite scroll sentinel — triggers Firestore pagination */}
            {(hasMorePosts || hasMoreProducts) && (
              <InfiniteScrollSentinel onVisible={loadMoreFeed} />
            )}

            {/* Loading more spinner */}
            {isLoadingMore && (
              <div className="flex justify-center py-6">
                <div className="w-6 h-6 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {!user && combinedFeed.length > 0 && !hasMorePosts && !hasMoreProducts && (
            <div className="py-12 px-6 flex flex-col items-center justify-center text-center border-t mt-4 relative z-10" style={{ borderColor: 'var(--color-border)' }}>
              <Lock className="w-12 h-12 text-luxury-ink/20 mb-4" strokeWidth={1.75} />
              <h3 className="text-xl font-bold text-luxury-ink mb-2">You've reached the end of your preview</h3>
              <p className="text-luxury-ink/50 text-sm max-w-sm mb-6">
                Sign up for free to unlock unlimited posts, full marketplace access, and join the community.
              </p>
              <Link to="/signup" className="bg-brand-teal text-white px-8 py-3 rounded-xl font-bold hover:bg-brand-teal/90 transition-all hover:scale-105 shadow-xl shadow-brand-teal/20">
                Register Now
              </Link>
            </div>
          )}

          {!loading && combinedFeed.length === 0 && (
            <div className="py-20 text-center px-4">
              <GraduationCap className="mx-auto text-luxury-ink/10 mb-4" size={48} strokeWidth={1.5} />
              <p className="text-luxury-ink/50 text-base mb-1">
                {contentType === 'marketplace' ? 'No items listed yet.' : 'No posts yet.'}
              </p>
              <p className="text-sm text-luxury-ink/40">
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
            onDownvote={handleDownvote}
            hasDownvoted={downvotedPostIds.has(selectedPost.id)}
            onShare={handleShare}
            onDelete={handleDeletePost}
            onDeleteReply={handleDeleteReply}
            onEditReply={handleEditReply}
            onUpvoteReply={handleUpvoteReply}
            replyUpvotedIds={replyUpvotedIds}
            isAdmin={userData?.role === 'admin'}
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
              const closeModal = () => {
                setIsModalOpen(false);
                setImageFiles([]);
                setPdfFile(null);
                setPendingFiles([]);
              };
              if (title.trim() || content.trim() || imageFiles.length > 0 || pdfFile) {
                askConfirm('Discard this post?', 'Your draft will be lost.', () => {
                  setConfirmDialog(null);
                  closeModal();
                });
              } else {
                closeModal();
              }
            }}
            className="fixed inset-0 z-100 flex items-center justify-center p-0 sm:p-4 bg-luxury-ink/20 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`bg-surface-card w-full h-full sm:h-auto sm:rounded-3xl sm:max-w-2xl relative shadow-2xl overflow-hidden sm:max-h-[90vh] flex flex-col transition-colors ${isDragging ? 'border-2 border-brand-teal bg-surface-soft/50' : ''}`}
            >
              {isDragging && (
                <div className="absolute inset-0 z-50 bg-brand-teal/10 backdrop-blur-sm border-2 border-dashed border-brand-teal rounded-3xl flex items-center justify-center pointer-events-none">
                  <div className="bg-surface-card px-6 py-4 rounded-2xl shadow-xl flex items-center gap-3">
                    <Paperclip size={24} className="text-brand-teal" />
                    <span className="font-bold text-luxury-ink">Drop media to attach</span>
                  </div>
                </div>
              )}
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
                  const closeModal = () => {
                    setIsModalOpen(false);
                    setImageFiles([]);
                    setPdfFile(null);
                    setPendingFiles([]);
                  };
                  if (title.trim() || content.trim() || imageFiles.length > 0 || pdfFile) {
                    askConfirm('Discard this post?', 'Your draft will be lost.', () => {
                      setConfirmDialog(null);
                      closeModal();
                    });
                  } else {
                    closeModal();
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
                    className="absolute inset-0 z-50 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center px-8"
                  >
                    {uploadProgress ? (
                      /* Progress bar mode — shown during file uploads */
                      <div className="w-full max-w-xs flex flex-col items-center gap-3">
                        <p className="text-white font-bold text-lg">{submittingStatus}</p>

                        {/* Track + filled bar */}
                        <div className="w-full h-2 rounded-full bg-white/20 overflow-hidden">
                          <motion.div
                            className="h-full rounded-full bg-brand-teal"
                            initial={{ width: 0 }}
                            animate={{ width: `${uploadProgress.pct}%` }}
                            transition={{ ease: 'linear', duration: 0.1 }}
                          />
                        </div>

                        {/* Bytes done / left */}
                        <div className="flex w-full justify-between text-[12px] text-white/50 font-medium">
                          <span>{formatBytes(uploadProgress.loaded)} done</span>
                          <span className="font-bold text-brand-teal">{uploadProgress.pct}%</span>
                          <span>{formatBytes(uploadProgress.total - uploadProgress.loaded)} left</span>
                        </div>
                      </div>
                    ) : (
                      /* Spinner mode — shown for non-upload steps */
                      <>
                        <div className="w-12 h-12 border-4 border-brand-teal border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="text-white font-bold text-lg">{submittingStatus}</p>
                        <p className="text-white/50 text-sm mt-1">
                          {submittingStatus === 'Scanning images for safety...'
                            ? 'AI is checking your images — this only takes a moment'
                            : 'Uploading media and publishing to community'}
                        </p>
                      </>
                    )}
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
                        <img src={getOptimizedImageUrl(userData.profilePicture)} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />

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
                      required={imageFiles.length === 0 && !pdfFile && !videoFile}
                      placeholder={imageFiles.length > 0 ? 'Title (optional)' : 'Title'}
                      className="w-full bg-transparent text-3xl font-bold text-luxury-ink placeholder-luxury-ink/30 focus:outline-none"
                    />

                    <textarea
                      name="content"
                      required={imageFiles.length === 0 && !pdfFile && !videoFile}
                      placeholder={imageFiles.length > 0 ? 'Caption (optional)...' : "What's on your mind?"}
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

                    {/* PDF Preview */}
                    {pdfFile && (
                      <div className="mt-4 flex items-center gap-3 p-3 rounded-xl border border-luxury-ink/10 bg-surface-soft shrink-0">
                        <FileText size={24} className="text-brand-teal" />
                        <span className="flex-1 text-sm font-medium text-luxury-ink truncate">{pdfFile.name}</span>
                        <button type="button" onClick={() => setPdfFile(null)} className="p-1 rounded-full text-luxury-ink/40 hover:text-red-500 hover:bg-red-50">
                          <X size={16} />
                        </button>
                      </div>
                    )}

                    {/* Video Preview */}
                    {videoFile && (
                      <div className="mt-4 flex items-center gap-3 p-3 rounded-xl border border-luxury-ink/10 bg-surface-soft shrink-0">
                        <Film size={24} className="text-brand-teal" />
                        <span className="flex-1 text-sm font-medium text-luxury-ink truncate">{videoFile.name}</span>
                        <button type="button" onClick={() => setVideoFile(null)} className="p-1 rounded-full text-luxury-ink/40 hover:text-red-500 hover:bg-red-50">
                          <X size={16} />
                        </button>
                      </div>
                    )}

                    {/* Image Previews */}
                    {imageFiles.length > 0 && (
                      <div className="mt-4 flex gap-2 overflow-x-auto pb-2 no-scrollbar shrink-0">
                        {imageFiles.map((file, index) => (
                          <div key={index} className="relative group shrink-0">
                            <div className="w-24 h-24 rounded-xl overflow-hidden border border-luxury-ink/10">
                              <img src={imageFilePreviewUrls[index]} alt="Preview" className="w-full h-full object-cover" />

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
                        <Paperclip size={22} />
                        <input
                          type="file"
                          accept="image/*,application/pdf,video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska,video/x-m4v,video/3gpp,video/3gpp2,video/ogg,video/x-flv,video/x-ms-wmv,video/*"
                          multiple
                          onChange={(e) => {
                            if (!e.target.files) return;
                            const files = Array.from(e.target.files);
                            const images = files.filter(f => f.type.startsWith('image/'));
                            const pdfs = files.filter(f => f.type === 'application/pdf');
                            const videos = files.filter(f => f.type.startsWith('video/'));
                            
                            if (videos.length > 0) {
                              setVideoFile(videos[0]);
                              setImageFiles([]);
                              setPdfFile(null);
                            } else {
                              if (images.length > 0) {
                                const dt = new DataTransfer();
                                images.forEach(f => dt.items.add(f));
                                handleFilesSelected(dt.files);
                                setVideoFile(null);
                              }
                              if (pdfs.length > 0) {
                                setPdfFile(pdfs[0]);
                                setVideoFile(null);
                              }
                            }
                          }}
                          className="hidden"
                        />
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-gray-100 text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">Add Media</span>
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

                      {/* Inline upload progress bar — visible while background upload is in progress */}
                      {isPreUploading && uploadProgress && (
                        <div className="flex-1 flex flex-col gap-1 mr-2">
                          <div className="flex items-center justify-between text-[11px] font-medium">
                            <span className="text-luxury-ink/50">{preUploadLabel}</span>
                            <span className="text-brand-teal font-bold">{uploadProgress.pct}%</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-luxury-ink/10 overflow-hidden">
                            <motion.div
                              className="h-full rounded-full bg-brand-teal"
                              initial={{ width: 0 }}
                              animate={{ width: `${uploadProgress.pct}%` }}
                              transition={{ ease: 'linear', duration: 0.1 }}
                            />
                          </div>
                        </div>
                      )}

                      {/* "Ready to post" badge once upload finishes */}
                      {!isPreUploading && (preUploadedVideoUrl || preUploadedPdfData || preUploadedImageUrls.length > 0) && (
                        <span className="text-[11px] font-semibold text-brand-teal flex items-center gap-1 mr-2">
                          ✓ Upload done — ready to post!
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          const form = document.getElementById('create-post-form') as HTMLFormElement;
                          const titleNode = form?.elements.namedItem('title') as HTMLInputElement;
                          const contentNode = form?.elements.namedItem('content') as HTMLTextAreaElement;
                          const title = titleNode?.value || '';
                          const content = contentNode?.value || '';
                          const closeModal = () => {
                            setIsModalOpen(false);
                            setImageFiles([]);
                            setPdfFile(null);
                            setPendingFiles([]);
                          };
                          if (title.trim() || content.trim() || imageFiles.length > 0 || pdfFile) {
                            askConfirm('Discard this post?', 'Your draft will be lost.', () => {
                              setConfirmDialog(null);
                              closeModal();
                            });
                          } else {
                            closeModal();
                          }
                        }}
                        className="px-4 py-2 text-[14px] font-semibold text-luxury-ink/50 hover:text-luxury-ink transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting || isPreUploading}
                        className="bg-luxury-ink hover:bg-black text-surface-base px-6 py-2 rounded-full text-[14px] font-semibold shadow-sm transition-all disabled:opacity-50"
                      >
                        {isSubmitting ? 'Posting...' : isPreUploading ? 'Uploading...' : 'Post'}
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
        <Suspense fallback={<LazyFallback />}>
          <ImageCropper
            imageSrc={cropImageSrc}
            onCropComplete={handleCropComplete}
            onCancel={handleCropCancel}
            aspect={1}
          />
        </Suspense>
      )}

      {/* ─── Share Modal ──────────────────────────────── */}
      <ShareModal
        isOpen={shareModalData.isOpen}
        onClose={() => setShareModalData(prev => ({...prev, isOpen: false}))}
        postUrl={shareModalData.url}
        postTitle={shareModalData.title}
        sharedPost={shareModalData.sharedPost}
      />

      {/* ─── Confirm Dialog (custom, replaces window.confirm) ──── */}
      <ConfirmDialog
        isOpen={!!confirmDialog}
        title={confirmDialog?.title || ''}
        message={confirmDialog?.message || ''}
        onConfirm={() => confirmDialog?.onConfirm()}
        onCancel={() => setConfirmDialog(null)}
      />

    </div>
  );
}

// Memoized: rendered inline in the feed; takes no props so it stays stable
// across the frequent parent re-renders and only updates on its own hook state.
const HorizontalDiscoverClubs = React.memo(function HorizontalDiscoverClubs() {
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
                <img src={getOptimizedImageUrl(club.avatar)} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" referrerPolicy="no-referrer" loading="lazy" />

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
});
