import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useAnimationControls } from 'motion/react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getOptimizedImageUrl } from '../lib/utils';
import SEO from '../components/seo/SEO';

interface MarketplaceItem {
  id: string;
  title: string;
  price: number;
  image: string;
  createdAt: any;
}

function MarketplaceCard({ item, onClick }: { item: MarketplaceItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group block w-full break-inside-avoid overflow-hidden rounded-2xl bg-surface-card border border-luxury-ink/5 shadow-sm hover:shadow-lg transition-shadow text-left mb-4"
    >
      <div className="relative w-full overflow-hidden bg-luxury-ink/5">
        <img
          src={getOptimizedImageUrl(item.image)}
          alt={item.title}
          loading="lazy"
          className="w-full h-auto object-cover grayscale-[0.15] group-hover:grayscale-0 group-hover:scale-[1.04] transition-all duration-500"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-luxury-ink/0 group-hover:bg-luxury-ink/10 transition-colors" />
      </div>
      <div className="px-4 py-3">
        <p className="text-lg font-serif font-bold text-luxury-ink">₹{item.price}</p>
      </div>
    </button>
  );
}

function ScrollingColumn({ items, direction, speed, onItemClick }: {
  items: MarketplaceItem[];
  direction: 'up' | 'down';
  speed: number;
  onItemClick: () => void;
}) {
  const controls = useAnimationControls();
  const [containerHeight, setContainerHeight] = useState(0);

  // Duplicate items so the loop is seamless
  const doubled = [...items, ...items];

  useEffect(() => {
    if (containerHeight === 0) return;
    const distance = containerHeight;
    const duration = distance / speed;

    if (direction === 'up') {
      controls.set({ y: 0 });
      controls.start({
        y: -distance,
        transition: { duration, ease: 'linear', repeat: Infinity }
      });
    } else {
      controls.set({ y: -distance });
      controls.start({
        y: 0,
        transition: { duration, ease: 'linear', repeat: Infinity }
      });
    }
  }, [containerHeight, direction, speed, controls]);

  const resume = () => {
    if (containerHeight === 0) return;
    const distance = containerHeight;
    const duration = distance / speed;
    controls.start(
      direction === 'up'
        ? { y: -distance, transition: { duration, ease: 'linear', repeat: Infinity } }
        : { y: 0, transition: { duration, ease: 'linear', repeat: Infinity } }
    );
  };

  return (
    <div
      className="overflow-hidden flex-1 min-w-0"
      onMouseEnter={() => controls.stop()}
      onMouseLeave={resume}
    >
      <motion.div
        animate={controls}
        ref={(el) => {
          if (el && containerHeight === 0) {
            const h = el.scrollHeight / 2; // half because content is doubled
            if (h > 0) setContainerHeight(h);
          }
        }}
      >
        {doubled.map((item, i) => (
          <MarketplaceCard key={`${item.id}-${i}`} item={item} onClick={onItemClick} />
        ))}
      </motion.div>
    </div>
  );
}

export default function Marketplace() {
  const navigate = useNavigate();
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'products'),
      where('status', '==', 'available')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: MarketplaceItem[] = [];
      snapshot.forEach(d => {
        const p = d.data();
        data.push({ id: d.id, title: p.title, price: p.price, image: p.image, createdAt: p.createdAt });
      });
      data.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setItems(data);
      setLoading(false);
    }, (error) => {
      console.error('Failed to load marketplace items', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const goToLogin = () => navigate('/login');

  // Split items round-robin into columns
  const columns = useMemo(() => {
    const NUM_COLUMNS = 4;
    const cols: MarketplaceItem[][] = Array.from({ length: NUM_COLUMNS }, () => []);
    items.forEach((item, i) => {
      cols[i % NUM_COLUMNS].push(item);
    });
    return cols.filter(c => c.length > 0);
  }, [items]);

  return (
    <div className="pt-28 pb-20 px-4 md:px-8 max-w-400 mx-auto">
      <SEO
        title="Marketplace"
        description="Browse items for sale from verified students near you."
      />

      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-6xl font-serif font-bold text-luxury-ink mb-3">
          The Marketplace
        </h1>
        <p className="text-luxury-ink/50 text-sm md:text-base">
          Sign in to view details, message sellers, and reserve items.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-center text-luxury-ink/40 text-sm py-20">
          No items available right now. Check back soon!
        </p>
      ) : (
        <div className="flex gap-4 h-[calc(100vh-220px)]">
          {columns.map((col, idx) => (
            <ScrollingColumn
              key={idx}
              items={col}
              direction={idx % 2 === 0 ? 'up' : 'down'}
              speed={idx % 2 === 0 ? 55 : 45}
              onItemClick={goToLogin}
            />
          ))}
        </div>
      )}
    </div>
  );
}