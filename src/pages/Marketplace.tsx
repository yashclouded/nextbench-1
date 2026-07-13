import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useAnimationControls } from 'motion/react';
import { getOptimizedImageUrl } from '../lib/utils';
import SEO from '../components/seo/SEO';
import { getDiscoveryFeed } from '../lib/discovery';
import SmartImage from '../components/ui/SmartImage';
import { MarketplaceSkeleton } from '../components/ui/skeleton/Skeleton';

interface MarketplaceItem {
  id: string;
  title: string;
  price: number;
  image: string;
  createdAt: any;
}

const headerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};
const headerItem = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
};

function MarketplaceCard({
  item,
  index,
  onClick,
}: {
  item: MarketplaceItem;
  index: number;
  onClick: () => void;
}) {
  // Cascading entrance delay based on position — capped so late items in long lists
  // don't sit invisible for ages. Resets per-column, which reads as a nice ripple.
  const delay = Math.min(index * 0.05, 0.5);

  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.92, y: 18 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -5, scale: 1.015 }}
      whileTap={{ scale: 0.97 }}
      className="group block w-full break-inside-avoid overflow-hidden rounded-2xl bg-surface-card border border-luxury-ink/5 shadow-sm hover:shadow-lg transition-shadow text-left mb-4"
    >
      <div className="relative w-full overflow-hidden bg-luxury-ink/5 aspect-4/3">
        <SmartImage
          src={getOptimizedImageUrl(item.image, 640)}
          alt={item.title}
          ratio={4 / 3}
          className="grayscale-[0.15] group-hover:grayscale-0 group-hover:scale-[1.04] transition-all duration-500"
        />
        <div className="absolute inset-0 bg-luxury-ink/0 group-hover:bg-luxury-ink/10 transition-colors" />
      </div>
      <div className="px-4 py-3">
        <p className="text-lg font-serif font-bold text-luxury-ink">₹{item.price}</p>
      </div>
    </motion.button>
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
          <MarketplaceCard
            key={`${item.id}-${i}`}
            item={item}
            index={i % items.length}
            onClick={onItemClick}
          />
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
    let cancelled = false;
    getDiscoveryFeed()
      .then((data) => {
        if (cancelled) return;
        const products = data.products
          .filter((p) => p.status === 'available')
          .map((p) => ({ id: p.id, title: p.title, price: p.price, image: p.image, createdAt: p.createdAt }));
        setItems(products);
      })
      .catch((error) => {
        console.error('Failed to load marketplace items', error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
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

  // One state key drives the crossfade between loading / empty / content
  const viewState = loading ? 'loading' : items.length === 0 ? 'empty' : 'content';

  return (
    <div className="pt-28 pb-20 px-4 md:px-8 max-w-400 mx-auto">
      <SEO
        title="Marketplace"
        description="Browse items for sale from verified students near you."
      />

      <motion.div
        variants={headerContainer}
        initial="hidden"
        animate="visible"
        className="text-center mb-12"
      >
        <motion.h1 variants={headerItem} className="text-4xl md:text-6xl font-serif font-bold text-luxury-ink mb-3">
          The Marketplace
        </motion.h1>
        <motion.p variants={headerItem} className="text-luxury-ink/50 text-sm md:text-base">
          Sign in to view details, message sellers, and reserve items.
        </motion.p>
      </motion.div>

      <AnimatePresence mode="wait">
        {viewState === 'loading' && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <MarketplaceSkeleton />
          </motion.div>
        )}

        {viewState === 'empty' && (
          <motion.p
            key="empty"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="text-center text-luxury-ink/40 text-sm py-20"
          >
            No items available right now. Check back soon!
          </motion.p>
        )}

        {viewState === 'content' && (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex gap-4 h-[calc(100vh-220px)]"
            style={{
              maskImage: 'linear-gradient(to bottom, transparent, black 6%, black 94%, transparent)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 6%, black 94%, transparent)',
            }}
          >
            {columns.map((col, idx) => (
              <ScrollingColumn
                key={idx}
                items={col}
                direction={idx % 2 === 0 ? 'up' : 'down'}
                speed={idx % 2 === 0 ? 55 : 45}
                onItemClick={goToLogin}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
