import React, { useMemo } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { useFollowingIds, followUser, unfollowUser } from '../../lib/follows';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { getOptimizedImageUrl } from '../../lib/utils';
import { useToast } from '../../lib/ToastContext';
import { useAllBlockedUserIds } from '../../lib/blocks';
import TrendingSidebar from './TrendingSidebar';
import { getSuggestedUsers } from '../../lib/discovery';
import { useQuery } from '@tanstack/react-query';

interface SuggestedUser {
  id: string;
  name: string;
  school: string;
  profilePicture?: string;
  verified?: boolean;
  mutualCount?: number;
  mutualFriends?: { id: string; name: string }[];
}

export default function SuggestedUsers() {
  const { user, userData } = useAuth();
  const { showToast } = useToast();
  const { followingIds } = useFollowingIds();
  const allBlockedIds = useAllBlockedUserIds();
  const { data: suggestionsRaw, isLoading: loading } = useQuery({
    queryKey: ['suggestedUsers', user?.uid],
    queryFn: () => getSuggestedUsers(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const suggestions = useMemo(() => {
    if (!suggestionsRaw) return [];
    return (suggestionsRaw as SuggestedUser[]).filter(u => !allBlockedIds.has(u.id));
  }, [suggestionsRaw, allBlockedIds]);

  const toggleFollow = async (e: React.MouseEvent, targetId: string) => {
    e.preventDefault();
    if (!user) return;
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

  if (!user) {
    return (
      <div className="pt-8 px-5 sticky top-0 h-screen overflow-y-auto no-scrollbar hidden lg:block">
        <div className="p-4 text-center">
          <h3 className="text-sm font-semibold text-luxury-ink mb-2">Join the Community</h3>
          <p className="text-xs text-luxury-ink/50 mb-4">Log in to follow students from your school and see personalized suggestions.</p>
          <Link to="/login" className="block w-full py-2.5 bg-brand-teal text-white rounded-xl font-semibold text-sm hover:bg-brand-teal/90 transition-all">
            Log In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-8 pl-4 pr-6 pb-20">
      {((!loading && suggestions.length > 0) || loading) && (
        <div className="mb-6 bg-surface-elevated rounded-2xl border border-luxury-ink/5 p-5">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[14px] font-bold text-luxury-ink">Suggested for you</h3>
        </div>
        <div className="flex flex-col gap-4">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-luxury-ink/5 shrink-0" />
                <div className="flex-1">
                  <div className="h-3 bg-luxury-ink/5 rounded w-24 mb-1.5" />
                  <div className="h-2.5 bg-luxury-ink/5 rounded w-16" />
                </div>
                <div className="w-8 h-8 rounded-lg bg-luxury-ink/5 shrink-0" />
              </div>
            ))
          ) : (
            suggestions.map(suggestion => {
              const isFollowing = followingIds.has(suggestion.id);
              return (
                <Link key={suggestion.id} to={`/profile/${suggestion.id}`} className="flex items-center justify-between group">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-full bg-surface-soft flex items-center justify-center text-brand-teal font-semibold text-sm shrink-0 overflow-hidden">
                    {suggestion.profilePicture ? (
                      <img src={getOptimizedImageUrl(suggestion.profilePicture)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : suggestion.name[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 pr-2">
                    <p className="text-[13px] font-semibold text-luxury-ink truncate group-hover:text-brand-teal transition-colors flex items-center gap-1">
                      {suggestion.name}
                      {suggestion.verified && <ShieldCheck size={12} className="text-brand-teal"  />}
                    </p>
                    <p className="text-[11px] text-luxury-ink/40 truncate">
                      {suggestion.mutualCount && suggestion.mutualFriends && suggestion.mutualFriends.length > 0 ? (
                        <>
                          Followed by <span className="font-bold text-luxury-ink/60">{suggestion.mutualFriends[0]?.name.split(' ')[0]}</span>
                          {suggestion.mutualCount === 2 && suggestion.mutualFriends[1] && (
                            <> and <span className="font-bold text-luxury-ink/60">{suggestion.mutualFriends[1]?.name.split(' ')[0]}</span></>
                          )}
                          {suggestion.mutualCount > 2 && (
                            <> + {suggestion.mutualCount - 1} more</>
                          )}
                        </>
                      ) : suggestion.school}
                    </p>
                  </div>
                </div>
                <button
                  onClick={(e) => toggleFollow(e, suggestion.id)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all shrink-0 ${
                    isFollowing 
                      ? 'bg-luxury-ink/5 text-luxury-ink/50 hover:text-red-500 hover:bg-red-500/10' 
                      : 'bg-brand-teal/10 text-brand-teal hover:bg-brand-teal/20'
                  }`}
                >
                  {isFollowing ? 'Following' : 'Follow'}
                </button>
              </Link>
            );
          })
        )}
        </div>
      </div>
      )}

      {/* Trending Section */}
      <div className="mb-6 bg-surface-elevated rounded-2xl border border-luxury-ink/5 p-5">
        <TrendingSidebar />
      </div>


      <div className="mt-8 flex flex-wrap gap-x-3 gap-y-1.5 pb-8">
        <Link to="/terms" className="text-[11px] text-luxury-ink/25 hover:text-luxury-ink/40 transition-colors">Terms</Link>
        <Link to="/privacy" className="text-[11px] text-luxury-ink/25 hover:text-luxury-ink/40 transition-colors">Privacy</Link>
        <span className="text-[11px] text-luxury-ink/25">© 2026 Nextbench</span>
      </div>
    </div>
  );
}
