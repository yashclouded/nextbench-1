import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Trash2, ShoppingBag, ExternalLink } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { useToast } from '../../lib/ToastContext';
import { getOptimizedImageUrl } from '../../lib/utils';

interface WishlistItem {
  id: string; // wishlist doc id
  productId: string;
  product?: {
    title: string;
    price: number;
    image: string;
    category: string;
    condition: string;
    status: string;
    sellerName: string;
    sellerSchool: string;
  };
}

export default function Wishlist() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'wishlists'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const wishlistItems: WishlistItem[] = [];

      for (const wishDoc of snapshot.docs) {
        const data = wishDoc.data();
        const productId = data.productId;

        try {
          const prodDoc = await getDoc(doc(db, 'products', productId));
          if (prodDoc.exists()) {
            const prodData = prodDoc.data();
            wishlistItems.push({
              id: wishDoc.id,
              productId,
              product: {
                title: prodData.title,
                price: prodData.price,
                image: prodData.image,
                category: prodData.category,
                condition: prodData.condition,
                status: prodData.status,
                sellerName: prodData.sellerName,
                sellerSchool: prodData.sellerSchool,
              },
            });
          }
        } catch {
          // Product may have been deleted
        }
      }

      setItems(wishlistItems);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const handleRemove = async (wishlistId: string) => {
    try {
      await deleteDoc(doc(db, 'wishlists', wishlistId));
      showToast('Removed from wishlist', 'info');
    } catch {
      showToast('Failed to remove item', 'error');
    }
  };

  return (
    <div className="pt-32 pb-20 px-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-12">
        <div>
          <h1 className="text-4xl font-serif font-bold text-luxury-ink italic mb-2">
            Your <span className="not-italic">Wishlist</span>
          </h1>
          <p className="text-luxury-ink/40 font-medium uppercase text-[10px] tracking-[0.2em]">
            {items.length} saved {items.length === 1 ? 'item' : 'items'}
          </p>
        </div>
        <Link
          to="/dashboard"
          className="hidden md:flex items-center gap-2 px-6 py-3 bg-luxury-ink text-surface-base rounded-full font-bold text-xs uppercase tracking-widest hover:bg-brand-teal transition-all luxury-shadow"
        >
          <ShoppingBag size={16} /> Browse More
        </Link>
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <div className="w-10 h-10 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-xs font-bold uppercase tracking-widest text-luxury-ink/30">Loading wishlist...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-surface-card rounded-3xl p-20 text-center luxury-shadow border border-luxury-ink/5">
          <div className="w-16 h-16 bg-brand-pink/5 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Heart className="text-brand-pink" size={32} />
          </div>
          <h3 className="text-xl font-serif font-bold text-luxury-ink mb-2 italic">
            No Saved <span className="not-italic">Items</span>
          </h3>
          <p className="text-luxury-ink/40 text-sm max-w-xs mx-auto mb-8 font-medium">
            Browse the marketplace and tap the heart icon on items you're interested in.
          </p>
          <Link
            to="/dashboard"
            className="inline-block bg-luxury-ink text-surface-base px-8 py-4 rounded-full font-bold hover:bg-brand-teal transition-all luxury-shadow uppercase text-[10px] tracking-widest"
          >
            Explore Marketplace
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <AnimatePresence mode="popLayout">
            {items.map((item) => (
              <motion.div
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                key={item.id}
                className="group"
              >
                <div className="bg-surface-card rounded-2xl overflow-hidden luxury-shadow border border-luxury-ink/5 relative">
                  {item.product?.status !== 'available' && (
                    <div className="absolute inset-0 bg-surface-card/70 backdrop-blur-sm z-10 flex items-center justify-center">
                      <span className="px-4 py-2 bg-luxury-ink text-surface-base text-xs font-bold uppercase tracking-widest rounded-full">
                        {item.product?.status === 'sold' ? 'Sold Out' : item.product?.status === 'reserved' ? 'Reserved' : 'Unavailable'}
                      </span>
                    </div>
                  )}

                  <Link to={`/product/${item.productId}`}>
                    <div className="aspect-[4/3] overflow-hidden bg-surface-base">
                      <img
                        src={getOptimizedImageUrl(item.product?.image)}
                        alt={item.product?.title}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  </Link>

                  <div className="p-5">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0 pr-2">
                        <h3 className="text-base font-bold text-luxury-ink truncate">{item.product?.title}</h3>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40">
                          {item.product?.category} • {item.product?.sellerSchool}
                        </p>
                      </div>
                      <span className="text-xl font-bold text-brand-pink italic shrink-0">₹{item.product?.price}</span>
                    </div>

                    <div className="flex items-center gap-2 mt-4">
                      <Link
                        to={`/product/${item.productId}`}
                        className="flex-1 py-3 bg-brand-teal text-white text-[10px] font-bold uppercase tracking-widest text-center hover:bg-brand-pink transition-colors rounded-lg"
                      >
                        View Item
                      </Link>
                      <button
                        onClick={() => handleRemove(item.id)}
                        className="p-3 rounded-lg border border-luxury-ink/5 hover:bg-red-50 hover:text-red-500 transition-all text-luxury-ink/30"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
