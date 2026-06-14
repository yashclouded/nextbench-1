import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BarChart3, Check, Clock, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { getOptimizedImageUrl } from '../../lib/utils';
import { Link } from 'react-router-dom';

interface PollData {
  choices: string[];
  expiresAt: any;
  votes: Record<string, number>;
}

interface PollDisplayProps {
  postId: string;
  poll: PollData;
  compact?: boolean;
}

function voterProfileUrl(voter: { userId: string; username?: string }): string {
  return voter.username ? `/u/${voter.username}` : `/profile/${voter.userId}`;
}

export default function PollDisplay({ postId, poll, compact = false }: PollDisplayProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [voting, setVoting] = useState(false);
  const [showVoters, setShowVoters] = useState(false);
  const [voterProfiles, setVoterProfiles] = useState<Record<string, { name: string; username?: string; profilePicture?: string }>>({});
  const [loadingVoters, setLoadingVoters] = useState(false);
  const [localVotes, setLocalVotes] = useState<Record<string, number>>(poll.votes || {});

  useEffect(() => {
    setLocalVotes(poll.votes || {});
  }, [poll.votes]);

  useEffect(() => {
    if (!showVoters) return;

    const fetchVoters = async () => {
      const userIds = Object.keys(localVotes);
      if (userIds.length === 0) return;

      const missingUids = userIds.filter(uid => !voterProfiles[uid]);
      if (missingUids.length === 0) return;

      setLoadingVoters(true);
      try {
        const newProfiles = { ...voterProfiles };
        await Promise.all(
          missingUids.map(async (uid) => {
            try {
              const userDoc = await getDoc(doc(db, 'users', uid));
              if (userDoc.exists()) {
                const data = userDoc.data();
                newProfiles[uid] = {
                  name: data.name || 'Anonymous User',
                  username: data.username || undefined,
                  profilePicture: data.profilePicture || undefined
                };
              } else {
                newProfiles[uid] = { name: 'Unknown User' };
              }
            } catch (e) {
              console.error('Error fetching voter profile:', e);
              newProfiles[uid] = { name: 'Unknown User' };
            }
          })
        );
        setVoterProfiles(newProfiles);
      } catch (err) {
        console.error('Error in fetchVoters:', err);
      } finally {
        setLoadingVoters(false);
      }
    };

    fetchVoters();
  }, [localVotes, showVoters]);

  const userVote = user?.uid ? localVotes[user.uid] : undefined;
  const hasVoted = userVote !== undefined;
  const totalVotes = Object.keys(localVotes).length;

  // Check if poll expired
  const expiresAt = poll.expiresAt?.toDate ? poll.expiresAt.toDate() : (poll.expiresAt instanceof Date ? poll.expiresAt : new Date(poll.expiresAt));
  const isExpired = expiresAt < new Date();

  const getTimeRemaining = () => {
    const now = new Date();
    const diff = expiresAt.getTime() - now.getTime();
    if (diff <= 0) return 'Poll ended';
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h ${mins}m left`;
    return `${mins}m left`;
  };

  const handleVote = async (choiceIndex: number) => {
    if (!user || isExpired || voting) return;
    setVoting(true);
    try {
      let newVotes: Record<string, number>;
      if (userVote === choiceIndex) {
        // Same option → unvote
        newVotes = { ...localVotes };
        delete newVotes[user.uid];
        showToast('Vote removed.', 'info');
      } else {
        // New option or first vote
        newVotes = { ...localVotes, [user.uid]: choiceIndex };
        if (hasVoted) showToast('Vote changed!', 'success');
      }
      setLocalVotes(newVotes);
      await updateDoc(doc(db, 'posts', postId), { 'poll.votes': newVotes });
    } catch (err) {
      setLocalVotes(poll.votes || {});
      showToast('Failed to update vote. Please try again.', 'error');
    } finally {
      setVoting(false);
    }
  };

  const getVoteCount = (index: number) => Object.values(localVotes).filter(v => v === index).length;
  const getPercentage = (index: number) => totalVotes === 0 ? 0 : Math.round((getVoteCount(index) / totalVotes) * 100);

  const showResults = hasVoted || isExpired;

  return (
    <div className={`${compact ? 'mt-3 mb-1' : 'mt-4 mb-6'}`} onClick={(e) => e.stopPropagation()}>
      <div className="space-y-2">
        {poll.choices.map((choice, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleVote(i)}
            disabled={isExpired || voting}
            className={`relative w-full text-left rounded-xl overflow-hidden transition-all ${
              isExpired
                ? 'cursor-default'
                : 'cursor-pointer hover:border-brand-teal'
            } border ${
              userVote === i
                ? 'border-brand-teal bg-brand-teal/5 hover:bg-brand-pink/5 hover:border-brand-pink'
                : 'border-luxury-ink/10 hover:bg-surface-soft/50'
            } ${compact ? 'py-2 px-3' : 'py-2.5 px-4'}`}
          >
            {/* Result bar background */}
            {showResults && (
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${getPercentage(i)}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className={`absolute inset-y-0 left-0 rounded-xl ${
                  userVote === i ? 'bg-brand-teal/15' : 'bg-luxury-ink/5'
                }`}
              />
            )}
            <div className="relative flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {showResults && userVote === i && (
                  <div className="w-5 h-5 rounded-full bg-brand-teal flex items-center justify-center shrink-0">
                    <Check size={12} className="text-white" />
                  </div>
                )}
                <span className={`${compact ? 'text-[13px]' : 'text-[14px]'} font-semibold text-luxury-ink truncate ${
                  userVote === i ? 'text-brand-teal' : ''
                }`}>
                  {choice}
                </span>
              </div>
              {showResults && (
                <span className={`text-[13px] font-bold shrink-0 ${userVote === i ? 'text-brand-teal' : 'text-luxury-ink/40'}`}>
                  {getPercentage(i)}%
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className={`flex items-center justify-between ${compact ? 'mt-2' : 'mt-3'} flex-wrap gap-2`}>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-[12px] font-semibold text-luxury-ink/40">
            <BarChart3 size={12} /> {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1 text-[12px] font-semibold text-luxury-ink/40">
            <Clock size={12} /> {getTimeRemaining()}
          </span>
          {hasVoted && !isExpired && (
            <span className="text-[11px] text-luxury-ink/30 italic">Tap to change or unvote</span>
          )}
        </div>
        {showResults && totalVotes > 0 && (
          <button
            type="button"
            onClick={() => setShowVoters(!showVoters)}
            className="flex items-center gap-1 text-[12px] font-semibold text-brand-teal hover:text-brand-teal/80 transition-colors"
          >
            <Users size={12} /> See voters
            {showVoters ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
      </div>

      {/* Voters Breakdown */}
      <AnimatePresence>
        {showVoters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            {loadingVoters && Object.keys(voterProfiles).length === 0 ? (
              <div className="mt-3 p-4 rounded-xl bg-surface-base/80 border border-luxury-ink/5 flex items-center justify-center gap-2 text-[12px] font-semibold text-luxury-ink/40">
                <div className="w-4 h-4 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
                <span>Loading voters...</span>
              </div>
            ) : (
              <div className="mt-3 p-4 rounded-xl bg-surface-base/80 border border-luxury-ink/5 space-y-4">
                {poll.choices.map((choice, i) => {
                  const votersForOption = Object.entries(localVotes)
                    .filter(([_, v]) => v === i)
                    .map(([userId]) => ({ userId, ...voterProfiles[userId] }));

                  return (
                    <div key={i} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-bold text-luxury-ink/65 uppercase tracking-wider">
                          Option {i + 1}: {choice}
                        </span>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-luxury-ink/5 text-luxury-ink/50">
                          {votersForOption.length} vote{votersForOption.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      
                      {votersForOption.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 pt-1 pb-2">
                          {votersForOption.map((voter) => (
                            <Link
                              key={voter.userId}
                              to={voterProfileUrl(voter)}
                              onClick={(e) => e.stopPropagation()}
                              className="relative group cursor-pointer"
                            >
                              {voter.profilePicture ? (
                                <img
                                  src={voter.profilePicture}
                                  alt={voter.name || 'User'}
                                  className="w-7 h-7 rounded-full object-cover border-2 border-surface-base shadow-sm transition-transform group-hover:scale-110"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-brand-teal/10 text-brand-teal flex items-center justify-center text-[11px] font-bold border-2 border-surface-base shadow-sm transition-transform group-hover:scale-110">
                                  {voter.name ? voter.name.charAt(0).toUpperCase() : '?'}
                                </div>
                              )}
                              {/* Tooltip */}
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 bg-luxury-ink text-surface-base text-[11px] font-bold rounded-md opacity-0 group-hover:opacity-100 transition-all scale-95 group-hover:scale-100 whitespace-nowrap pointer-events-none z-10 shadow-lg">
                                {voter.name || 'Loading...'}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-luxury-ink"></div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[12px] text-luxury-ink/30 italic pl-1">No votes for this option yet</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
