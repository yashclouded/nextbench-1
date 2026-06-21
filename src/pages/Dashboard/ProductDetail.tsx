import { useParams, Link, useNavigate } from 'react-router-dom';
import SEO from '../../components/seo/SEO';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, ChevronLeft, ChevronRight, Star, MessageSquare, Heart, Share2, X, Send, MapPin } from 'lucide-react';
import { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs, addDoc, onSnapshot, deleteDoc, arrayUnion } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import LinkifiedText from '../../components/ui/LinkifiedText';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { createNotification } from '../../lib/notifications';
import { getOptimizedImageUrl } from '../../lib/utils';
import { useScrollLock } from '../../hooks/useScrollLock';
import ShareModal from '../../components/ui/ShareModal';

interface ProductData {
  id: string;
  title: string;
  price: number;
  category: string;
  condition: string;
  image: string;
  images?: string[];
  description: string;
  meetupAvailable: boolean;
  deliveryAvailable: boolean;
  status: string;
  sellerId: string;
  sellerName: string;
  sellerSchool: string;
  reservedById?: string;
  tags?: string[];      
  city?: string;        
}

interface Review {
  id: string;
  reviewerId: string;
  reviewerName: string;
  rating: number;
  comment: string;
  createdAt: any;
}

export default function ProductDetail() {
  const { id } = useParams();
  const { user, userData } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [product, setProduct] = useState<ProductData | null>(null);
  const [activeImgIdx, setActiveImgIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isReserving, setIsReserving] = useState(false);
  const [isStartingChat, setIsStartingChat] = useState(false);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [wishlistDocId, setWishlistDocId] = useState<string | null>(null);
  const [shareModalData, setShareModalData] = useState<{isOpen: boolean, url: string, title: string, sharedPost?: any}>({isOpen: false, url: '', title: ''});

  // Reviews
  const [reviews, setReviews] = useState<Review[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  useScrollLock(showReviewModal);

  useEffect(() => {
    const fetchProduct = async () => {
      if (!id) return;
      try {
        const docSnap = await getDoc(doc(db, 'products', id));
        if (docSnap.exists()) {
          setProduct({ id: docSnap.id, ...docSnap.data() } as ProductData);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `products/${id}`);
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [id]);

  // Load reviews
  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, 'reviews'), where('productId', '==', id));
    const unsub = onSnapshot(q, (snap) => {
      const r: Review[] = [];
      snap.forEach(d => r.push({ id: d.id, ...d.data() } as Review));
      setReviews(r.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    });
    return () => unsub();
  }, [id]);

  // Check wishlist status
  useEffect(() => {
    if (!user || !id) return;
    const q = query(collection(db, 'wishlists'), where('userId', '==', user.uid), where('productId', '==', id));
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        setIsWishlisted(true);
        setWishlistDocId(snap.docs[0].id);
      } else {
        setIsWishlisted(false);
        setWishlistDocId(null);
      }
    });
    return () => unsub();
  }, [user?.uid, id]);

  const toggleWishlist = async () => {
    if (!user) { showToast('Please log in', 'warning'); return; }
    if (!id) return;
    try {
      if (isWishlisted && wishlistDocId) {
        await deleteDoc(doc(db, 'wishlists', wishlistDocId));
        showToast('Removed from wishlist', 'info');
      } else {
        await addDoc(collection(db, 'wishlists'), { userId: user.uid, productId: id, createdAt: serverTimestamp() });
        showToast('Added to wishlist ♥', 'success');
      }
    } catch { showToast('Failed to update wishlist', 'error'); }
  };

  const handleShare = () => {
    if (!product) return;
    setShareModalData({
      isOpen: true,
      url: window.location.href,
      title: product.title,
      sharedPost: {
        id: product.id,
        title: product.title,
        description: product.description || '',
        image: product.image || undefined,
        authorName: product.sellerName || 'Unknown User'
      }
    });
  };

  const handleContactSeller = async () => {
    if (!user || !userData) { showToast('Please log in to contact the seller.', 'warning'); return; }
    if (!userData || !userData.verified) { showToast('Only verified students can message sellers.', 'warning'); return; }
    if (!product || !id) return;
    if (product.sellerId === user.uid) { showToast('This is your listing.', 'info'); return; }
    setIsStartingChat(true);
    try {
      // 1. Check for any existing DM room between these two users (type: 'dm')
      const dmQuery = query(
        collection(db, 'chatRooms'),
        where('participants', 'array-contains', user.uid),
        where('type', '==', 'dm')
      );
      const dmSnapshot = await getDocs(dmQuery);
      const existingDMRoom = dmSnapshot.docs.find(d => d.data().participants.includes(product.sellerId));

      // 2. Also check for a product-specific room for this listing
      const productQuery = query(
        collection(db, 'chatRooms'),
        where('participants', 'array-contains', user.uid),
        where('productId', '==', id)
      );
      const productSnapshot = await getDocs(productQuery);

      let roomId = '';

      if (existingDMRoom) {
        // Existing DM — send an interest message into it instead of making a new chat
        roomId = existingDMRoom.id;
        const interestMessage = `Hey! I'm interested in your listing: "${product.title}" (₹${product.price})`;
        await addDoc(collection(db, 'chatRooms', roomId, 'messages'), {
          senderId: user.uid,
          text: interestMessage,
          createdAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'chatRooms', roomId), {
          lastMessage: interestMessage,
          lastSenderId: user.uid,
          unreadBy: arrayUnion(product.sellerId),
          updatedAt: serverTimestamp(),
        });
        createNotification({ userId: product.sellerId, type: 'new_message', title: 'New inquiry', message: interestMessage, link: `/messages/${roomId}` });
        showToast('Message sent in your existing chat!', 'success');
      } else if (!productSnapshot.empty) {
        // Already have a product-specific room for this listing — just navigate there
        roomId = productSnapshot.docs[0].id;
      } else {
        // No existing chat at all — create a new product-specific room
        const inquiryMessage = `${userData.name} wants to chat about "${product.title}"`;
        const newRoom = await addDoc(collection(db, 'chatRooms'), {
          participants: [user.uid, product.sellerId],
          type: 'dm',
          productId: id,
          productTitle: product.title,
          lastMessage: inquiryMessage,
          lastSenderId: user.uid,
          unreadBy: [product.sellerId],
          updatedAt: serverTimestamp(),
        });
        roomId = newRoom.id;
        createNotification({ userId: product.sellerId, type: 'new_message', title: 'New inquiry', message: inquiryMessage, link: `/messages/${roomId}` });
      }

      navigate(`/messages/${roomId}`, { state: { otherUser: { id: product.sellerId, name: product.sellerName, school: product.sellerSchool } } });
    } catch (err) { handleFirestoreError(err, OperationType.WRITE, 'chatRooms'); }
    finally { setIsStartingChat(false); }
  };

  const handleReserve = async () => {
    if (!user || !userData) { showToast('Please log in to reserve items.', 'warning'); return; }
    if (!userData || !userData.verified) { showToast('Only verified students can reserve items.', 'warning'); return; }
    if (!product || !id || product.sellerId === user.uid) return;
    setIsReserving(true);
    try {
      await updateDoc(doc(db, 'products', id), { status: 'reserved', reservedById: user.uid, updatedAt: serverTimestamp() });
      setProduct(prev => prev ? { ...prev, status: 'reserved', reservedById: user.uid } : null);
      showToast('Item reserved! Contact the seller to arrange meetup.', 'success');
      createNotification({ userId: product.sellerId, type: 'item_reserved', title: 'Item Reserved', message: `${userData.name} reserved "${product.title}"`, link: `/product/${id}` });
    } catch (err) { handleFirestoreError(err, OperationType.UPDATE, `products/${id}`); }
    finally { setIsReserving(false); }
  };

  const handleMarkSold = async () => {
    if (!user || !product || !id) return;
    if (product.sellerId !== user.uid) return;
    try {
      await updateDoc(doc(db, 'products', id), { status: 'sold', updatedAt: serverTimestamp() });
      setProduct(prev => prev ? { ...prev, status: 'sold' } : null);
      showToast('Item marked as sold!', 'success');
      if (product.reservedById) {
        createNotification({ userId: product.reservedById, type: 'item_sold', title: 'Transaction Complete', message: `"${product.title}" has been marked as sold. Leave a review!`, link: `/product/${id}` });
      }
    } catch (err) { handleFirestoreError(err, OperationType.UPDATE, `products/${id}`); }
  };

  const handleUnreserve = async () => {
    if (!user || !product || !id) return;
    if (product.sellerId !== user.uid && product.reservedById !== user.uid) return;
    try {
      await updateDoc(doc(db, 'products', id), { status: 'available', reservedById: null, updatedAt: serverTimestamp() });
      setProduct(prev => prev ? { ...prev, status: 'available', reservedById: undefined } : null);
      showToast('Reservation cancelled', 'info');
    } catch (err) { handleFirestoreError(err, OperationType.UPDATE, `products/${id}`); }
  };

  const submitReview = async () => {
    if (!user || !userData || !id) return;
    setSubmittingReview(true);
    try {
      await addDoc(collection(db, 'reviews'), {
        productId: id, sellerId: product?.sellerId, reviewerId: user.uid, reviewerName: userData.name,
        rating: reviewRating, comment: reviewComment, createdAt: serverTimestamp()
      });
      showToast('Review submitted!', 'success');
      setShowReviewModal(false);
      setReviewComment('');
      setReviewRating(5);
      if (product?.sellerId) {
        createNotification({ userId: product.sellerId, type: 'new_review', title: 'New Review', message: `${userData.name} left a ${reviewRating}★ review`, link: `/product/${id}` });
      }
    } catch { showToast('Failed to submit review', 'error'); }
    finally { setSubmittingReview(false); }
  };

  if (loading) return <div className="pt-32 text-center text-xs font-bold uppercase tracking-widest text-brand-teal/40">Loading Item...</div>;
  if (!product) return <div className="pt-32 text-center text-xs font-bold uppercase tracking-widest text-red-400">Product Not Found</div>;

  const isSeller = user?.uid === product.sellerId;
  const isReserved = product.status === 'reserved';
  const isSold = product.status === 'sold';
  const canReserve = !isSeller && product.status === 'available';
  const avgRating = reviews.length > 0 ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) : null;
  const productImages = (product.images && product.images.length > 0 ? product.images : [product.image])
    .map(img => getOptimizedImageUrl(img));

  return (
    <div className="pt-32 pb-20 px-6 max-w-7xl mx-auto">
      <SEO 
        title={`${product.title} - ₹${product.price}`}
        description={product.description.slice(0, 150) + (product.description.length > 150 ? '...' : '')}
        image={getOptimizedImageUrl(product.image)}
      />
      
      <Link to="/dashboard" className="inline-flex items-center gap-2 text-luxury-ink/40 hover:text-luxury-ink transition-colors mb-12 text-sm font-medium">
        <ChevronLeft size={16} /> Back to Marketplace
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
        {/* Left: Image Carousel & Thumbnails */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
          <div className="aspect-square bg-surface-card shadow-[0_40px_100px_-20px_rgba(58,139,149,0.15)] border border-brand-teal/5 p-4 relative rounded-2xl overflow-hidden group">
            {isSold && (
              <div className="absolute inset-0 bg-luxury-ink/40 backdrop-blur-sm z-10 flex items-center justify-center rounded-2xl">
                <span className="bg-surface-card text-luxury-ink px-6 py-3 rounded-full font-bold text-sm uppercase tracking-widest">Sold</span>
              </div>
            )}
            {isReserved && (
              <div className="absolute top-6 right-6 bg-amber-500 text-white px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest z-10 shadow-lg">Reserved</div>
            )}
            
            <div className="w-full h-full relative overflow-hidden rounded-xl bg-luxury-ink/5">
              <motion.div
                className="flex w-full h-full"
                drag={productImages.length > 1 ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.2}
                onDragEnd={(e, { offset }) => {
                  const swipe = offset.x;
                  if (swipe < -50 && activeImgIdx < productImages.length - 1) {
                    setActiveImgIdx(prev => prev + 1);
                  } else if (swipe > 50 && activeImgIdx > 0) {
                    setActiveImgIdx(prev => prev - 1);
                  }
                }}
                animate={{ x: `-${activeImgIdx * 100}%` }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              >
                {productImages.map((img, idx) => (
                  <div key={idx} className="w-full h-full shrink-0">
                    <img 
                      src={img} 
                      alt={`${product.title} - Image ${idx + 1}`}
                      className="w-full h-full object-cover rounded-xl pointer-events-none"
                      referrerPolicy="no-referrer"
                      draggable={false}
                    />
                  </div>
                ))}
              </motion.div>

              {productImages.length > 1 && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveImgIdx((prev) => (prev === 0 ? productImages.length - 1 : prev - 1));
                    }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white/80 hover:bg-surface-card backdrop-blur-sm rounded-full shadow-lg border border-brand-teal/5 hover:scale-110 active:scale-95 text-luxury-ink/60 hover:text-brand-teal transition-all md:opacity-0 md:group-hover:opacity-100 duration-300"
                    aria-label="Previous image"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveImgIdx((prev) => (prev === productImages.length - 1 ? 0 : prev + 1));
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/80 hover:bg-surface-card backdrop-blur-sm rounded-full shadow-lg border border-brand-teal/5 hover:scale-110 active:scale-95 text-luxury-ink/60 hover:text-brand-teal transition-all md:opacity-0 md:group-hover:opacity-100 duration-300"
                    aria-label="Next image"
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Miniature thumbnail strip */}
          {productImages.length > 1 && (
            <div className="flex gap-3 justify-center overflow-x-auto py-2">
              {productImages.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveImgIdx(idx)}
                  className={`relative w-20 aspect-4/3 rounded-xl overflow-hidden border-2 bg-luxury-ink/5 transition-all duration-300 hover:scale-105 ${
                    idx === activeImgIdx
                      ? 'border-brand-teal scale-105 shadow-md shadow-brand-teal/20'
                      : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={img} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </button>
              ))}
            </div>
          )}
        </motion.div>

        {/* Right: Details */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <span className="px-3 py-1 bg-brand-teal/10 rounded-full text-[10px] font-bold uppercase tracking-widest text-brand-teal">{product.condition}</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30">{product.category}</span>
              {avgRating && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-amber-500">
                  <Star size={12} className="fill-amber-500" /> {avgRating} ({reviews.length})
                </span>
              )}
            </div>
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-luxury-ink mb-4 leading-tight">{product.title}</h1>
            {product.tags && product.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {product.tags.map((tag: string) => (
                  <span key={tag} className="px-2.5 py-1 bg-luxury-ink/5 text-brand-teal rounded-lg text-[10px] font-bold uppercase tracking-widest">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
            <p className="text-3xl font-serif font-bold text-brand-pink mb-6 italic">₹{product.price}</p>
            <p className="text-luxury-ink/60 leading-relaxed text-base mb-8 max-w-lg whitespace-pre-wrap">{product.description}</p>

            {/* Action buttons row */}
            <div className="flex items-center gap-3 mb-6">
              <button onClick={toggleWishlist} className={`p-3 rounded-xl border transition-all ${isWishlisted ? 'bg-brand-pink/10 border-brand-pink/20 text-brand-pink' : 'border-luxury-ink/5 text-luxury-ink/30 hover:text-brand-pink'}`}>
                <Heart size={20} className={isWishlisted ? 'fill-brand-pink' : ''} />
              </button>
              <button onClick={handleShare} className="p-3 rounded-xl border border-luxury-ink/5 text-luxury-ink/30 hover:text-brand-teal transition-all">
                <Share2 size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-8">
              <div className="p-4 bg-surface-card border border-brand-teal/5 shadow-sm rounded-xl">
                <div className="text-[9px] uppercase tracking-widest font-bold text-brand-teal/60 mb-1">Meetup</div>
                <div className="text-xs font-bold text-luxury-ink">{product.meetupAvailable ? 'Campus Specified' : 'Unavailable'}</div>
              </div>
              <div className="p-4 bg-surface-card border border-brand-teal/5 shadow-sm rounded-xl">
                <div className="text-[9px] uppercase tracking-widest font-bold text-brand-teal/60 mb-1">Service</div>
                <div className="text-xs font-bold text-luxury-ink">{product.deliveryAvailable ? 'Porter Supported' : 'Meetup Only'}</div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {/* Seller controls */}
              {isSeller && !isSold && (
                <div className="flex flex-col gap-3">
                  {isReserved && (
                    <div className="flex gap-3">
                      <button onClick={handleMarkSold} className="flex-1 py-4 bg-brand-teal text-white text-xs font-bold uppercase tracking-[0.2em] shadow-lg hover:bg-brand-mint transition-all rounded-lg">Mark as Sold</button>
                      <button onClick={handleUnreserve} className="flex-1 py-4 border-2 border-luxury-ink/10 text-luxury-ink/50 text-xs font-bold uppercase tracking-[0.2em] hover:border-red-300 hover:text-red-400 transition-all rounded-lg">Cancel Reservation</button>
                    </div>
                  )}
                  <Link to={`/edit-item/${product.id}`} className="flex-1 py-4 text-center border-2 border-brand-teal text-brand-teal text-xs font-bold uppercase tracking-[0.2em] hover:bg-brand-teal hover:text-white transition-all rounded-lg">Edit Listing</Link>
                </div>
              )}

              {/* Buyer controls */}
              {!isSeller && (
                <>
                  <button onClick={handleReserve} disabled={!canReserve || isReserving}
                    className={`w-full py-4 text-white text-xs font-bold uppercase tracking-[0.2em] shadow-lg transition-all rounded-lg ${isSold ? 'bg-luxury-ink/20 cursor-not-allowed' : isReserved ? 'bg-amber-500 cursor-not-allowed' : 'bg-brand-teal shadow-brand-teal/20 hover:bg-brand-pink'
                      }`}>
                    {isReserving ? 'Reserving...' : isSold ? 'Sold Out' : isReserved ? 'Already Reserved' : 'Reserve Now'}
                  </button>
                  <button onClick={handleContactSeller} disabled={isStartingChat}
                    className="w-full py-4 border-2 border-brand-teal text-brand-teal text-xs font-bold uppercase tracking-[0.2em] hover:bg-brand-teal/5 transition-all disabled:opacity-50 rounded-lg">
                    {isStartingChat ? 'Starting Chat...' : 'Contact Seller'}
                  </button>
                </>
              )}

              {/* Review button — show if sold and user was buyer */}
              {isSold && user && product.reservedById === user.uid && (
                <button onClick={() => setShowReviewModal(true)}
                  className="w-full py-4 bg-amber-500 text-white text-xs font-bold uppercase tracking-[0.2em] hover:bg-amber-600 transition-all rounded-lg flex items-center justify-center gap-2">
                  <Star size={16} /> Leave a Review
                </button>
              )}
            </div>
          </div>

          {/* Seller Card */}
          <div className="mt-auto pt-8 border-t border-luxury-ink/5">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30 mb-4">Listed by Verified Student</h4>
            <Link to={`/profile/${product.sellerId}`} className="flex items-center gap-5 group hover:bg-brand-teal/5 p-3 -ml-3 rounded-2xl transition-colors">
              <div className="w-14 h-14 rounded-full bg-brand-teal/10 flex items-center justify-center text-xl font-serif font-bold text-brand-teal shrink-0">
                {product.sellerName?.[0]?.toUpperCase() || 'U'}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-lg font-bold text-luxury-ink group-hover:text-brand-teal transition-colors">{product.sellerName}</p>
                  <ShieldCheck size={14} className="text-brand-teal"  />
                </div>
                <p className="text-sm text-luxury-ink/50 font-medium flex items-center gap-1 mt-1">
                  {product.sellerSchool} 
                  {product.city && <><span className="text-luxury-ink/30 mx-1">•</span> <MapPin size={12} className="text-brand-teal/70" /> {product.city}</>}
                </p>
              </div>
            </Link>
          </div>
        </motion.div>
      </div>

      {/* Reviews Section */}
      {reviews.length > 0 && (
        <div className="mt-20 pt-12 border-t border-luxury-ink/5">
          <h2 className="text-2xl font-serif font-bold text-luxury-ink mb-8 italic">Reviews <span className="not-italic text-luxury-ink/30 text-lg">({reviews.length})</span></h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {reviews.map(r => (
              <div key={r.id} className="bg-surface-card rounded-2xl p-6 luxury-shadow border border-luxury-ink/5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-brand-teal/10 flex items-center justify-center text-sm font-serif font-bold text-brand-teal">
                    {r.reviewerName?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-luxury-ink text-sm">{r.reviewerName}</p>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map(s => <Star key={s} size={12} className={s <= r.rating ? 'text-amber-500 fill-amber-500' : 'text-luxury-ink/10'} />)}
                    </div>
                  </div>
                </div>
                {r.comment && <LinkifiedText text={r.comment} className="text-luxury-ink/60 text-sm leading-relaxed block" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review Modal */}
      <AnimatePresence>
        {showReviewModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-luxury-ink/20 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-surface-card rounded-2xl w-full max-w-md p-8 relative shadow-2xl border border-luxury-ink/5">
              <button onClick={() => setShowReviewModal(false)} className="absolute top-4 right-4 p-2 text-luxury-ink/40 hover:text-luxury-ink"><X size={20} /></button>
              <h3 className="text-xl font-bold text-luxury-ink mb-2">Rate this Transaction</h3>
              <p className="text-xs font-bold uppercase tracking-widest text-luxury-ink/40 mb-6">How was your experience?</p>
              <div className="flex items-center gap-2 mb-6 justify-center">
                {[1, 2, 3, 4, 5].map(s => (
                  <button key={s} onClick={() => setReviewRating(s)} className="p-1 transition-transform hover:scale-125">
                    <Star size={32} className={s <= reviewRating ? 'text-amber-500 fill-amber-500' : 'text-luxury-ink/10'} />
                  </button>
                ))}
              </div>
              <textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} rows={3} maxLength={500} placeholder="Share your experience (optional)..."
                className="w-full bg-surface-base border border-luxury-ink/5 rounded-xl py-4 px-6 focus:outline-none focus:border-brand-teal text-sm font-medium resize-none mb-4" />
              <button onClick={submitReview} disabled={submittingReview}
                className="w-full py-4 bg-brand-teal text-white text-[11px] font-bold uppercase tracking-[0.2em] shadow-lg hover:bg-brand-pink transition-colors disabled:opacity-50 rounded-xl">
                {submittingReview ? 'Submitting...' : 'Submit Review'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ShareModal
        isOpen={shareModalData.isOpen}
        onClose={() => setShareModalData(prev => ({ ...prev, isOpen: false }))}
        postUrl={shareModalData.url}
        postTitle={shareModalData.title}
        sharedPost={shareModalData.sharedPost}
      />
    </div>
  );
}
