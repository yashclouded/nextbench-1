import React, { useState, useEffect } from 'react';
import { collection, query, where, limit, getDocs, documentId } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/AuthContext';
import { useFollowingIds, followUser, unfollowUser } from '../../lib/follows';
import { Link } from 'react-router-dom';
import { UserCheck, UserPlus, Users, ArrowRight, ShieldCheck } from 'lucide-react';
import { getOptimizedImageUrl } from '../../lib/utils';
import { useToast } from '../../lib/ToastContext';
import TrendingSidebar from './TrendingSidebar';

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
  const [suggestions, setSuggestions] = useState<SuggestedUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !userData) {
      setLoading(false);
      return;
    }

    const fetchSuggestions = async () => {
      try {
        let fetchedUsers: SuggestedUser[] = [];
        const suggestedIdsSet = new Set<string>();

        // Phase 1: Instagram-style Friends-of-Friends (FoF) Algorithm
        if (followingIds.size > 0) {
          const followingsToQuery = Array.from(followingIds).sort(() => 0.5 - Math.random()).slice(0, 30);
          
          const fofQuery = query(collection(db, 'follows'), where('followerId', 'in', followingsToQuery));
          const fofSnap = await getDocs(fofQuery);
          
          const fofFriends: Record<string, string[]> = {};
          fofSnap.forEach(doc => {
            const potentialId = doc.data().followingId;
            const mutualFriendId = doc.data().followerId;
            if (potentialId !== user.uid && !followingIds.has(potentialId)) {
              if (!fofFriends[potentialId]) fofFriends[potentialId] = [];
              fofFriends[potentialId].push(mutualFriendId);
            }
          });

          const sortedFof = Object.entries(fofFriends)
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, 10)
            .map(entry => entry[0]);

          if (sortedFof.length > 0) {
            const userDocsSnap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', sortedFof)));
            
            // Fetch names of mutual friends
            const mutualsToFetch = new Set<string>();
            userDocsSnap.forEach(doc => {
              const friends = fofFriends[doc.id] || [];
              friends.slice(0, 2).forEach(id => mutualsToFetch.add(id));
            });
            
            const mutualNames: Record<string, string> = {};
            if (mutualsToFetch.size > 0) {
              const mutualDocsSnap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', Array.from(mutualsToFetch))));
              mutualDocsSnap.forEach(doc => {
                mutualNames[doc.id] = doc.data().name || 'User';
              });
            }

            userDocsSnap.forEach(doc => {
              const data = doc.data();
              const friends = fofFriends[doc.id] || [];
              const mutualFriends = friends.slice(0, 2).map(id => ({ id, name: mutualNames[id] || 'User' }));
              
              fetchedUsers.push({
                id: doc.id,
                name: data.name || 'User',
                school: data.school || 'Unknown School',
                profilePicture: data.profilePicture,
                verified: data.verified,
                mutualCount: friends.length,
                mutualFriends: mutualFriends
              });
              suggestedIdsSet.add(doc.id);
            });
            fetchedUsers.sort((a, b) => (b.mutualCount || 0) - (a.mutualCount || 0));
          }
        }

        // Phase 2: Fallback to users from the same school
        if (fetchedUsers.length < 5) {
          const q = query(collection(db, 'users'), where('school', '==', userData.school), limit(15));
          const snapshot = await getDocs(q);
          
          snapshot.forEach(doc => {
            if (doc.id !== user.uid && !followingIds.has(doc.id) && !suggestedIdsSet.has(doc.id)) {
              const data = doc.data();
              fetchedUsers.push({
                id: doc.id,
                name: data.name || 'User',
                school: data.school || 'Unknown School',
                profilePicture: data.profilePicture,
                verified: data.verified
              });
              suggestedIdsSet.add(doc.id);
            }
          });
        }

        // Phase 3: General fallback
        if (fetchedUsers.length < 5) {
          const generalQ = query(collection(db, 'users'), limit(15));
          const generalSnap = await getDocs(generalQ);
          generalSnap.forEach(doc => {
            if (doc.id !== user.uid && !followingIds.has(doc.id) && !suggestedIdsSet.has(doc.id)) {
              const data = doc.data();
              fetchedUsers.push({
                id: doc.id,
                name: data.name || 'User',
                school: data.school || 'Unknown School',
                profilePicture: data.profilePicture,
                verified: data.verified
              });
              suggestedIdsSet.add(doc.id);
            }
          });
        }

        setSuggestions(fetchedUsers.slice(0, 5));
      } catch (error) {
        console.error("Error fetching suggestions:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSuggestions();
  }, [user, userData, followingIds]);

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

  if (!loading && suggestions.length === 0) return null;

  return (
    <div className="pt-8 pl-4 pr-6 pb-20">
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
                      {suggestion.verified && <ShieldCheck size={12} className="text-brand-teal" title="Verified" />}
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
