import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Flame, Zap, TrendingUp, Eye, Building2, MessageSquare, Heart, ShoppingBag, Activity } from 'lucide-react';
import { useTrending } from '../../hooks/useTrending';
import { useAuth } from '../../lib/AuthContext';
import { useOnlineCount } from '../../lib/presence';
import { ScoredPost, ScoredProduct, TrendLabel, formatRelativeTime } from '../../lib/trending';
import { getOptimizedImageUrl } from '../../lib/utils';
import { getPersonaDisplay } from '../../lib/confessions';

type Tab = 'school' | 'city';

function TrendBadge({ label }: { label: TrendLabel }) {
  if (!label) return null;

  const config: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    '⚡ Exploding': {
      bg: 'bg-purple-500/10',
      text: 'text-purple-500',
      icon: <Zap size={10} className="fill-purple-500" />,
    },
    '🔥 Heating Up': {
      bg: 'bg-orange-500/10',
      text: 'text-orange-500',
      icon: <Flame size={10} />,
    },
    "👀 Everyone's Watching": {
      bg: 'bg-blue-500/10',
      text: 'text-blue-500',
      icon: <Eye size={10} />,
    },
    '📈 Trending in Your School': {
      bg: 'bg-brand-teal/10',
      text: 'text-brand-teal',
      icon: <TrendingUp size={10} />,
    },
    '🌆 Trending in Your City': {
      bg: 'bg-brand-pink/10',
      text: 'text-brand-pink',
      icon: <Building2 size={10} />,
    },
  };

  const c = config[label] || { bg: 'bg-luxury-ink/5', text: 'text-luxury-ink/60', icon: null };
  const displayText = label.replace(/^[^\s]+\s/, '');

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${c.bg} ${c.text}`}>
      {c.icon}
      {displayText}
    </span>
  );
}

function TrendingPostItem({ post, index }: { key?: React.Key; post: ScoredPost; index: number }) {
  const displayInfo = getPersonaDisplay(post, false);
  return (
    <Link
      to={`/community?postId=${post.id}`}
      className="group flex gap-3 p-3 -mx-3 rounded-xl hover:bg-surface-soft/80 transition-all cursor-pointer"
    >
      <div className="w-6 h-6 rounded-lg bg-luxury-ink/5 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-[11px] font-black text-luxury-ink/30">{index + 1}</span>
      </div>

      <div className="flex-1 min-w-0">
        {post.trendLabel && (
          <div className="mb-1.5">
            <TrendBadge label={post.trendLabel} />
          </div>
        )}
        <h4 className="text-[13px] font-bold text-luxury-ink leading-snug line-clamp-2 group-hover:text-brand-teal transition-colors">
          {post.title}
        </h4>
        <div className="flex items-center gap-1.5 mt-1.5">
          <div className="w-4 h-4 rounded-full bg-brand-pink/10 flex items-center justify-center overflow-hidden shrink-0">
            {!displayInfo.isAnonymous && displayInfo.profilePicture ? (
              <img
                src={getOptimizedImageUrl(displayInfo.profilePicture)}
                alt=""
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="text-[7px] font-bold text-brand-pink">
                {displayInfo.name[0]?.toUpperCase()}
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold text-luxury-ink/40 truncate">
            {displayInfo.name}
          </span>
          <span className="text-luxury-ink/15 text-[10px]">·</span>
          <span className="text-[10px] font-bold text-luxury-ink/25 truncate">
            {displayInfo.school}
          </span>
        </div>
        <div className="flex items-center gap-4 mt-2 text-luxury-ink/30">
          <span className="flex items-center gap-1 text-[10px] font-bold">
            <Heart size={10} /> {post.upvotesCount || 0}
          </span>
          <span className="flex items-center gap-1 text-[10px] font-bold">
            <MessageSquare size={10} /> {post.repliesCount || 0}
          </span>
          <span className="text-[10px] font-bold ml-auto text-luxury-ink/20">
            {formatRelativeTime(post.createdAt)}
          </span>
        </div>
      </div>

      {(post.imageUrls?.[0] || post.imageUrl) && (
        <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 mt-0.5 bg-luxury-ink/5">
          <img
            src={getOptimizedImageUrl(post.imageUrls?.[0] || post.imageUrl || '')}
            alt=""
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
      )}
    </Link>
  );
}

function TrendingProductItem({ product }: { product: ScoredProduct }) {
  return (
    <Link
      to={`/product/${product.id}`}
      className="group flex items-center gap-3 p-3 -mx-3 rounded-xl hover:bg-surface-soft/80 transition-all"
    >
      <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-luxury-ink/5 border border-luxury-ink/5">
        {product.image ? (
          <img
            src={getOptimizedImageUrl(product.image)}
            alt=""
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingBag size={16} className="text-luxury-ink/20" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-bold text-luxury-ink truncate group-hover:text-brand-teal transition-colors">
          {product.title}
        </p>
        <p className="text-[11px] font-bold text-brand-pink">₹{product.price}</p>
        <p className="text-[9px] font-bold uppercase tracking-widest text-luxury-ink/25 truncate">
          {product.sellerSchool}
        </p>
      </div>
    </Link>
  );
}

export default function TrendingSidebar() {
  const { user, userData } = useAuth();
  const { schoolTrending, cityTrending, trendingProduct, loading } = useTrending();
  const onlineCount = useOnlineCount(user?.uid);
  const [activeTab, setActiveTab] = useState<Tab>('school');

  if (!userData) return null;

  const currentTrending = activeTab === 'school' ? schoolTrending : cityTrending;
  const isEmpty = currentTrending.length === 0 && !trendingProduct;

  return (
    <div className="mt-6">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-luxury-ink flex items-center gap-2">
          <Flame size={16} className="text-orange-500" />
          Trending Now
        </h3>
        {/* Live online count */}
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <span className="text-[10px] font-bold text-green-600/70">
            {`${Math.max(1, onlineCount)} online now`}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-surface-base mb-4">
        <button
          onClick={() => setActiveTab('school')}
          className={`flex-1 py-2 px-3 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
            activeTab === 'school'
              ? 'bg-luxury-ink text-surface-base shadow-sm'
              : 'text-luxury-ink/40 hover:text-luxury-ink/70'
          }`}
        >
          Your School
        </button>
        <button
          onClick={() => setActiveTab('city')}
          className={`flex-1 py-2 px-3 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
            activeTab === 'city'
              ? 'bg-luxury-ink text-surface-base shadow-sm'
              : 'text-luxury-ink/40 hover:text-luxury-ink/70'
          }`}
        >
          {userData.city || 'Your City'}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-6 h-6 rounded-lg bg-luxury-ink/5 shrink-0" />
              <div className="flex-1">
                <div className="h-3 bg-luxury-ink/5 rounded w-full mb-2" />
                <div className="h-2.5 bg-luxury-ink/5 rounded w-2/3 mb-2" />
                <div className="h-2 bg-luxury-ink/5 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : isEmpty ? (
        <div className="text-center py-6">
          <Activity className="mx-auto text-luxury-ink/10 mb-2" size={24} />
          <p className="text-[11px] font-bold text-luxury-ink/30">
            {activeTab === 'school'
              ? 'No trending posts in your school yet'
              : 'No trending posts in your city yet'}
          </p>
          <p className="text-[10px] text-luxury-ink/20 mt-1">
            Be the first to spark a discussion!
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {currentTrending.map((post, index) => (
            <TrendingPostItem key={post.id} post={post} index={index} />
          ))}
        </div>
      )}

      {/* Trending product */}
      {trendingProduct && (
        <div className="mt-5 pt-4 border-t border-luxury-ink/5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30 mb-3 flex items-center gap-1.5">
            <ShoppingBag size={10} />
            Hot in Marketplace
          </p>
          <TrendingProductItem product={trendingProduct} />
        </div>
      )}

      {/* Context label */}
      <div className="mt-4 pt-3 border-t border-luxury-ink/5">
        <p className="text-[9px] font-bold uppercase tracking-widest text-luxury-ink/15 text-center">
          {activeTab === 'school'
            ? `Trending in ${userData.school}`
            : `Trending in ${userData.city || 'Your City'}`}
        </p>
      </div>
    </div>
  );
}