import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../lib/AuthContext';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useTrending() {
  const { user, userData } = useAuth();
  const [trendingPosts, setTrendingPosts] = useState<any[]>([]);
  const [trendingProducts, setTrendingProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !userData?.school) {
      setLoading(false);
      return;
    }

    let active = true;

    const getSchoolKey = async (schoolName: string) => {
      const msgBuffer = new TextEncoder().encode(schoolName.trim().toLowerCase());
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hashHex.slice(0, 24);
    };

    let unsub: (() => void) | undefined;

    getSchoolKey(userData.school)
      .then((schoolKey) => {
        if (!active) return;
        unsub = onSnapshot(doc(db, 'computed', `trending_${schoolKey}`), (snap) => {
          if (!active) return;
          if (snap.exists()) {
            const items = snap.get('items') || [];
            
            // Map items to include trendLabel based on server-computed badge
            const mapped = items.map((i: any) => {
              let trendLabel = null;
              if (i.badge === 'HOT') trendLabel = '⚡ Exploding';
              else if (i.badge === 'TRENDING') {
                trendLabel = i.type === 'post' ? '📈 Trending in Your School' : '🔥 Heating Up';
              } else if (i.badge === 'RISING') trendLabel = "👀 Everyone's Watching";
              else if (i.badge === 'NEW') trendLabel = i.type === 'post' ? '🆕 New Post' : '🆕 New Product';

              // Map properties to match ScoredPost / ScoredProduct expectations
              return {
                ...i,
                trendLabel,
              };
            });

            const posts = mapped.filter((i: any) => i.type === 'post');
            const products = mapped.filter((i: any) => i.type === 'product');
            setTrendingPosts(posts);
            setTrendingProducts(products);
          }
          setLoading(false);
        }, (err) => {
          console.warn('Failed to listen to trending:', err);
          setLoading(false);
        });
      })
      .catch((err) => {
        console.error('Failed to get school key for trending:', err);
        setLoading(false);
      });

    return () => {
      active = false;
      if (unsub) unsub();
    };
  }, [user?.uid, userData?.school]);

  const schoolTrending = useMemo(() => trendingPosts, [trendingPosts]);
  const cityTrending = useMemo(() => {
    if (!userData?.city) return [];
    return trendingPosts.filter((p: any) => p.city && p.city.toLowerCase() === userData.city?.toLowerCase());
  }, [trendingPosts, userData?.city]);

  const trendingProduct = useMemo(() => trendingProducts[0] || null, [trendingProducts]);
  const activeToday = useMemo(() => trendingPosts.length, [trendingPosts]);

  return { schoolTrending, cityTrending, trendingProduct, activeToday, loading };
}
