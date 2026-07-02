import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../lib/AuthContext';
import { getDiscoveryFeed } from '../lib/discovery';
import {
  TrendablePost,
  TrendableProduct,
  ScoredPost,
  ScoredProduct,
  computeSchoolTrending,
  computeCityTrending,
  computeTrendingProduct,
  countActiveToday,
} from '../lib/trending';

interface TrendingData {
  schoolTrending: ScoredPost[];
  cityTrending: ScoredPost[];
  trendingProduct: ScoredProduct | null;
  activeToday: number;
  loading: boolean;
}

function trendTimestamp(value: any) {
  if (typeof value === 'number') {
    return { toMillis: () => value };
  }
  return value;
}

export function useTrending(): TrendingData {
  const { user, userData } = useAuth();
  const [rawPosts, setRawPosts] = useState<TrendablePost[]>([]);
  const [rawProducts, setRawProducts] = useState<TrendableProduct[]>([]);
  const [loading, setLoading] = useState(true);
  // Only fetch once per user session — trending data doesn't need to be live
  const hasFetched = useRef(false);

  useEffect(() => {
    // Reset when user changes
    hasFetched.current = false;
  }, [user?.uid]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    let cancelled = false;
    setLoading(true);

    getDiscoveryFeed()
      .then(({ posts, products }) => {
        if (cancelled) return;

        setRawPosts(posts.map((post) => ({
          id: post.id,
          title: post.title || '',
          content: post.content || '',
          authorId: post.authorId || '',
          authorName: post.authorName || 'Unknown',
          authorProfilePicture: post.authorProfilePicture || undefined,
          authorUsername: (post as any).authorUsername || null,
          school: post.school || '',
          city: post.city,
          type: post.type || 'others',
          imageUrl: post.imageUrl,
          imageUrls: post.imageUrls,
          upvotesCount: post.upvotesCount || 0,
          repliesCount: post.repliesCount || 0,
          sharesCount: (post as any).sharesCount || 0,
          createdAt: trendTimestamp(post.createdAt),
        } as TrendablePost)));

        setRawProducts(products.map((product) => ({
          id: product.id,
          title: product.title || '',
          price: product.price || 0,
          category: product.category || '',
          condition: product.condition || '',
          image: product.image || '',
          status: product.status || 'available',
          sellerId: product.sellerId || '',
          sellerName: product.sellerName || 'Unknown',
          sellerSchool: product.sellerSchool || '',
          city: product.city,
          createdAt: trendTimestamp(product.createdAt),
          wishlistCount: (product as any).wishlistCount || 0,
          inquiryCount: (product as any).inquiryCount || 0,
        } as TrendableProduct)));
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('Trending: Error fetching discovery feed:', error);
          setRawPosts([]);
          setRawProducts([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [user?.uid]);

  const schoolTrending = useMemo(() => {
    if (!userData?.school) return [];
    return computeSchoolTrending(rawPosts, userData.school, userData.city, 5);
  }, [rawPosts, userData?.school, userData?.city]);

  const cityTrending = useMemo(() => {
    if (!userData?.city) return [];
    return computeCityTrending(rawPosts, userData.city, 5);
  }, [rawPosts, userData?.city]);

  const trendingProduct = useMemo(() => {
    return computeTrendingProduct(rawProducts);
  }, [rawProducts]);

  const activeToday = useMemo(() => {
    return countActiveToday(rawPosts);
  }, [rawPosts]);

  return { schoolTrending, cityTrending, trendingProduct, activeToday, loading };
}
