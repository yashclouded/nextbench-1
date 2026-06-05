import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { BarChart3, Check, Clock } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { getOptimizedImageUrl } from '../../lib/utils';

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

export default function PollDisplay({ postId, poll, compact = false }: PollDisplayProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [voting, setVoting] = useState(false);
  const [localVotes, setLocalVotes] = useState<Record<string, number>>(poll.votes || {});

  useEffect(() => {
    setLocalVotes(poll.votes || {});
  }, [poll.votes]);

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
    if (!user || hasVoted || isExpired || voting) return;
    setVoting(true);
    try {
      const newVotes = { ...localVotes, [user.uid]: choiceIndex };
      setLocalVotes(newVotes);
      await updateDoc(doc(db, 'posts', postId), {
        'poll.votes': newVotes,
      });
    } catch (err) {
      setLocalVotes(poll.votes || {});
      showToast('Failed to vote. Please try again.', 'error');
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
            disabled={hasVoted || isExpired || voting}
            className={`relative w-full text-left rounded-xl overflow-hidden transition-all ${
              showResults
                ? 'cursor-default'
                : 'cursor-pointer hover:border-brand-teal'
            } border ${
              userVote === i
                ? 'border-brand-teal bg-brand-teal/5'
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
        </div>
      </div>
    </div>
  );
}
