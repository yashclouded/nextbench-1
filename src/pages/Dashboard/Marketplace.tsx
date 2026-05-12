import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, SlidersHorizontal, CheckCircle, Heart, X, Tag } from 'lucide-react';
import { categories } from '../../mockData';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, query, where, addDoc, deleteDoc, doc, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
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
}

const CONDITIONS = ['All', 'Brand New', 'Like New', 'Good', 'Used'];
const SORT_OPTIONS = [
  { label: 'Newest First', value: 'newest' },
  { label: 'Price: Low → High', value: 'price_asc' },
  { label: 'Price: High → Low', value: 'price_desc' },
];

export default function Marketplace() {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [wishlisted, setWishlisted] = useState<Set<string>>(new Set());
  const [wishlistMap, setWishlistMap] = useState<Record<string, string>>({}); // productId -> wishlistDocId
  const { user } = useAuth();
  const { showToast } = useToast();

  // Advanced filters
  const [showFilters, setShowFilters] = useState(false);
  const [conditionFilter, setConditionFilter] = useState('All');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  useEffect(() => {
    // Fetch both available and sold products so the marketplace feels populated
    const q = query(
      collection(db, 'products'),
      where('status', 'in', ['available', 'sold'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prods: Product[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        prods.push({
          id: doc.id,
          title: data.title || '',
          price: data.price || 0,
          category: data.category || '',
          condition: data.condition || '',
          image: data.image || '',
          status: data.status || '',
          sellerId: data.sellerId || '',
          sellerName: data.sellerName || 'Unknown Seller',
          sellerSchool: data.sellerSchool || 'Unknown School'
        });
      });
      setProducts(prods);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'products');
    });

    return () => unsubscribe();
  }, []);

  // Load wishlisted items
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'wishlists'),
      where('userId', '==', user.uid)
    );

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

  const toggleWishlist = async (e: React.MouseEvent, productId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      showToast('Please log in to save items', 'warning');
      return;
    }

    try {
      if (wishlisted.has(productId)) {
        const wishDocId = wishlistMap[productId];
        if (wishDocId) {
          await deleteDoc(doc(db, 'wishlists', wishDocId));
          showToast('Removed from wishlist', 'info');
        }
      } else {
        await addDoc(collection(db, 'wishlists'), {
          userId: user.uid,
          productId,
          createdAt: serverTimestamp(),
        });
        showToast('Added to wishlist ♥', 'success');
      }
    } catch {
      showToast('Failed to update wishlist', 'error');
    }
  };

  // Get unique schools for filter
  const schools = [...new Set(products.map(p => p.sellerSchool))].sort();

  const filteredProducts = products
    .filter(product => {
      const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;
      const matchesSearch = product.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.sellerName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCondition = conditionFilter === 'All' || product.condition === conditionFilter;
      const matchesMinPrice = !priceMin || product.price >= Number(priceMin);
      const matchesMaxPrice = !priceMax || product.price <= Number(priceMax);
      const matchesSchool = !schoolFilter || product.sellerSchool === schoolFilter;
      return matchesCategory && matchesSearch && matchesCondition && matchesMinPrice && matchesMaxPrice && matchesSchool;
    })
    .sort((a, b) => {
      if (sortBy === 'price_asc') return a.price - b.price;
      if (sortBy === 'price_desc') return b.price - a.price;
      return 0; // newest - rely on Firestore order
    });

  const hasActiveFilters = conditionFilter !== 'All' || priceMin || priceMax || schoolFilter;

  const clearFilters = () => {
    setConditionFilter('All');
    setPriceMin('');
    setPriceMax('');
    setSchoolFilter('');
    setSortBy('newest');
  };

  return (
    <div className="pt-32 pb-20 px-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-8">
        <div>
          <h1 className="text-5xl font-serif font-bold text-luxury-ink mb-4 italic">NextBench <span className="not-italic">Selection</span></h1>
          <p className="text-luxury-ink/50 font-medium">Curated student-to-student marketplace.</p>
        </div>
        
        <div className="flex items-center gap-3 w-full max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-luxury-ink/30" size={18} />
            <input 
              type="text" 
              placeholder="Search items, sellers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-luxury-ink/10 rounded-2xl py-4 pl-13 pr-4 luxury-shadow focus:outline-none focus:border-brand-teal transition-all text-sm font-medium"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-4 rounded-2xl border transition-all luxury-shadow ${
              showFilters || hasActiveFilters
                ? 'bg-brand-teal text-white border-brand-teal'
                : 'bg-white text-luxury-ink/40 border-luxury-ink/5 hover:border-brand-teal'
            }`}
          >
            <SlidersHorizontal size={20} />
          </button>
        </div>
      </div>

      {/* Advanced Filters Panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-8"
          >
            <div className="bg-white rounded-2xl p-6 md:p-8 luxury-shadow border border-luxury-ink/5">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xs font-bold uppercase tracking-widest text-luxury-ink/40">Advanced Filters</h3>
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="text-[10px] font-bold uppercase tracking-widest text-brand-pink hover:text-red-500 flex items-center gap-1">
                    <X size={12} /> Clear All
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30 mb-2 block">Condition</label>
                  <select
                    value={conditionFilter}
                    onChange={(e) => setConditionFilter(e.target.value)}
                    className="w-full bg-surface-base border border-luxury-ink/5 rounded-xl py-3 px-4 text-sm font-medium appearance-none focus:outline-none focus:border-brand-teal"
                  >
                    {CONDITIONS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30 mb-2 block">Price Range (₹)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      value={priceMin}
                      onChange={(e) => setPriceMin(e.target.value)}
                      className="w-full bg-surface-base border border-luxury-ink/5 rounded-xl py-3 px-4 text-sm font-medium focus:outline-none focus:border-brand-teal"
                    />
                    <span className="text-luxury-ink/20 font-bold">—</span>
                    <input
                      type="number"
                      placeholder="Max"
                      value={priceMax}
                      onChange={(e) => setPriceMax(e.target.value)}
                      className="w-full bg-surface-base border border-luxury-ink/5 rounded-xl py-3 px-4 text-sm font-medium focus:outline-none focus:border-brand-teal"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30 mb-2 block">Campus</label>
                  <select
                    value={schoolFilter}
                    onChange={(e) => setSchoolFilter(e.target.value)}
                    className="w-full bg-surface-base border border-luxury-ink/5 rounded-xl py-3 px-4 text-sm font-medium appearance-none focus:outline-none focus:border-brand-teal"
                  >
                    <option value="">All Campuses</option>
                    {schools.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30 mb-2 block">Sort By</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="w-full bg-surface-base border border-luxury-ink/5 rounded-xl py-3 px-4 text-sm font-medium appearance-none focus:outline-none focus:border-brand-teal"
                  >
                    {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Categories Scroller */}
      <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-8 mb-12 border-b border-luxury-ink/5">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`whitespace-nowrap px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${
              selectedCategory === cat 
                ? 'bg-luxury-ink text-white luxury-shadow scale-105' 
                : 'bg-white text-luxury-ink/40 border border-luxury-ink/5 hover:border-brand-teal/30 hover:text-luxury-ink/80'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Results count */}
      {!loading && (
        <p className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/20 mb-8">
          {filteredProducts.length} {filteredProducts.length === 1 ? 'item' : 'items'} found
          {hasActiveFilters && ' (filtered)'}
        </p>
      )}

      {loading ? (
        <div className="py-20 text-center">
          <div className="w-10 h-10 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-luxury-ink/40 text-xs font-bold uppercase tracking-widest">Loading Selection...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          <AnimatePresence mode="popLayout">
            {filteredProducts.map((product) => (
              <motion.div
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                key={product.id}
                className="group"
              >
                <Link to={`/product/${product.id}`}>
                  <div className={`bg-white p-5 shadow-[0_40px_100px_-20px_rgba(58,139,149,0.15)] border transition-all duration-500 relative rounded-xl ${
                      product.status === 'sold'
                        ? 'border-luxury-ink/10 opacity-75 pointer-events-none'
                        : 'border-brand-teal/5 group-hover:border-brand-pink'
                    }`}>
                    <div className="aspect-[4/3] overflow-hidden relative mb-5 bg-surface-base rounded-lg">
                      <img 
                        src={product.image} 
                        alt={product.title}
                        className={`w-full h-full object-cover transition-transform duration-700 ${
                          product.status === 'sold'
                            ? 'grayscale-[0.6]'
                            : 'group-hover:scale-105 grayscale-[0.3] group-hover:grayscale-0'
                        }`}
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-md px-3 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest text-brand-teal">
                        {product.condition}
                      </div>

                      {/* SOLD overlay */}
                      {product.status === 'sold' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-luxury-ink/20 backdrop-blur-[1px]">
                          <div className="flex items-center gap-2 bg-luxury-ink text-white px-5 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.2em] shadow-lg">
                            <Tag size={12} />
                            Sold
                          </div>
                        </div>
                      )}

                      {/* Wishlist button — only for available items */}
                      {product.status !== 'sold' && (
                        <button
                          onClick={(e) => toggleWishlist(e, product.id)}
                          className="absolute top-3 right-3 p-2.5 rounded-full bg-white/90 backdrop-blur-md shadow-md hover:scale-110 transition-all"
                        >
                          <Heart
                            size={16}
                            className={`transition-colors ${
                              wishlisted.has(product.id)
                                ? 'text-brand-pink fill-brand-pink'
                                : 'text-luxury-ink/30'
                            }`}
                          />
                        </button>
                      )}
                    </div>
                    
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1 min-w-0 pr-3">
                        <h3 className="text-lg font-bold text-luxury-ink mb-1 group-hover:text-brand-pink transition-colors truncate">{product.title}</h3>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 truncate">{product.category} • {product.sellerSchool}</p>
                      </div>
                      <div className="text-2xl font-bold text-brand-pink italic shrink-0">₹{product.price}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-5">
                      <div className="p-2.5 bg-surface-base border border-brand-teal/5 rounded-lg">
                        <div className="text-[9px] uppercase tracking-widest font-bold text-brand-teal/60 mb-0.5">Status</div>
                        <div className="text-[10px] font-bold flex items-center gap-1">
                          <CheckCircle size={10} className="text-brand-mint" /> Verified
                        </div>
                      </div>
                      <div className="p-2.5 bg-surface-base border border-brand-teal/5 rounded-lg">
                        <div className="text-[9px] uppercase tracking-widest font-bold text-brand-teal/60 mb-0.5">Seller</div>
                        <div className="text-[10px] font-bold tracking-tight truncate">{product.sellerName}</div>
                      </div>
                    </div>
                    
                    <button className={`w-full py-3.5 text-white text-[11px] font-bold uppercase tracking-[0.2em] shadow-lg transition-colors rounded-lg ${
                      product.status === 'sold'
                        ? 'bg-luxury-ink/40 cursor-not-allowed shadow-none'
                        : 'bg-brand-teal shadow-brand-teal/20 group-hover:bg-brand-pink'
                    }`}>
                      {product.status === 'sold' ? 'Item Sold' : 'View Details'}
                    </button>
                  </div>
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {!loading && filteredProducts.length === 0 && (
        <div className="py-32 text-center">
          <p className="text-luxury-ink/30 font-serif italic text-2xl mb-4">No items found for this selection.</p>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-brand-pink font-bold text-sm hover:underline">
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
