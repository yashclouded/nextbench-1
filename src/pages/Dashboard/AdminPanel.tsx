import { motion } from 'motion/react';
import { ShieldCheck, XCircle, AlertTriangle, Filter, CheckCircle, Trash2, Ban, ChevronRight, Users, Package, Crown, Eye, RefreshCw, IdCard, Camera } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, updateDoc, doc, deleteDoc, serverTimestamp, onSnapshot, getCountFromServer } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { createNotification } from '../../lib/notifications';

interface PendingUser { id: string; name: string; school: string; email: string; verified: boolean; isAdmin: boolean; reputation: number; idCardUrl?: string; selfieUrl?: string; }
interface PendingProduct { id: string; title: string; category: string; price: number; sellerName: string; image: string; description: string; }

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('Verifications');
  const [pendingVerifications, setPendingVerifications] = useState<PendingUser[]>([]);
  const [pendingListings, setPendingListings] = useState<PendingProduct[]>([]);
  const [allUsers, setAllUsers] = useState<PendingUser[]>([]);
  const [stats, setStats] = useState({ totalUsers: 0, verifiedUsers: 0, totalProducts: 0, pendingProducts: 0 });
  const { userData, loading } = useAuth();
  const { showToast } = useToast();

  // Fetch stats
  useEffect(() => {
    if (!userData?.isAdmin) return;
    const fetchStats = async () => {
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        const verifiedSnap = await getDocs(query(collection(db, 'users'), where('verified', '==', true)));
        const productsSnap = await getDocs(collection(db, 'products'));
        const pendingSnap = await getDocs(query(collection(db, 'products'), where('status', '==', 'pending')));
        setStats({
          totalUsers: usersSnap.size, verifiedUsers: verifiedSnap.size,
          totalProducts: productsSnap.size, pendingProducts: pendingSnap.size
        });
      } catch (err) { console.error(err); }
    };
    fetchStats();
  }, [userData]);

  // Fetch data per tab
  useEffect(() => {
    if (!userData?.isAdmin) return;

    if (activeTab === 'Verifications') {
      const fetchPending = async () => {
        try {
          const q = query(collection(db, 'users'), where('verificationStatus', '==', 'pending'));
          const snapshot = await getDocs(q);
          setPendingVerifications(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PendingUser)));
        } catch (err) { handleFirestoreError(err, OperationType.LIST, 'users'); }
      };
      fetchPending();
    } else if (activeTab === 'Listings') {
      const fetchListings = async () => {
        try {
          const q = query(collection(db, 'products'), where('status', '==', 'pending'));
          const snapshot = await getDocs(q);
          setPendingListings(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PendingProduct)));
        } catch (err) { handleFirestoreError(err, OperationType.LIST, 'products'); }
      };
      fetchListings();
    } else if (activeTab === 'Users') {
      const fetchUsers = async () => {
        try {
          const snapshot = await getDocs(collection(db, 'users'));
          setAllUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PendingUser)));
        } catch (err) { handleFirestoreError(err, OperationType.LIST, 'users'); }
      };
      fetchUsers();
    }
  }, [userData, activeTab]);

  const handleApproveUser = async (userId: string, userName: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { verified: true, verificationStatus: 'approved', updatedAt: serverTimestamp() });
      setPendingVerifications(prev => prev.filter(u => u.id !== userId));
      showToast(`${userName} has been verified`, 'success');
      createNotification({ userId, type: 'user_approved', title: 'Welcome to NextBench!', message: 'Your account has been verified. You can now list and reserve items.', link: '/marketplace' });
    } catch (err) { handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`); }
  };

  const handleRejectUser = async (userId: string, userName: string, userEmail: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { verified: false, verificationStatus: 'rejected', updatedAt: serverTimestamp() });
      setPendingVerifications(prev => prev.filter(u => u.id !== userId));
      showToast('User application rejected', 'info');

      // Open email client
      const subject = encodeURIComponent("NextBench Application Rejected");
      const body = encodeURIComponent(`Hi ${userName},\n\nUnfortunately, your application to NextBench has been rejected because your ID card photo was unclear or invalid.\n\nPlease log in to NextBench again and re-upload a clear photo of your official school ID to be verified.\n\nThanks,\nThe NextBench Team`);
      window.location.href = `mailto:${userEmail}?subject=${subject}&body=${body}`;
    } catch (err) { handleFirestoreError(err, OperationType.DELETE, `users/${userId}`); }
  };

  const handleApproveListing = async (productId: string, title: string, sellerId?: string) => {
    try {
      await updateDoc(doc(db, 'products', productId), { status: 'available', updatedAt: serverTimestamp() });
      setPendingListings(prev => prev.filter(p => p.id !== productId));
      showToast(`"${title}" is now live`, 'success');
      // Find sellerId from product
      const pDoc = await getDocs(query(collection(db, 'products'), where('__name__', '==', productId)));
      if (!pDoc.empty) {
        const sid = pDoc.docs[0].data().sellerId;
        if (sid) createNotification({ userId: sid, type: 'listing_approved', title: 'Listing Approved!', message: `"${title}" is now live on the marketplace.`, link: `/product/${productId}` });
      }
    } catch (err) { handleFirestoreError(err, OperationType.UPDATE, `products/${productId}`); }
  };

  const handleRejectListing = async (productId: string, title: string) => {
    try {
      await updateDoc(doc(db, 'products', productId), { status: 'rejected', updatedAt: serverTimestamp() });
      setPendingListings(prev => prev.filter(p => p.id !== productId));
      showToast(`"${title}" rejected`, 'info');
    } catch (err) { handleFirestoreError(err, OperationType.UPDATE, `products/${productId}`); }
  };

  const toggleAdmin = async (userId: string, currentIsAdmin: boolean, name: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { isAdmin: !currentIsAdmin, updatedAt: serverTimestamp() });
      setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, isAdmin: !currentIsAdmin } : u));
      showToast(`${name} ${!currentIsAdmin ? 'promoted to admin' : 'demoted from admin'}`, 'success');
      if (!currentIsAdmin) {
        createNotification({ userId, type: 'admin_promoted', title: 'Admin Access Granted', message: 'You have been promoted to admin. Access the Admin Panel from the footer.', link: '/admin' });
      }
    } catch (err) { handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`); }
  };

  if (loading || !userData?.isAdmin) return <div className="pt-32 text-center text-xs font-bold uppercase tracking-widest text-brand-teal/40">Loading Secure Portal...</div>;

  const tabs = ['Verifications', 'Listings', 'Users', 'Reports'];

  return (
    <div className="pt-32 pb-20 px-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-10">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-teal/10 rounded-full mb-4">
            <ShieldCheck className="text-brand-teal" size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand-teal">Administrative Control</span>
          </div>
          <h1 className="text-5xl font-serif font-bold text-luxury-ink mb-2 italic">NextBench <span className="not-italic">Operations.</span></h1>
          <p className="text-luxury-ink/40 font-medium">Manage verification, trust, and ecosystem safety.</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {[
          { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'text-brand-teal' },
          { label: 'Verified', value: stats.verifiedUsers, icon: ShieldCheck, color: 'text-brand-mint' },
          { label: 'Total Listings', value: stats.totalProducts, icon: Package, color: 'text-brand-pink' },
          { label: 'Pending Review', value: stats.pendingProducts, icon: AlertTriangle, color: 'text-amber-500' },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-2xl p-5 luxury-shadow border border-luxury-ink/5">
            <div className="flex items-center gap-2 mb-2">
              <s.icon size={16} className={`${s.color} opacity-60`} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30">{s.label}</span>
            </div>
            <p className="text-3xl font-serif font-bold text-luxury-ink">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex bg-white rounded-2xl p-1.5 luxury-shadow border border-luxury-ink/5 mb-10 overflow-x-auto no-scrollbar">
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab ? 'bg-luxury-ink text-white luxury-shadow' : 'text-luxury-ink/30 hover:text-luxury-ink/60'
              }`}>{tab}</button>
        ))}
      </div>

      {/* Verifications Tab */}
      {activeTab === 'Verifications' && (
        <div className="space-y-4">
          <h2 className="text-lg font-serif font-bold text-luxury-ink italic mb-4">Pending Verifications <span className="not-italic text-luxury-ink/30">({pendingVerifications.length})</span></h2>
          {pendingVerifications.length === 0 && <div className="bg-white rounded-2xl p-12 text-center luxury-shadow border border-luxury-ink/5 text-luxury-ink/30 font-serif italic text-lg">All users verified ✓</div>}
          {pendingVerifications.map(item => (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={item.id}
              className="bg-white rounded-2xl p-6 luxury-shadow border border-luxury-ink/5 flex flex-col md:flex-row items-center gap-6">
              <div className="w-14 h-14 rounded-xl bg-brand-teal/10 flex items-center justify-center text-xl font-serif font-bold text-brand-teal shrink-0">
                {item.name?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-base font-bold text-luxury-ink mb-1">{item.name}</h3>
                <p className="text-xs font-medium text-luxury-ink/40">{item.school} • {item.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {item.idCardUrl && (
                  <a href={item.idCardUrl} target="_blank" rel="noopener noreferrer" className="p-3 rounded-xl border border-luxury-ink/5 hover:bg-brand-teal/5 hover:text-brand-teal transition-all text-luxury-ink/30" title="View ID Card">
                    <IdCard size={20} />
                  </a>
                )}
                {item.selfieUrl && (
                  <a href={item.selfieUrl} target="_blank" rel="noopener noreferrer" className="p-3 rounded-xl border border-luxury-ink/5 hover:bg-brand-pink/5 hover:text-brand-pink transition-all text-luxury-ink/30" title="View Selfie">
                    <Camera size={20} />
                  </a>
                )}
                <button onClick={() => handleRejectUser(item.id, item.name, item.email)} className="p-3 rounded-xl border border-luxury-ink/5 hover:bg-red-50 hover:text-red-500 transition-all text-luxury-ink/20"><XCircle size={20} /></button>
                <button onClick={() => handleApproveUser(item.id, item.name)} className="p-3 rounded-xl bg-brand-teal text-white hover:bg-brand-mint transition-all shadow-lg"><CheckCircle size={20} /></button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Listings Tab */}
      {activeTab === 'Listings' && (
        <div className="space-y-4">
          <h2 className="text-lg font-serif font-bold text-luxury-ink italic mb-4">Pending Listings <span className="not-italic text-luxury-ink/30">({pendingListings.length})</span></h2>
          {pendingListings.length === 0 && <div className="bg-white rounded-2xl p-12 text-center luxury-shadow border border-luxury-ink/5 text-luxury-ink/30 font-serif italic text-lg">No pending listings ✓</div>}
          {pendingListings.map(item => (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={item.id}
              className="bg-white rounded-2xl p-6 luxury-shadow border border-luxury-ink/5 flex flex-col md:flex-row items-center gap-6">
              <div className="w-20 h-16 rounded-xl overflow-hidden bg-luxury-ink/5 border border-luxury-ink/5 shrink-0">
                {item.image ? <img src={item.image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <span className="text-[10px] font-bold uppercase text-luxury-ink/30 flex items-center justify-center h-full">No img</span>}
              </div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-base font-bold text-luxury-ink mb-1">{item.title}</h3>
                <p className="text-xs font-medium text-luxury-ink/40 mb-2">{item.category} • {item.sellerName}</p>
                <span className="px-3 py-1 bg-brand-teal/5 rounded-full text-[10px] font-bold text-brand-teal uppercase tracking-widest border border-brand-teal/10">₹{item.price}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleRejectListing(item.id, item.title)} className="p-3 rounded-xl border border-luxury-ink/5 hover:bg-red-50 hover:text-red-500 transition-all text-luxury-ink/20"><XCircle size={20} /></button>
                <button onClick={() => handleApproveListing(item.id, item.title)} className="p-3 rounded-xl bg-brand-teal text-white hover:bg-brand-mint transition-all shadow-lg"><CheckCircle size={20} /></button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Users Tab — Role Management */}
      {activeTab === 'Users' && (
        <div className="space-y-4">
          <h2 className="text-lg font-serif font-bold text-luxury-ink italic mb-4">All Users <span className="not-italic text-luxury-ink/30">({allUsers.length})</span></h2>
          {allUsers.map(u => (
            <div key={u.id} className="bg-white rounded-2xl p-5 luxury-shadow border border-luxury-ink/5 flex flex-col md:flex-row items-center gap-5">
              <div className="w-12 h-12 rounded-xl bg-brand-teal/10 flex items-center justify-center text-lg font-serif font-bold text-brand-teal shrink-0">
                {u.name?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1 text-center md:text-left">
                <div className="flex items-center gap-2 mb-0.5 justify-center md:justify-start">
                  <h3 className="font-bold text-luxury-ink text-sm">{u.name}</h3>
                  {u.verified && <ShieldCheck size={14} className="text-brand-teal" />}
                  {u.isAdmin && <Crown size={14} className="text-brand-pink" />}
                </div>
                <p className="text-xs text-luxury-ink/40">{u.email} • {u.school}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/20">Rep: {u.reputation?.toFixed(1)}</span>
                
                {u.idCardUrl && (
                  <a href={u.idCardUrl} target="_blank" rel="noopener noreferrer" className="p-2.5 rounded-lg border border-luxury-ink/5 hover:bg-brand-teal/5 hover:text-brand-teal transition-all text-luxury-ink/30" title="View ID Card">
                    <IdCard size={16} />
                  </a>
                )}
                {u.selfieUrl && (
                  <a href={u.selfieUrl} target="_blank" rel="noopener noreferrer" className="p-2.5 rounded-lg border border-luxury-ink/5 hover:bg-brand-pink/5 hover:text-brand-pink transition-all text-luxury-ink/30" title="View Selfie">
                    <Camera size={16} />
                  </a>
                )}

                <button onClick={() => toggleAdmin(u.id, u.isAdmin, u.name)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${u.isAdmin ? 'bg-brand-pink/10 text-brand-pink hover:bg-red-50 hover:text-red-500 border border-brand-pink/20' : 'bg-luxury-ink/5 text-luxury-ink/30 hover:bg-brand-teal/10 hover:text-brand-teal border border-luxury-ink/5'
                    }`}>
                  {u.isAdmin ? 'Demote' : 'Make Admin'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'Reports' && (
        <div className="bg-white rounded-2xl p-12 text-center luxury-shadow border border-luxury-ink/5 text-luxury-ink/30 font-serif italic text-lg">
          No reports to review.
        </div>
      )}
    </div>
  );
}
