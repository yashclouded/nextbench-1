import React, { useState, useEffect } from 'react';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/AuthContext';
import { useFollowingIds, followUser, unfollowUser } from '../../lib/follows';
import { Link } from 'react-router-dom';
import { UserCheck, UserPlus } from 'lucide-react';
import { getOptimizedImageUrl } from '../../lib/utils';
import { useToast } from '../../lib/ToastContext';

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
      <div className="pt-8 px-6 sticky top-0 h-screen overflow-y-auto no-scrollbar hidden lg:block border-l border-luxury-ink/5">
        <div className="bg-surface-soft/50 rounded-2xl p-6 border border-luxury-ink/5 text-center">
          <h3 className="text-sm font-bold text-luxury-ink mb-2">Join the Community</h3>
          <p className="text-xs text-luxury-ink/60 mb-4">Log in to follow students from your school and see personalized suggestions.</p>
          <Link to="/login" className="block w-full py-2 bg-brand-teal text-white rounded-full font-bold text-sm hover:bg-brand-teal/90 transition-all">
            Log In
          </Link>
        </div>
      </div>
    );
  }

  if (!loading && suggestions.length === 0) return null;

  return (
    <div className="pt-8 px-6 sticky top-0 h-screen overflow-y-auto no-scrollbar hidden lg:block border-l border-luxury-ink/5">
      <div className="bg-surface-soft/50 rounded-2xl p-6 border border-luxury-ink/5">
        <h3 className="text-sm font-bold text-luxury-ink mb-6">Suggested for you</h3>
        <div className="flex flex-col gap-5">
          {loading ? (
            // Skeleton Loader
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-luxury-ink/5 shrink-0" />
                <div className="flex-1">
                  <div className="h-3.5 bg-luxury-ink/5 rounded w-24 mb-2" />
                  <div className="h-2.5 bg-luxury-ink/5 rounded w-16" />
                </div>
                <div className="w-8 h-8 rounded-xl bg-luxury-ink/5 shrink-0" />
              </div>
            ))
          ) : (
            suggestions.map(suggestion => {
              const isFollowing = followingIds.has(suggestion.id);
              return (
                <Link key={suggestion.id} to={`/profile/${suggestion.id}`} className="flex items-center justify-between group">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-full bg-brand-teal/10 flex items-center justify-center text-brand-teal font-bold text-sm shrink-0 overflow-hidden border border-brand-teal/5">
                    {suggestion.profilePicture ? (
                      <img src={getOptimizedImageUrl(suggestion.profilePicture)} alt="" className="w-full h-full object-cover" />
                    ) : suggestion.name[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 pr-2">
                    <p className="text-[13px] font-bold text-luxury-ink truncate group-hover:text-brand-teal transition-colors">{suggestion.name}</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30 truncate">{suggestion.school}</p>
                  </div>
                </div>
                <button
                  onClick={(e) => toggleFollow(e, suggestion.id)}
                  className={`p-2 rounded-xl transition-all shrink-0 ${
                    isFollowing 
                      ? 'bg-luxury-ink/5 text-luxury-ink/40 hover:bg-red-50 hover:text-red-500' 
                      : 'bg-brand-teal text-white hover:bg-brand-pink shadow-md shadow-brand-teal/20'
                  }`}
                >
                  {isFollowing ? <UserCheck size={16} /> : <UserPlus size={16} />}
                </button>
              </Link>
            );
          })
        )}
        </div>
      </div>
      
      <div className="mt-8 flex flex-wrap gap-x-3 gap-y-2 px-2">
        <Link to="/terms" className="text-[10px] uppercase tracking-widest font-bold text-luxury-ink/20 hover:text-luxury-ink/40 transition-colors">Terms</Link>
        <Link to="/privacy" className="text-[10px] uppercase tracking-widest font-bold text-luxury-ink/20 hover:text-luxury-ink/40 transition-colors">Privacy</Link>
        <span className="text-[10px] uppercase tracking-widest font-bold text-luxury-ink/20">© 2026 Nextbench</span>
      </div>
    </div>
  );
}
