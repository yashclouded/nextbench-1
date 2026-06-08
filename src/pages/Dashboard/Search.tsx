import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { collection, query, getDocs, limit, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Search as SearchIcon, Users, Grid3X3, Package, ArrowRight, Globe } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { getOptimizedImageUrl } from '../../lib/utils';
import PostCard from '../../components/ui/PostCard';
import ProductCard from '../../components/ui/ProductCard';
import { useFollowingIds, followUser, unfollowUser } from '../../lib/follows';
import { joinClub } from '../../lib/clubs';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { AnimatePresence, motion } from 'motion/react';


export default function Search() {
  const { user, userData } = useAuth();
  const { showToast } = useToast();
  const { followingIds } = useFollowingIds();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'users' | 'posts' | 'products' | 'clubs'>('all');
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [clubs, setClubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [upvotedPostIds, setUpvotedPostIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'post_upvotes'), where('userId', '==', user.uid));
    const unsub = onSnapshot(q, snap => {
      const ids = new Set<string>();
      snap.forEach(d => ids.add(d.data().postId));
      setUpvotedPostIds(ids);
    });
    return () => unsub();
  }, [user]);

  // Cache for suggestions to avoid re-fetching on empty search
  const [suggestionsFetched, setSuggestionsFetched] = useState(false);
  const [suggestedUsers, setSuggestedUsers] = useState<any[]>([]);
  const [suggestedPosts, setSuggestedPosts] = useState<any[]>([]);
  const [suggestedProducts, setSuggestedProducts] = useState<any[]>([]);
  const [suggestedClubs, setSuggestedClubs] = useState<any[]>([]);

  // Fetch initial data or perform search
  useEffect(() => {
    // Show suggestions when search is empty
    if (!searchQuery.trim()) {
      if (!suggestionsFetched) {
        // Fetch suggestions only once
        const fetchSuggestions = async () => {
          setLoading(true);
          try {
            const [usersSnap, postsSnap, productsSnap, clubsSnap] = await Promise.all([
              getDocs(query(collection(db, 'users'), limit(200))),
              getDocs(query(collection(db, 'posts'), limit(5))),
              getDocs(query(collection(db, 'products'), limit(5))),
              getDocs(query(collection(db, 'clubs'), where('type', '==', 'public'), limit(5)))
            ]);
            
            const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
            const fetchedUsers = allUsers
              .filter((u: any) => u.id !== user?.uid && u.verified === true)
              .map((u: any) => {
                let score = 0;
                if (userData?.school && u.school === userData.school) score += 100;
                if (userData?.city && u.city === userData.city) score += 30;
                if (followingIds.has(u.id)) score -= 50;
                score += Math.random() * 5;
                return { ...u, _score: score };
              })
              .sort((a: any, b: any) => b._score - a._score)
              .slice(0, 15);
            const fetchedPosts = postsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
            const fetchedProducts = productsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter((p: any) => p.status !== 'sold');
            const fetchedClubs = clubsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
            
            setSuggestedUsers(fetchedUsers);
            setSuggestedPosts(fetchedPosts);
            setSuggestedProducts(fetchedProducts);
            setSuggestedClubs(fetchedClubs);
            setUsers(fetchedUsers);
            setPosts(fetchedPosts);
            setProducts(fetchedProducts);
            setClubs(fetchedClubs);
            setSuggestionsFetched(true);
          } catch (err) {
            console.error('Failed to load suggestions:', err);
          } finally {
            setLoading(false);
          }
        };
        fetchSuggestions();
      } else {
        // Just restore from cache
        setUsers(suggestedUsers);
        setPosts(suggestedPosts);
        setProducts(suggestedProducts);
        setClubs(suggestedClubs);
        setLoading(false);
      }
      if (activeTab === 'users') setActiveTab('all');
      return;
    }

    const performSearch = async () => {
      setLoading(true);
      try {
        if (searchQuery.trim().startsWith('@')) {
          const usernamePrefix = searchQuery.trim().substring(1).toLowerCase();
          const usersSnap = await getDocs(
            query(
              collection(db, 'users'),
              where('username', '>=', usernamePrefix),
              where('username', '<=', usernamePrefix + '\uf8ff'),
              limit(20)
            )
          );
          const fetchedUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
          setUsers(fetchedUsers);
          setPosts([]);
          setProducts([]);
          setClubs([]);
          setActiveTab('users');
          return;
        }

        const [usersSnap, postsSnap, productsSnap, clubsSnap] = await Promise.all([
          getDocs(query(collection(db, 'users'), limit(20))),
          getDocs(query(collection(db, 'posts'), limit(20))),
          getDocs(query(collection(db, 'products'), limit(20))),
          getDocs(query(collection(db, 'clubs'), where('type', '==', 'public'), limit(20)))
        ]);

        const lowerQ = searchQuery.toLowerCase();

        setUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter(u => 
          (u.name && u.name.toLowerCase().includes(lowerQ)) || 
          (u.school && u.school.toLowerCase().includes(lowerQ)) ||
          (u.username && u.username.toLowerCase().includes(lowerQ))
        ));
        setPosts(postsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter(p => 
          (p.title && p.title.toLowerCase().includes(lowerQ)) || 
          (p.content && p.content.toLowerCase().includes(lowerQ)) ||
          (p.school && p.school.toLowerCase().includes(lowerQ))
        ));
        setProducts(productsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))
          .filter((p: any) => p.status !== 'sold')
          .filter(p => 
            (p.title && p.title.toLowerCase().includes(lowerQ)) || 
            (p.category && p.category.toLowerCase().includes(lowerQ)) ||
            (p.sellerName && p.sellerName.toLowerCase().includes(lowerQ)) ||
            (p.tags && p.tags.some((tag: string) => tag.toLowerCase().includes(lowerQ)))
          )
        );
        setClubs(clubsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter(c => 
          (c.name && c.name.toLowerCase().includes(lowerQ)) || 
          (c.description && c.description.toLowerCase().includes(lowerQ)) ||
          (c.school && c.school.toLowerCase().includes(lowerQ)) ||
          (c.city && c.city.toLowerCase().includes(lowerQ))
        ));
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    };

    const debounceTimer = setTimeout(() => {
      performSearch();
    }, 400); // 400ms debounce (slightly longer to reduce rapid-fire queries)

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, suggestionsFetched, suggestedUsers, suggestedPosts, suggestedProducts, suggestedClubs]);

  const toggleFollow = async (e: React.MouseEvent, targetId: string) => {
    e.preventDefault();
    if (!user) {
      window.location.href = '/login';
      return;
    }
    if (!userData?.verified) {
      showToast('You must be verified to follow users.', 'error');
      return;
    }
    if (followingIds.has(targetId)) {
      await unfollowUser(user.uid, targetId);
    } else {
      await followUser(user.uid, targetId);
    }
  };

  const handleJoinClub = async (e: React.MouseEvent, clubId: string) => {
    e.preventDefault();
    if (!user) {
      window.location.href = '/login';
      return;
    }
    if (!userData?.verified) {
      showToast('You must be verified to join clubs.', 'error');
      return;
    }
    try {
      await joinClub(user.uid, clubId);
      showToast('Welcome to the club!', 'success');
      const updateList = (list: any[]) =>
        list.map((c) =>
          c.id === clubId
            ? { ...c, memberIds: [...(c.memberIds || []), user.uid], memberCount: (c.memberCount || 0) + 1 }
            : c
        );
      setClubs(updateList);
      setSuggestedClubs(updateList);
    } catch (err) {
      showToast('Failed to join club', 'error');
    }
  };

  return (
    <div className="pt-6 pb-20 px-4 md:px-0 max-w-2xl mx-auto w-full min-h-screen flex flex-col">
      <Helmet>
        <title>Search | Nextbench</title>
      </Helmet>

      {/* Search Header */}
      <div className="sticky top-0 z-40 nav-glass border-b pt-2 sm:pt-4 pb-4 px-2 sm:px-6 mb-6" style={{ borderColor: 'var(--color-border)' }}>
        <div className="relative w-full mb-4">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-luxury-ink/40" size={20} />
          <input
            type="text"
            placeholder="Search users, posts, products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface-soft border border-luxury-ink/5 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-brand-teal/20 text-[15px] font-medium transition-all"
            autoFocus
          />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('all')}
            className={`py-2 text-xs font-bold uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'all' ? 'border-luxury-ink text-luxury-ink' : 'border-transparent text-luxury-ink/30 hover:text-luxury-ink/60'}`}
          >
            Top
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 py-2 text-xs font-bold uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'users' ? 'border-brand-teal text-brand-teal' : 'border-transparent text-luxury-ink/30 hover:text-luxury-ink/60'}`}
          >
            <Users size={14} /> Users
          </button>
          <button
            onClick={() => setActiveTab('clubs')}
            className={`flex items-center gap-2 py-2 text-xs font-bold uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'clubs' ? 'border-brand-mint text-brand-mint' : 'border-transparent text-luxury-ink/30 hover:text-luxury-ink/60'}`}
          >
            <Globe size={14} /> Clubs
          </button>
          <button
            onClick={() => setActiveTab('posts')}
            className={`flex items-center gap-2 py-2 text-xs font-bold uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'posts' ? 'border-brand-pink text-brand-pink' : 'border-transparent text-luxury-ink/30 hover:text-luxury-ink/60'}`}
          >
            <Grid3X3 size={14} /> Posts
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`flex items-center gap-2 py-2 text-xs font-bold uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'products' ? 'border-amber-500 text-amber-500' : 'border-transparent text-luxury-ink/30 hover:text-luxury-ink/60'}`}
          >
            <Package size={14} /> Marketplace
          </button>
        </div>
      </div>

      {/* Results Content */}
      <div className="flex-1 flex flex-col gap-8">
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            
            {/* USERS */}
            {(activeTab === 'all' || activeTab === 'users') && users.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="theme-card rounded-2xl p-5 luxury-shadow">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-serif font-bold italic text-luxury-ink">People</h3>
                  {activeTab === 'all' && users.length > 3 && (
                    <button onClick={() => setActiveTab('users')} className="text-xs font-bold text-brand-teal uppercase tracking-widest flex items-center gap-1 hover:opacity-80">
                      See all <ArrowRight size={14} />
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-4">
                  {(activeTab === 'all' ? users.slice(0, 3) : users).map((u) => {
                    const isFollowing = followingIds.has(u.id);
                    return (
                      <Link key={u.id || u.uid || Math.random()} to={`/profile/${u.id || u.uid}`} className="flex items-center justify-between group p-2 hover:bg-surface-soft rounded-xl transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-12 h-12 rounded-full bg-brand-teal/10 flex items-center justify-center text-brand-teal font-bold text-lg shrink-0 overflow-hidden border border-brand-teal/5">
                            {u.profilePicture ? (
                              <img src={getOptimizedImageUrl(u.profilePicture)} alt="" className="w-full h-full object-cover" />
                            ) : u.name?.[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0 pr-2">
                            <p className="text-sm font-bold text-luxury-ink truncate group-hover:text-brand-teal transition-colors">{u.name}</p>
                            {u.username && (
                              <p className="text-[11px] text-luxury-ink/50 truncate">@{u.username}</p>
                            )}
                            <p className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/40 truncate">
                              {u.school}
                              {userData?.school && u.school === userData.school && (
                                <span className="ml-1 text-brand-teal">· Same school</span>
                              )}
                            </p>
                          </div>
                        </div>
                        {user?.uid !== u.id && (
                          <button
                            onClick={(e) => toggleFollow(e, u.id)}
                            className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shrink-0 ${
                              isFollowing 
                                ? 'bg-surface-soft text-luxury-ink/40 hover:bg-red-50 hover:text-red-500' 
                                : 'bg-luxury-ink text-surface-base hover:bg-luxury-ink/80 shadow-md'
                            }`}
                          >
                            {isFollowing ? 'Following' : 'Follow'}
                          </button>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* CLUBS */}
            {(activeTab === 'all' || activeTab === 'clubs') && clubs.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="theme-card rounded-2xl p-5 luxury-shadow">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-serif font-bold italic text-luxury-ink">Clubs</h3>
                  {activeTab === 'all' && clubs.length > 3 && (
                    <button onClick={() => setActiveTab('clubs')} className="text-xs font-bold text-brand-mint uppercase tracking-widest flex items-center gap-1 hover:opacity-80">
                      See all <ArrowRight size={14} />
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-4">
                  {(activeTab === 'all' ? clubs.slice(0, 3) : clubs).map((c) => {
                    const isMember = user && c.memberIds?.includes(user.uid);
                    return (
                      <Link
                        key={c.id}
                        to={isMember ? `/club/${c.id}` : `/club/join/${c.inviteCode}`}
                        className="flex items-center justify-between group p-2 hover:bg-surface-soft rounded-xl transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-12 h-12 rounded-xl bg-brand-mint/10 flex items-center justify-center text-brand-mint font-bold text-lg shrink-0 overflow-hidden border border-brand-mint/5">
                            {c.avatar ? (
                              <img src={getOptimizedImageUrl(c.avatar)} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Users size={20} className="text-brand-mint" />
                            )}
                          </div>
                          <div className="min-w-0 pr-2">
                            <p className="text-sm font-bold text-luxury-ink truncate group-hover:text-brand-mint transition-colors">{c.name}</p>
                            <p className="text-[11px] text-luxury-ink/50 truncate">{c.description || 'No description'}</p>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/40 truncate">
                              {c.memberCount || 0} member{(c.memberCount || 0) !== 1 ? 's' : ''} {c.school ? `• ${c.school}` : ''}
                            </p>
                          </div>
                        </div>
                        {isMember ? (
                          <span className="px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-brand-mint/10 text-brand-mint group-hover:bg-brand-mint group-hover:text-white transition-all">
                            Chat
                          </span>
                        ) : (
                          <button
                            onClick={(e) => handleJoinClub(e, c.id)}
                            className="px-4 py-2 rounded-xl text-[10px] font: bold uppercase tracking-widest transition-all shrink-0 bg-luxury-ink text-surface-base hover:bg-brand-mint hover:text-white shadow-md font-bold"
                          >
                            Join
                          </button>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* POSTS */}
            {(activeTab === 'all' || activeTab === 'posts') && posts.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {activeTab === 'all' && (
                  <div className="flex items-center justify-between mb-4 px-2">
                    <h3 className="text-lg font-serif font-bold italic text-luxury-ink">Community Posts</h3>
                  </div>
                )}
                <div className="flex flex-col gap-6 w-full">
                  {(activeTab === 'all' ? posts.slice(0, 3) : posts).map((p) => (
                    <PostCard 
                      key={`search-post-${p.id}`} 
                      post={p as any} 
                      hasUpvoted={upvotedPostIds.has(p.id)}
                      onClick={() => navigate(`/community?postId=${p.id}`)}
                    />
                  ))}
                </div>
              </motion.div>
            )}

            {/* PRODUCTS */}
            {(activeTab === 'all' || activeTab === 'products') && products.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {activeTab === 'all' && (
                  <div className="flex items-center justify-between mb-4 px-2 mt-4">
                    <h3 className="text-lg font-serif font-bold italic text-luxury-ink">Marketplace</h3>
                  </div>
                )}
                <div className="flex flex-col gap-6 w-full">
                  {(activeTab === 'all' ? products.slice(0, 3) : products).map((p) => (
                    <ProductCard key={`search-prod-${p.id}`} product={p as any} isWishlisted={false} wishlistDocId={undefined} />
                  ))}
                </div>
              </motion.div>
            )}

            {/* Empty States */}
            {!loading && users.length === 0 && posts.length === 0 && products.length === 0 && clubs.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-20 text-center">
                <SearchIcon size={48} className="mx-auto text-luxury-ink/10 mb-4" />
                <p className="text-luxury-ink/40 font-serif italic text-xl">No results found for "{searchQuery}"</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30 mt-2">Try searching for a user, school, or item</p>
              </motion.div>
            )}

          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
