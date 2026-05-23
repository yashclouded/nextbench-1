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
      className="group w-full max-w-xl mx-auto mb-8"
    >
      <Link to={`/product/${product.id}`} className="block">
        <div className={`theme-card p-5 transition-all duration-500 relative rounded-2xl ${
            product.status === 'sold'
              ? 'opacity-75 pointer-events-none'
              : 'hover:scale-[1.005]'
          }`}>
          
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div 
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/profile/${product.sellerId}`); }} 
              className="shrink-0 cursor-pointer"
            >
              <div className="w-10 h-10 rounded-full bg-brand-teal/10 flex items-center justify-center text-brand-teal font-bold text-sm overflow-hidden border border-brand-teal/20">
                {product.sellerName[0]?.toUpperCase()}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div 
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/profile/${product.sellerId}`); }} 
                className="text-sm font-bold text-luxury-ink hover:text-brand-teal transition-colors truncate block cursor-pointer"
              >
                {product.sellerName}
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30 truncate">
                {product.sellerSchool}
              </p>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-brand-pink italic">₹{product.price}</div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-teal/10 text-brand-teal rounded-full text-[9px] font-bold uppercase tracking-widest">
                Marketplace
              </span>
            </div>
          </div>

          <h3 className="text-lg font-bold text-luxury-ink mb-3 group-hover:text-brand-pink transition-colors truncate">{product.title}</h3>

          {/* Image */}
          <div className="aspect-[4/3] overflow-hidden relative mb-5 bg-surface-soft rounded-xl">
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
            <div className="absolute top-3 left-3 glass px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest text-brand-teal">
              {product.condition}
            </div>
            <div className="absolute bottom-3 left-3 bg-luxury-ink/60 backdrop-blur-md text-white px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest">
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
                className="absolute top-3 right-3 p-3 rounded-full glass shadow-md hover:scale-110 transition-all z-10"
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
            <div className="flex items-center gap-1.5 text-xs font-bold text-luxury-ink/40">
              <MapPin size={16} /> {product.city || 'Lucknow'}
            </div>
            <button className={`px-5 py-2.5 text-white text-[11px] font-bold uppercase tracking-[0.2em] shadow-lg transition-colors rounded-xl ${
              product.status === 'sold'
                ? 'bg-luxury-ink/40 cursor-not-allowed shadow-none'
                : 'bg-brand-teal shadow-brand-teal/20 group-hover:bg-brand-pink'
            }`}>
              {product.status === 'sold' ? 'Sold' : 'View'}
            </button>
          </div>

        </div>
      </Link>
    </motion.div>
  );
}
