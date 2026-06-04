import React, { useState, useEffect } from 'react';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/AuthContext';
import { useFollowingIds, followUser, unfollowUser } from '../../lib/follows';
import { Link } from 'react-router-dom';
import { UserCheck, UserPlus, Users, ArrowRight } from 'lucide-react';
import { getOptimizedImageUrl } from '../../lib/utils';
import { useToast } from '../../lib/ToastContext';
import TrendingSidebar from './TrendingSidebar';

interface SuggestedUser {
  id: string;
  name: string;
  school: string;
  profilePicture?: string;
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
        // Try to fetch users from the same school first
        let q = query(
          collection(db, 'users'),
          where('school', '==', userData.school),
          limit(10)
        );
        let snapshot = await getDocs(q);
        
        let fetchedUsers: SuggestedUser[] = [];
        snapshot.forEach(doc => {
          if (doc.id !== user.uid && !followingIds.has(doc.id)) {
            const data = doc.data();
            fetchedUsers.push({
              id: doc.id,
              name: data.name || 'User',
              school: data.school || 'Unknown School',
              profilePicture: data.profilePicture
            });
          }
        });

        // If we don't have enough suggestions from the same school, fetch general users
        if (fetchedUsers.length < 5) {
          const generalQ = query(collection(db, 'users'), limit(15));
          const generalSnap = await getDocs(generalQ);
          generalSnap.forEach(doc => {
            if (doc.id !== user.uid && !followingIds.has(doc.id) && !fetchedUsers.find(u => u.id === doc.id)) {
              const data = doc.data();
              fetchedUsers.push({
                id: doc.id,
                name: data.name || 'User',
                school: data.school || 'Unknown School',
                profilePicture: data.profilePicture
              });
            }
          });
        }

        // Shuffle and limit to 5
        fetchedUsers = fetchedUsers.sort(() => 0.5 - Math.random()).slice(0, 5);
        setSuggestions(fetchedUsers);
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
    <div className="pt-8 pl-4 pr-6 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto no-scrollbar">
      <div className="mb-6 bg-surface-elevated rounded-2xl border border-border p-5">
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
                    <p className="text-[13px] font-semibold text-luxury-ink truncate group-hover:text-brand-teal transition-colors">{suggestion.name}</p>
                    <p className="text-[11px] text-luxury-ink/30 truncate">{suggestion.school}</p>
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
      <div className="mb-6 bg-surface-elevated rounded-2xl border border-border p-5">
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
