import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Copy, Check, Users, Gift, Loader2 } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { db } from '../../lib/firebase';
import { doc, getDoc, collection, getCountFromServer, updateDoc, query, where, getDocs, limit, serverTimestamp } from 'firebase/firestore';
import { useToast } from '../../lib/ToastContext';

export default function Invite() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralCount, setReferralCount] = useState<number>(0);
  const [referredUsers, setReferredUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchReferralData = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'users', user.uid));
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.referralCode) setReferralCode(data.referralCode);
        }
        const coll = collection(db, 'users', user.uid, 'referrals');
        const countSnap = await getCountFromServer(coll);
        setReferralCount(countSnap.data().count);

        const referralsSnap = await getDocs(query(coll, limit(50)));
        const usersList: any[] = [];
        for (const d of referralsSnap.docs) {
          const uDoc = await getDoc(doc(db, 'users', d.id));
          if (uDoc.exists()) {
            usersList.push({ id: uDoc.id, ...uDoc.data(), joinedAt: d.data().timestamp });
          }
        }
        // sort by most recent joined
        usersList.sort((a, b) => (b.joinedAt?.toMillis() || 0) - (a.joinedAt?.toMillis() || 0));
        setReferredUsers(usersList);
      } catch (err) {
        console.error("Error fetching referral data", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchReferralData();
  }, [user?.uid]);

  const generateCode = async () => {
    if (!user) return;
    setIsGenerating(true);
    try {
      let uniqueCode = '';
      let isUnique = false;
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      
      while (!isUnique) {
        let code = '';
        for (let i = 0; i < 8; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        const q = query(collection(db, 'users'), where('referralCode', '==', code), limit(1));
        const snap = await getDocs(q);
        if (snap.empty) {
          uniqueCode = code;
          isUnique = true;
        }
      }
      
      await updateDoc(doc(db, 'users', user.uid), { 
        referralCode: uniqueCode,
        updatedAt: serverTimestamp()
      });
      setReferralCode(uniqueCode);
      showToast('Referral code generated successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to generate referral code', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const inviteLink = referralCode ? `${window.location.origin}?ref=${referralCode}` : '';

  const copyToClipboard = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    showToast('Invite link copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="p-8 lg:p-12 max-w-4xl mx-auto flex justify-center items-center h-64">
        <Loader2 className="animate-spin text-brand-teal" size={32} />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-12 max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="inline-block px-3 py-1 bg-brand-teal/10 text-brand-teal text-[11px] font-bold uppercase tracking-[0.2em] mb-4 rounded-full">
          Refer & Earn
        </div>
        <h1 className="text-3xl font-light text-luxury-ink mb-2">Invite Friends</h1>
        <p className="text-sm text-luxury-ink/60">
          Share your unique referral link to invite your friends to Nextbench. Build your campus network.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-surface-card border border-luxury-ink/5 rounded-2xl p-6 shadow-sm flex flex-col items-center text-center"
        >
          <div className="w-16 h-16 bg-brand-teal/10 rounded-full flex items-center justify-center mb-4">
            <Gift className="text-brand-teal w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-luxury-ink mb-2">Your Invite Link</h2>
          
          {referralCode ? (
            <div className="w-full mt-4">
              <div className="bg-surface-base border border-brand-teal/20 rounded-xl p-4 flex items-center justify-between gap-3 mb-4">
                <span className="text-sm font-medium text-luxury-ink truncate">{inviteLink}</span>
                <button
                  onClick={copyToClipboard}
                  className="shrink-0 p-2 bg-brand-teal/10 text-brand-teal rounded-lg hover:bg-brand-teal hover:text-white transition-colors"
                >
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                </button>
              </div>
              <p className="text-xs text-luxury-ink/40 font-bold uppercase tracking-widest">
                Code: {referralCode}
              </p>
            </div>
          ) : (
            <div className="w-full mt-4">
              <p className="text-sm text-luxury-ink/50 mb-6">
                You don't have a referral link yet. Generate one to start inviting!
              </p>
              <button
                onClick={generateCode}
                disabled={isGenerating}
                className="w-full py-4 bg-brand-teal text-white rounded-xl font-bold text-xs uppercase tracking-widest flex justify-center items-center gap-2 hover:bg-brand-teal/90 transition-colors disabled:opacity-50"
              >
                {isGenerating && <Loader2 size={16} className="animate-spin" />}
                Generate My Link
              </button>
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-surface-card border border-luxury-ink/5 rounded-2xl p-6 shadow-sm flex flex-col justify-center items-center text-center"
        >
          <div className="w-16 h-16 bg-brand-pink/10 rounded-full flex items-center justify-center mb-4">
            <Users className="text-brand-pink w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-luxury-ink mb-2">Referrals</h2>
          <p className="text-sm text-luxury-ink/60 mb-6">
            Number of friends who joined using your link.
          </p>
          <div className="text-6xl font-light text-brand-pink">
            {referralCount}
          </div>
        </motion.div>
      </div>

      {referredUsers.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-12"
        >
          <h3 className="text-sm font-bold text-luxury-ink mb-6 uppercase tracking-widest">People You've Invited</h3>
          <div className="bg-surface-card border border-luxury-ink/5 rounded-2xl overflow-hidden shadow-sm">
            {referredUsers.map((ru, idx) => (
              <div 
                key={ru.id} 
                className={`flex items-center justify-between p-4 ${idx !== referredUsers.length - 1 ? 'border-b border-luxury-ink/5' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-surface-base border border-luxury-ink/10 flex items-center justify-center overflow-hidden shrink-0">
                    {ru.profilePicture ? (
                      <img src={ru.profilePicture} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="font-bold text-luxury-ink/50 text-sm">{ru.name?.charAt(0)}</span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-luxury-ink">{ru.name}</p>
                    <p className="text-[10px] text-luxury-ink/50 uppercase tracking-widest">{ru.school}</p>
                  </div>
                </div>
                {ru.joinedAt && (
                  <span className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/60 bg-brand-teal/5 px-2 py-1 rounded-md">
                    Joined {ru.joinedAt.toDate().toLocaleDateString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
