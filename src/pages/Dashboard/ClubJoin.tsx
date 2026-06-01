import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Users, Lock, Globe, ArrowRight, Check, Crown } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useToast } from '../../lib/ToastContext';
import { getOptimizedImageUrl } from '../../lib/utils';
import { joinByInviteCode, type ClubData } from '../../lib/clubs';

export default function ClubJoin() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [club, setClub] = useState<ClubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [alreadyMember, setAlreadyMember] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!inviteCode) return;

    const fetchClub = async () => {
      try {
        const q = query(collection(db, 'clubs'), where('inviteCode', '==', inviteCode));
        const snap = await getDocs(q);

        if (snap.empty) {
          setError(true);
        } else {
          const data = { id: snap.docs[0].id, ...snap.docs[0].data() } as ClubData;
          setClub(data);
          if (user && data.memberIds.includes(user.uid)) {
            setAlreadyMember(true);
          }
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchClub();
  }, [inviteCode, user]);

  const handleJoin = async () => {
    if (!user || !inviteCode || joining) return;
    setJoining(true);

    try {
      const clubId = await joinByInviteCode(user.uid, inviteCode);
      if (clubId) {
        showToast('Welcome to the club!', 'success');
        navigate(`/club/${clubId}`);
      } else {
        showToast('Invalid invite link', 'error');
      }
    } catch {
      showToast('Failed to join club', 'error');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="pt-32 text-center">
        <div className="w-10 h-10 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-luxury-ink/30 text-xs font-bold uppercase tracking-widest">Loading invite...</p>
      </div>
    );
  }

  if (error || !club) {
    return (
      <div className="pt-32 text-center px-6">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-w-sm mx-auto theme-card rounded-3xl p-10 border border-luxury-ink/5"
        >
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Lock className="text-red-400" size={32} />
          </div>
          <h3 className="text-xl font-bold text-luxury-ink mb-2">Invalid Invite</h3>
          <p className="text-luxury-ink/50 text-sm mb-6">This invite link is invalid or has expired.</p>
          <button onClick={() => navigate('/messages')} className="bg-luxury-ink text-surface-base px-6 py-3 rounded-full font-bold text-sm hover:opacity-80 transition-opacity">
            Go to Messages
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="pt-20 pb-20 px-6 max-w-lg mx-auto">
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="theme-card rounded-3xl overflow-hidden border border-luxury-ink/5 shadow-xl"
      >
        {/* Club banner */}
        <div className="h-32 bg-gradient-to-br from-brand-teal/20 via-brand-pink/10 to-brand-teal/5 flex items-end justify-center pb-0 relative">
          <div className="w-20 h-20 rounded-2xl bg-surface-card border-4 border-surface-card flex items-center justify-center overflow-hidden shadow-lg translate-y-10">
            {club.avatar ? (
              <img src={getOptimizedImageUrl(club.avatar)} alt={club.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <Users size={32} className="text-brand-teal" />
            )}
          </div>
        </div>

        <div className="pt-14 px-8 pb-8 text-center">
          <h2 className="text-2xl font-bold text-luxury-ink mb-1">{club.name}</h2>

          <div className="flex items-center justify-center gap-3 mb-4">
            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${club.type === 'public' ? 'bg-brand-teal/10 text-brand-teal' : 'bg-luxury-ink/5 text-luxury-ink/40'}`}>
              {club.type === 'public' ? <><Globe size={10} className="inline mr-1" />Public</> : <><Lock size={10} className="inline mr-1" />Private</>}
            </span>
            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-luxury-ink/5 text-luxury-ink/40">
              <Users size={10} className="inline mr-1" />{club.memberCount} members
            </span>
          </div>

          {club.description && (
            <p className="text-luxury-ink/50 text-sm mb-6 leading-relaxed">{club.description}</p>
          )}

          {alreadyMember ? (
            <button
              onClick={() => navigate(`/club/${club.id}`)}
              className="w-full py-4 bg-brand-teal text-white rounded-full font-bold text-sm hover:bg-brand-pink transition-all shadow-lg flex items-center justify-center gap-2"
            >
              <Check size={18} /> Open Chat
            </button>
          ) : (
            <button
              onClick={handleJoin}
              disabled={joining}
              className="w-full py-4 bg-luxury-ink text-surface-base rounded-full font-bold text-sm hover:bg-brand-teal transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {joining ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>Join Club <ArrowRight size={18} /></>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
