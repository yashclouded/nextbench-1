import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, MapPin, Tag } from 'lucide-react';
import { motion } from 'motion/react';
import { getOptimizedImageUrl } from '../../lib/utils';
import { db } from '../../lib/firebase';
import { doc, setDoc, deleteDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';

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

interface ProductCardProps {
  key?: React.Key;
  product: Product;
  isWishlisted: boolean;
  wishlistDocId?: string;
}

export default function ProductCard({ product, isWishlisted, wishlistDocId }: ProductCardProps) {
  const { user, userData } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

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
              : 'hover:bg-surface-soft'
          }`} style={{ borderColor: 'var(--color-border)' }}>
          
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div 
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/profile/${product.sellerId}`); }} 
              className="shrink-0 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-full bg-surface-soft flex items-center justify-center text-brand-teal font-semibold text-sm overflow-hidden">
                {product.sellerName[0]?.toUpperCase()}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div 
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/profile/${product.sellerId}`); }} 
                className="text-sm font-semibold text-luxury-ink hover:underline transition-colors truncate block cursor-pointer"
              >
                {product.sellerName}
              </div>
              <p className="text-[11px] text-luxury-ink/30 truncate">
                {product.sellerSchool}
              </p>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-luxury-ink">₹{product.price}</div>
              <span className="inline-flex items-center px-2 py-0.5 bg-brand-teal/8 text-brand-teal rounded-full text-[10px] font-semibold">
                Marketplace
              </span>
            </div>
          </div>

          <h3 className="text-[15px] font-semibold text-luxury-ink mb-3 truncate">{product.title}</h3>

          {/* Image */}
          <div className="aspect-[4/3] overflow-hidden relative mb-4 bg-surface-soft rounded-xl">
            <img 
              src={getOptimizedImageUrl(product.image)} 
              alt={product.title}
              className={`w-full h-full object-contain transition-transform duration-700 ${
                product.status === 'sold'
                  ? 'grayscale-[0.6]'
                  : 'group-hover:scale-105 grayscale-[0.2] group-hover:grayscale-0'
              }`}
              referrerPolicy="no-referrer"
            />
            <div className="absolute top-3 left-3 bg-surface-card/90 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[10px] font-semibold text-luxury-ink/70">
              {product.condition}
            </div>
            <div className="absolute bottom-3 left-3 bg-luxury-ink/60 backdrop-blur-sm text-white px-2.5 py-1 rounded-lg text-[10px] font-semibold">
              {product.category}
            </div>

            {/* SOLD overlay */}
            {product.status === 'sold' && (
              <div className="absolute inset-0 flex items-center justify-center bg-luxury-ink/20 backdrop-blur-[1px]">
                <div className="flex items-center gap-2 bg-luxury-ink text-surface-base px-5 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.2em] shadow-lg">
                  <Tag size={12} />
                  Sold
                </div>
              </div>
            )}

            {/* Wishlist button */}
            {product.status !== 'sold' && (
              <button
                onClick={toggleWishlist}
                className="absolute top-3 right-3 p-2.5 rounded-full bg-surface-card/80 backdrop-blur-sm shadow-sm hover:scale-110 transition-all z-10"
              >
                <Heart
                  size={18}
                  className={`transition-colors ${
                    isWishlisted
                      ? 'text-brand-pink fill-brand-pink'
                      : 'text-luxury-ink/40 hover:text-brand-pink'
                  }`}
                />
              </button>
            )}
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-luxury-ink/40">
              <MapPin size={14} /> {product.city || 'Lucknow'}
            </div>
            <button className={`px-4 py-2 text-white text-xs font-semibold shadow-sm transition-colors rounded-lg ${
              product.status === 'sold'
                ? 'bg-luxury-ink/30 cursor-not-allowed shadow-none'
                : 'bg-brand-teal hover:bg-brand-teal/90'
            }`}>
              {product.status === 'sold' ? 'Sold' : 'View'}
            </button>
          </div>

        </div>
      </Link>
    </motion.div>
  );
}
