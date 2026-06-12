import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, MapPin, Tag, ChevronLeft, ChevronRight, Share2 } from 'lucide-react';
import { motion } from 'motion/react';
import { getOptimizedImageUrl } from '../../lib/utils';
import { db } from '../../lib/firebase';
import { doc, deleteDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';

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

interface ProductCardProps {
  key?: React.Key;
  product: Product;
  isWishlisted: boolean;
  wishlistDocId?: string;
  onShare?: (product: Product) => void;
}

export default function ProductCard({ product, isWishlisted, wishlistDocId, onShare }: ProductCardProps) {

  const { user, userData } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [imgIndex, setImgIndex] = useState(0);

  const allImages = (product.images && product.images.length > 0)
    ? product.images
    : (product.image ? [product.image] : []);
  const hasMultiple = allImages.length > 1;

  const prevImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setImgIndex(i => (i - 1 + allImages.length) % allImages.length);
  };

  const nextImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setImgIndex(i => (i + 1) % allImages.length);
  };
  const handleShare = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onShare?.(product);
  };
  const toggleWishlist = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      showToast('Please log in to save items', 'warning');
      return;
    }
    if (!userData?.verified) {
      showToast('You must be verified to save items', 'warning');
      return;
    }
    try {
      if (isWishlisted && wishlistDocId) {
        await deleteDoc(doc(db, 'wishlists', wishlistDocId));
        showToast('Removed from wishlist', 'info');
      } else {
        await addDoc(collection(db, 'wishlists'), {
          userId: user.uid,
          productId: product.id,
          createdAt: serverTimestamp(),
        });
        showToast('Added to wishlist ♥', 'success');
      }
    } catch {
      showToast('Failed to update wishlist', 'error');
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="group w-full"
    >
      <Link to={`/product/${product.id}`} className="block">
        <div className={`p-4 transition-all duration-300 relative border-b ${
            product.status === 'sold'
              ? 'opacity-75 pointer-events-none'
              : 'hover:bg-linear-to-br hover:from-brand-teal/5 hover:to-brand-pink/5'
          }`} style={{ borderColor: 'var(--color-border)' }}>

          {/* Subtle Accent Glow */}
          <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-brand-teal/20 to-transparent"></div>

          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/profile/${product.sellerId}`); }}
              className="shrink-0 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-full bg-surface-soft flex items-center justify-center text-brand-teal font-semibold text-sm overflow-hidden">
                {product.sellerProfilePicture ? (
                  <img
                    src={getOptimizedImageUrl(product.sellerProfilePicture)}
                    alt={product.sellerName}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  product.sellerName[0]?.toUpperCase()
                )}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/profile/${product.sellerId}`); }}
                className="text-sm font-semibold text-luxury-ink hover:underline transition-colors truncate block cursor-pointer"
              >
                {product.sellerName}
              </div>
              <p className="text-[11px] text-luxury-ink/30 truncate">{product.sellerSchool}</p>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-luxury-ink">₹{product.price}</div>
              <span className="inline-flex items-center px-2 py-0.5 bg-brand-teal/8 text-brand-teal rounded-full text-[10px] font-semibold">
                Marketplace
              </span>
            </div>
          </div>

          <h3 className="text-[15px] font-semibold text-luxury-ink mb-3 truncate">{product.title}</h3>

          {/* Image Slider */}
          <div
            className="aspect-4/3 overflow-hidden relative mb-4 rounded-xl group/carousel"
            style={{ background: 'linear-gradient(135deg, var(--color-surface-soft) 0%, rgba(var(--color-brand-teal-rgb), 0.05) 100%)' }}
          >
            <motion.div
              className="flex w-full h-full"
              drag={hasMultiple ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              onDragEnd={(e, { offset }) => {
                const swipe = offset.x;
                if (swipe < -50 && imgIndex < allImages.length - 1) {
                  setImgIndex(prev => prev + 1);
                } else if (swipe > 50 && imgIndex > 0) {
                  setImgIndex(prev => prev - 1);
                }
              }}
              animate={{ x: `-${imgIndex * 100}%` }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              {allImages.map((url, idx) => (
                <div key={idx} className="w-full h-full shrink-0">
                  <img
                    src={getOptimizedImageUrl(url)}
                    alt={product.title}
                    className={`w-full h-full object-contain transition-transform duration-700 pointer-events-none ${
                      product.status === 'sold'
                        ? 'grayscale-[0.6]'
                        : 'group-hover:scale-105 grayscale-[0.2] group-hover:grayscale-0'
                    }`}
                    referrerPolicy="no-referrer"
                    draggable={false}
                  />
                </div>
              ))}
            </motion.div>

            {hasMultiple && (
              <>
                <button
                  onClick={prevImage}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-black/40 hover:bg-black/60 text-white rounded-full opacity-0 group-hover/carousel:opacity-100 transition-opacity z-20"
                >
                  <ChevronLeft size={18} strokeWidth={2.5} />
                </button>
                <button
                  onClick={nextImage}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-black/40 hover:bg-black/60 text-white rounded-full opacity-0 group-hover/carousel:opacity-100 transition-opacity z-20"
                >
                  <ChevronRight size={18} strokeWidth={2.5} />
                </button>

                {/* Bottom dots indicator */}
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10 pointer-events-none">
                  {allImages.map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 rounded-full transition-all ${i === imgIndex ? 'w-4 bg-white shadow-sm' : 'w-1.5 bg-white/60'}`}
                    />
                  ))}
                </div>

                {/* Count badge */}
                <div className="absolute top-3 right-3 bg-luxury-ink/60 backdrop-blur-md text-white px-2.5 py-1 rounded-md text-[10px] font-bold tracking-widest z-10 pointer-events-none">
                  {imgIndex + 1}/{allImages.length}
                </div>
              </>
            )}

            {/* Condition + Category badges */}
            <div className="absolute top-3 left-3 bg-surface-card/90 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[10px] font-semibold text-luxury-ink/70 z-10">
              {product.condition}
            </div>
            <div className={`absolute left-3 bg-luxury-ink/60 backdrop-blur-sm text-white px-2.5 py-1 rounded-lg text-[10px] font-semibold z-10 ${hasMultiple ? 'bottom-6' : 'bottom-3'}`}>
              {product.category}
            </div>

            {/* SOLD overlay */}
            {product.status === 'sold' && (
              <div className="absolute inset-0 flex items-center justify-center bg-luxury-ink/20 backdrop-blur-[1px] z-20">
                <div className="flex items-center gap-2 bg-luxury-ink text-surface-base px-5 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.2em] shadow-lg">
                  <Tag size={12} />
                  Sold
                </div>
              </div>
            )}

            {/* Wishlist button — shifts up when dots are visible to avoid overlap */}
            {product.status !== 'sold' && (
              <button
                onClick={toggleWishlist}
                className={`absolute right-2 p-2.5 rounded-full bg-surface-card/80 backdrop-blur-sm shadow-sm hover:scale-110 transition-all z-20 ${
                  hasMultiple ? 'bottom-9' : 'top-3'
                }`}
              >
                <Heart
                  size={18}
                  className={`transition-colors ${
                    isWishlisted ? 'text-brand-pink fill-brand-pink' : 'text-luxury-ink/40 hover:text-brand-pink'
                  }`}
                />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-luxury-ink/40">
              <MapPin size={14} /> {product.city || 'Lucknow'}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleShare}
                className="p-2 text-luxury-ink/40 hover:text-brand-teal transition-colors rounded-lg hover:bg-surface-soft"
              >
                <Share2 size={16} />
              </button>
              <button className={`px-4 py-2 text-white text-xs font-semibold shadow-sm transition-colors rounded-lg ${
                product.status === 'sold'
                  ? 'bg-luxury-ink/30 cursor-not-allowed shadow-none'
                  : 'bg-brand-teal hover:bg-brand-teal/90'
              }`}>
                {product.status === 'sold' ? 'Sold' : 'View'}
              </button>
            </div>
          </div>

        </div>
      </Link>
    </motion.div>
  );
}
