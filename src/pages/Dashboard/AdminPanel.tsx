import { motion } from 'motion/react';
import { ShieldCheck, XCircle, AlertTriangle, Filter, CheckCircle, Trash2, Ban, ChevronRight, Users, Package, Crown, Eye, RefreshCw, IdCard, Camera, School, FileText, Database, Building2, Globe } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, getDocs, getDoc, updateDoc, doc, deleteDoc, serverTimestamp, onSnapshot, getCountFromServer, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { createNotification } from '../../lib/notifications';
import { getOptimizedImageUrl } from '../../lib/utils';

interface PendingUser { id: string; name: string; school: string; email: string; verified: boolean; isAdmin: boolean; reputation: number; idCardUrl?: string; selfieUrl?: string; }
interface PendingProduct { id: string; title: string; category: string; price: number; sellerName: string; sellerId: string; image: string; description: string; }
interface SchoolRequest { id: string; schoolName: string; city: string; website: string; requesterName: string; requesterEmail: string; idCardUrl: string; status: string; }
interface PendingPost { id: string; title: string; content: string; type: string; school: string; authorName: string; status: string; city?: string; isAnonymous?: boolean; personaName?: string; }
interface Report { id: string; reporterId: string; contentType: string; contentId: string; reason: string; details: string; status: string; createdAt: any; }

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('Verifications');
  const [pendingVerifications, setPendingVerifications] = useState<PendingUser[]>([]);
  const [pendingListings, setPendingListings] = useState<PendingProduct[]>([]);
  const [pendingSchoolRequests, setPendingSchoolRequests] = useState<SchoolRequest[]>([]);
  const [pendingPosts, setPendingPosts] = useState<PendingPost[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [allUsers, setAllUsers] = useState<PendingUser[]>([]);
  const [schools, setSchools] = useState<{name: string, city: string}[]>([]);
  const [editingSchoolId, setEditingSchoolId] = useState<string | null>(null);
  const [selectedSchoolName, setSelectedSchoolName] = useState<string>('');
  const [pendingOrgs, setPendingOrgs] = useState<any[]>([]);
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
        
        const schoolsSnap = await getDocs(collection(db, 'schools'));
        const fetchedSchools = schoolsSnap.docs.map(d => ({
          name: d.data().name as string,
          city: d.data().city as string || 'Lucknow'
        }));
        fetchedSchools.sort((a, b) => a.name.localeCompare(b.name));
        setSchools(fetchedSchools);
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
    } else if (activeTab === 'School Requests') {
      const fetchSchoolRequests = async () => {
        try {
          const q = query(collection(db, 'school_requests'), where('status', '==', 'pending'));
          const snapshot = await getDocs(q);
          setPendingSchoolRequests(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SchoolRequest)));
        } catch (err) { handleFirestoreError(err, OperationType.LIST, 'school_requests'); }
      };
      fetchSchoolRequests();
    } else if (activeTab === 'Posts') {
      const fetchPosts = async () => {
        try {
          const q = query(collection(db, 'posts'), where('status', '==', 'pending'));
          const snapshot = await getDocs(q);
          setPendingPosts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PendingPost)));
        } catch (err) { handleFirestoreError(err, OperationType.LIST, 'posts'); }
      };
      fetchPosts();
    } else if (activeTab === 'Org Verifications') {
      const fetchOrgs = async () => {
        try {
          const q = query(collection(db, 'users'), where('accountType', '==', 'organization'), where('verificationStatus', '==', 'pending'));
          const snapshot = await getDocs(q);
          setPendingOrgs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (err) { handleFirestoreError(err, OperationType.LIST, 'users'); }
      };
      fetchOrgs();
    } else if (activeTab === 'Reports') {
      const fetchReports = async () => {
        try {
          const q = query(collection(db, 'reports'), where('status', '==', 'pending'));
          const snapshot = await getDocs(q);
          setReports(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Report)));
        } catch (err) { handleFirestoreError(err, OperationType.LIST, 'reports'); }
      };
      fetchReports();
    }
  }, [userData, activeTab]);

  const handleApproveUser = async (userId: string, userName: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { verified: true, verificationStatus: 'approved', updatedAt: serverTimestamp() });
      setPendingVerifications(prev => prev.filter(u => u.id !== userId));
      showToast(`${userName} has been verified`, 'success');
      createNotification({ userId, type: 'user_approved', title: 'Welcome to Nextbench!', message: 'Your account has been verified. You can now list and reserve items.', link: '/dashboard' });
    } catch (err) { handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`); }
  };

  const handleRejectUser = async (userId: string, userName: string, userEmail: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { verified: false, verificationStatus: 'rejected', updatedAt: serverTimestamp() });
      setPendingVerifications(prev => prev.filter(u => u.id !== userId));
      showToast('User application rejected', 'info');

      // Open email client
      const subject = encodeURIComponent("Nextbench Application Rejected");
      const body = encodeURIComponent(`Hi ${userName},\n\nUnfortunately, your application to Nextbench has been rejected because your ID card photo was unclear or invalid.\n\nPlease log in to Nextbench again and re-upload a clear photo of your official school ID to be verified.\n\nThanks,\nThe Nextbench Team`);
      window.location.href = `mailto:${userEmail}?subject=${subject}&body=${body}`;
    } catch (err) { handleFirestoreError(err, OperationType.DELETE, `users/${userId}`); }
  };

  const handleUpdateSchool = async (userId: string, currentSchool: string) => {
    if (!selectedSchoolName || selectedSchoolName === currentSchool) {
      setEditingSchoolId(null);
      return;
    }
    try {
      const selectedSchoolData = schools.find(s => s.name === selectedSchoolName);
      const newCity = selectedSchoolData?.city || 'Lucknow';
      await updateDoc(doc(db, 'users', userId), { school: selectedSchoolName, city: newCity, updatedAt: serverTimestamp() });
      setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, school: selectedSchoolName, city: newCity } : u));
      setEditingSchoolId(null);
      showToast('School updated successfully', 'success');
    } catch (err) { handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`); }
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

  const handleApproveSchoolRequest = async (requestId: string, schoolName: string, city: string, requesterEmail: string) => {
    try {
      await addDoc(collection(db, 'schools'), { name: schoolName, city: city || 'Lucknow', createdAt: serverTimestamp() });
      await updateDoc(doc(db, 'school_requests', requestId), { status: 'approved', updatedAt: serverTimestamp() });
      setPendingSchoolRequests(prev => prev.filter(r => r.id !== requestId));
      showToast(`${schoolName} has been added!`, 'success');
      const subject = encodeURIComponent("Nextbench School Request Approved");
      const body = encodeURIComponent(`Hi,\n\nYour request to add ${schoolName} to Nextbench has been approved! You can now sign up using your school.\n\nThanks,\nThe Nextbench Team`);
      window.location.href = `mailto:${requesterEmail}?subject=${subject}&body=${body}`;
    } catch (err) { handleFirestoreError(err, OperationType.UPDATE, `school_requests/${requestId}`); }
  };

  const handleRejectSchoolRequest = async (requestId: string, schoolName: string, requesterEmail: string) => {
    try {
      await updateDoc(doc(db, 'school_requests', requestId), { status: 'rejected', updatedAt: serverTimestamp() });
      setPendingSchoolRequests(prev => prev.filter(r => r.id !== requestId));
      showToast(`${schoolName} request rejected`, 'info');
      const subject = encodeURIComponent("Nextbench School Request Rejected");
      const body = encodeURIComponent(`Hi,\n\nUnfortunately, your request to add ${schoolName} to Nextbench has been rejected. Please ensure you provided a valid school website and ID card.\n\nThanks,\nThe Nextbench Team`);
      window.location.href = `mailto:${requesterEmail}?subject=${subject}&body=${body}`;
    } catch (err) { handleFirestoreError(err, OperationType.UPDATE, `school_requests/${requestId}`); }
  };

  const handleApprovePost = async (postId: string, title: string) => {
    try {
      await updateDoc(doc(db, 'posts', postId), { status: 'approved', updatedAt: serverTimestamp() });
      setPendingPosts(prev => prev.filter(p => p.id !== postId));
      showToast(`Post "${title}" approved`, 'success');

      // Notify the author and their followers
      const postDoc = await getDoc(doc(db, 'posts', postId));
      if (postDoc.exists()) {
        const data = postDoc.data();
        createNotification({ userId: data.authorId, type: 'user_approved', title: 'Post Approved', message: `Your post "${title}" has been approved!`, link: `/dashboard` });
        
        const followsSnap = await getDocs(query(collection(db, 'follows'), where('followingId', '==', data.authorId)));
        followsSnap.forEach(f => {
          const followerId = f.data().followerId;
          createNotification({ userId: followerId, type: 'new_post', title: 'New Post', message: `${data.authorName} just posted: "${title}"`, link: `/dashboard` });
        });
      }
    } catch (err) { handleFirestoreError(err, OperationType.UPDATE, `posts/${postId}`); }
  };

  const handleRejectPost = async (postId: string, title: string) => {
    try {
      await updateDoc(doc(db, 'posts', postId), { status: 'rejected', updatedAt: serverTimestamp() });
      setPendingPosts(prev => prev.filter(p => p.id !== postId));
      showToast(`Post "${title}" rejected`, 'info');
    } catch (err) { handleFirestoreError(err, OperationType.UPDATE, `posts/${postId}`); }
  };

  const handleDismissReport = async (reportId: string) => {
    try {
      await updateDoc(doc(db, 'reports', reportId), { status: 'dismissed', updatedAt: serverTimestamp() });
      setReports(prev => prev.filter(r => r.id !== reportId));
      showToast('Report dismissed', 'info');
    } catch (err) { handleFirestoreError(err, OperationType.UPDATE, `reports/${reportId}`); }
  };

  const handleResolveReport = async (reportId: string) => {
    try {
      await updateDoc(doc(db, 'reports', reportId), { status: 'resolved', updatedAt: serverTimestamp() });
      setReports(prev => prev.filter(r => r.id !== reportId));
      showToast('Report resolved', 'success');
    } catch (err) { handleFirestoreError(err, OperationType.UPDATE, `reports/${reportId}`); }
  };


  const handleApproveOrg = async (userId: string, orgName: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { verified: true, verificationStatus: 'approved', updatedAt: serverTimestamp() });
      setPendingOrgs(prev => prev.filter(o => o.id !== userId));
      showToast(`${orgName} has been verified`, 'success');
      createNotification({ userId, type: 'user_approved', title: 'Organization Verified!', message: `Your organization "${orgName}" has been verified. You can now list items and post events.`, link: '/dashboard' });
    } catch (err) { handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`); }
  };

  const handleRejectOrg = async (userId: string, orgName: string, email: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { verified: false, verificationStatus: 'rejected', updatedAt: serverTimestamp() });
      setPendingOrgs(prev => prev.filter(o => o.id !== userId));
      showToast(`${orgName} application rejected`, 'info');
      const subject = encodeURIComponent('Nextbench Organization Application Rejected');
      const body = encodeURIComponent(`Hi ${orgName},\n\nUnfortunately, your organization registration on Nextbench has been rejected. The verification document provided was insufficient.\n\nPlease re-register with a valid official document.\n\nThanks,\nThe Nextbench Team`);
      window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    } catch (err) { handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`); }
  };

  if (loading || !userData?.isAdmin) return <div className="pt-32 text-center text-xs font-bold uppercase tracking-widest text-brand-teal/40">Loading Secure Portal...</div>;

  const tabs = ['Verifications', 'Org Verifications', 'Listings', 'Users', 'School Requests', 'Posts', 'Reports'];

  return (
    <div className="pt-32 pb-20 px-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-10">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-teal/10 rounded-full mb-4">
            <ShieldCheck className="text-brand-teal" size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand-teal">Administrative Control</span>
          </div>
          <h1 className="text-5xl font-serif font-bold text-luxury-ink mb-2 italic">Nextbench <span className="not-italic">Operations.</span></h1>
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
          <div key={i} className="theme-card rounded-2xl p-5 border" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center gap-2 mb-2">
              <s.icon size={16} className={`${s.color} opacity-60`} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30">{s.label}</span>
            </div>
            <p className="text-3xl font-serif font-bold text-luxury-ink">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex theme-card rounded-2xl p-1.5 border mb-10 overflow-x-auto no-scrollbar" style={{ borderColor: 'var(--color-border)' }}>
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab ? 'bg-luxury-ink text-surface-base luxury-shadow' : 'text-luxury-ink/30 hover:text-luxury-ink/60'
              }`}>{tab}</button>
        ))}
      </div>

      {/* Verifications Tab */}
      {activeTab === 'Verifications' && (
        <div className="space-y-4">
          <h2 className="text-lg font-serif font-bold text-luxury-ink italic mb-4">Pending Verifications <span className="not-italic text-luxury-ink/30">({pendingVerifications.length})</span></h2>
          {pendingVerifications.length === 0 && <div className="theme-card rounded-2xl p-12 text-center border text-luxury-ink/30 font-serif italic text-lg" style={{ borderColor: 'var(--color-border)' }}>All users verified ✓</div>}
          {pendingVerifications.map(item => (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={item.id}
              className="theme-card rounded-2xl p-6 border flex flex-col md:flex-row items-center gap-6" style={{ borderColor: 'var(--color-border)' }}>
              <Link to={`/profile/${item.id}`} className="w-14 h-14 rounded-xl bg-brand-teal/10 flex items-center justify-center text-xl font-serif font-bold text-brand-teal shrink-0 hover:bg-brand-teal/20 transition-colors">
                {item.name?.[0]?.toUpperCase() || 'U'}
              </Link>
              <div className="flex-1 text-center md:text-left">
                <Link to={`/profile/${item.id}`} className="text-base font-bold text-luxury-ink mb-1 hover:text-brand-teal transition-colors block">{item.name}</Link>
                <p className="text-xs font-medium text-luxury-ink/40">{item.school} • {item.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {item.idCardUrl && (
                  <a href={getOptimizedImageUrl(item.idCardUrl)} target="_blank" rel="noopener noreferrer" className="p-3 rounded-xl border border-luxury-ink/5 hover:bg-brand-teal/5 hover:text-brand-teal transition-all text-luxury-ink/30" title="View ID Card">
                    <IdCard size={20} />
                  </a>
                )}
                {item.selfieUrl && (
                  <a href={getOptimizedImageUrl(item.selfieUrl)} target="_blank" rel="noopener noreferrer" className="p-3 rounded-xl border border-luxury-ink/5 hover:bg-brand-pink/5 hover:text-brand-pink transition-all text-luxury-ink/30" title="View Selfie">
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
          {pendingListings.length === 0 && <div className="theme-card rounded-2xl p-12 text-center border text-luxury-ink/30 font-serif italic text-lg" style={{ borderColor: 'var(--color-border)' }}>No pending listings ✓</div>}
          {pendingListings.map(item => (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={item.id}
              className="theme-card rounded-2xl p-6 border flex flex-col md:flex-row items-center gap-6" style={{ borderColor: 'var(--color-border)' }}>
              <div className="w-20 h-16 rounded-xl overflow-hidden bg-luxury-ink/5 border shrink-0" style={{ borderColor: 'var(--color-border)' }}>
                {item.image ? <img src={getOptimizedImageUrl(item.image)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <span className="text-[10px] font-bold uppercase text-luxury-ink/30 flex items-center justify-center h-full">No img</span>}
              </div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-base font-bold text-luxury-ink mb-1">{item.title}</h3>
                <div className="flex items-center justify-center md:justify-start gap-1 mb-2">
                  <span className="text-xs font-medium text-luxury-ink/40">{item.category} •</span>
                  <Link to={`/profile/${item.sellerId}`} className="text-xs font-medium text-brand-teal hover:underline">{item.sellerName}</Link>
                </div>
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
            <div key={u.id} className="theme-card rounded-2xl p-5 border flex flex-col md:flex-row items-center gap-5" style={{ borderColor: 'var(--color-border)' }}>
              <Link to={`/profile/${u.id}`} className="w-12 h-12 rounded-xl bg-brand-teal/10 flex items-center justify-center text-lg font-serif font-bold text-brand-teal shrink-0 hover:bg-brand-teal/20 transition-colors">
                {u.name?.[0]?.toUpperCase() || 'U'}
              </Link>
              <div className="flex-1 text-center md:text-left">
                <div className="flex items-center gap-2 mb-0.5 justify-center md:justify-start">
                  <Link to={`/profile/${u.id}`} className="font-bold text-luxury-ink text-sm hover:text-brand-teal transition-colors">{u.name}</Link>
                  {u.verified && <ShieldCheck size={14} className="text-brand-teal" />}
                  {u.isAdmin && <Crown size={14} className="text-brand-pink" />}
                </div>
                <div className="text-xs text-luxury-ink/40 flex items-center gap-1.5 flex-wrap">
                  {u.email} • 
                  {editingSchoolId === u.id ? (
                    <div className="flex items-center gap-2">
                      <select 
                        value={selectedSchoolName} 
                        onChange={e => setSelectedSchoolName(e.target.value)}
                        className="bg-surface-card border border-brand-teal/20 rounded px-2 py-1 text-xs text-luxury-ink focus:outline-none focus:border-brand-teal max-w-[200px]"
                      >
                        <option disabled value="">Select School</option>
                        {schools.map(s => <option key={s.name} value={s.name}>{s.name} ({s.city})</option>)}
                      </select>
                      <button onClick={() => handleUpdateSchool(u.id, u.school)} className="text-brand-teal hover:text-brand-mint font-bold text-[10px] uppercase bg-brand-teal/10 px-2 py-1 rounded">Save</button>
                      <button onClick={() => setEditingSchoolId(null)} className="text-luxury-ink/40 hover:text-luxury-ink/60 font-bold text-[10px] uppercase bg-luxury-ink/5 px-2 py-1 rounded">Cancel</button>
                    </div>
                  ) : (
                    <>
                      {u.school}
                      <button 
                        onClick={() => { setEditingSchoolId(u.id); setSelectedSchoolName(u.school); }} 
                        className="text-brand-teal/60 hover:text-brand-teal ml-1"
                        title="Edit School"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/20">Rep: {u.reputation?.toFixed(1)}</span>
                
                {u.idCardUrl && (
                  <a href={getOptimizedImageUrl(u.idCardUrl)} target="_blank" rel="noopener noreferrer" className="p-2.5 rounded-lg border border-luxury-ink/5 hover:bg-brand-teal/5 hover:text-brand-teal transition-all text-luxury-ink/30" title="View ID Card">
                    <IdCard size={16} />
                  </a>
                )}
                {u.selfieUrl && (
                  <a href={getOptimizedImageUrl(u.selfieUrl)} target="_blank" rel="noopener noreferrer" className="p-2.5 rounded-lg border border-luxury-ink/5 hover:bg-brand-pink/5 hover:text-brand-pink transition-all text-luxury-ink/30" title="View Selfie">
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

      {/* School Requests Tab */}
      {activeTab === 'School Requests' && (
        <div className="space-y-4">
          <h2 className="text-lg font-serif font-bold text-luxury-ink italic mb-4">Pending School Requests <span className="not-italic text-luxury-ink/30">({pendingSchoolRequests.length})</span></h2>
          {pendingSchoolRequests.length === 0 && <div className="theme-card rounded-2xl p-12 text-center border text-luxury-ink/30 font-serif italic text-lg" style={{ borderColor: 'var(--color-border)' }}>No pending school requests ✓</div>}
          {pendingSchoolRequests.map(item => (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={item.id}
              className="theme-card rounded-2xl p-6 border flex flex-col md:flex-row items-center gap-6" style={{ borderColor: 'var(--color-border)' }}>
              <div className="w-14 h-14 rounded-xl bg-brand-teal/10 flex items-center justify-center text-brand-teal shrink-0">
                <School size={24} />
              </div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-base font-bold text-luxury-ink mb-1">{item.schoolName} <span className="text-xs text-luxury-ink/50 font-normal">({item.city})</span></h3>
                <p className="text-xs font-medium text-luxury-ink/40 mb-1">
                  Requested by: {item.requesterName} ({item.requesterEmail})
                </p>
                <a href={item.website} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold uppercase tracking-widest text-brand-teal hover:underline">
                  Visit Website
                </a>
              </div>
              <div className="flex items-center gap-2">
                {item.idCardUrl && (
                  <a href={getOptimizedImageUrl(item.idCardUrl)} target="_blank" rel="noopener noreferrer" className="p-3 rounded-xl border border-luxury-ink/5 hover:bg-brand-teal/5 hover:text-brand-teal transition-all text-luxury-ink/30" title="View ID Card">
                    <IdCard size={20} />
                  </a>
                )}
                <button onClick={() => handleRejectSchoolRequest(item.id, item.schoolName, item.requesterEmail)} className="p-3 rounded-xl border border-luxury-ink/5 hover:bg-red-50 hover:text-red-500 transition-all text-luxury-ink/20"><XCircle size={20} /></button>
                <button onClick={() => handleApproveSchoolRequest(item.id, item.schoolName, item.city, item.requesterEmail)} className="p-3 rounded-xl bg-brand-teal text-white hover:bg-brand-mint transition-all shadow-lg"><CheckCircle size={20} /></button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Posts Tab */}
      {activeTab === 'Posts' && (
        <div className="space-y-4">
          <h2 className="text-lg font-serif font-bold text-luxury-ink italic mb-4">Pending Posts <span className="not-italic text-luxury-ink/30">({pendingPosts.length})</span></h2>
          {pendingPosts.length === 0 && <div className="theme-card rounded-2xl p-12 text-center border text-luxury-ink/30 font-serif italic text-lg" style={{ borderColor: 'var(--color-border)' }}>No pending posts ✓</div>}
          {pendingPosts.map(item => (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={item.id}
              className="theme-card rounded-2xl p-6 border flex flex-col items-start gap-4" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex w-full items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${item.type === 'confession' ? 'bg-purple-500/10 text-purple-600' : 'bg-brand-teal/10 text-brand-teal'}`}>{item.type}</span>
                    <h3 className="text-base font-bold text-luxury-ink">{item.title}</h3>
                  </div>
                  <p className="text-xs font-medium text-luxury-ink/40 flex flex-wrap items-center gap-1.5 mt-1">
                    By {item.authorName} 
                    {item.isAnonymous && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-luxury-ink/5 rounded-md text-[9px] font-bold text-luxury-ink/60">
                        🔓 Posted as {item.personaName}
                      </span>
                    )}
                    • {item.school} {item.city ? `• ${item.city}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleRejectPost(item.id, item.title)} className="p-2 rounded-xl border border-luxury-ink/5 hover:bg-red-50 hover:text-red-500 transition-all text-luxury-ink/20"><XCircle size={18} /></button>
                  <button onClick={() => handleApprovePost(item.id, item.title)} className="p-2 rounded-xl bg-brand-teal text-white hover:bg-brand-mint transition-all shadow-lg"><CheckCircle size={18} /></button>
                </div>
              </div>
              <p className="text-sm text-luxury-ink/60 whitespace-pre-wrap bg-surface-base p-4 rounded-xl w-full">{item.content}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'Reports' && (
        <div className="space-y-4">
          <h2 className="text-lg font-serif font-bold text-luxury-ink italic mb-4">Pending Reports <span className="not-italic text-luxury-ink/30">({reports.length})</span></h2>
          {reports.length === 0 && <div className="theme-card rounded-2xl p-12 text-center border text-luxury-ink/30 font-serif italic text-lg" style={{ borderColor: 'var(--color-border)' }}>No pending reports ✓</div>}
          {reports.map(item => (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={item.id}
              className="theme-card rounded-2xl p-6 border flex flex-col items-start gap-4" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex w-full items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 bg-brand-pink/10 rounded-full text-[10px] font-bold uppercase tracking-widest text-brand-pink">{item.contentType}</span>
                    <h3 className="text-base font-bold text-luxury-ink">{item.reason}</h3>
                  </div>
                  <p className="text-xs font-medium text-luxury-ink/40">
                    Reporter ID: {item.reporterId} • Content ID: {item.contentId}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleDismissReport(item.id)} className="p-2 rounded-xl border border-luxury-ink/5 hover:bg-surface-soft transition-all text-luxury-ink/40" title="Dismiss"><XCircle size={18} /></button>
                  <button onClick={() => handleResolveReport(item.id)} className="p-2 rounded-xl bg-brand-pink text-white hover:bg-brand-pink/80 transition-all shadow-lg" title="Mark Resolved"><CheckCircle size={18} /></button>
                </div>
              </div>
              {item.details && <p className="text-sm text-luxury-ink/60 whitespace-pre-wrap bg-surface-base p-4 rounded-xl w-full">{item.details}</p>}
            </motion.div>
          ))}
        </div>
      )}

      {/* Org Verifications Tab */}
      {activeTab === 'Org Verifications' && (
        <div className="space-y-4">
          <h2 className="text-lg font-serif font-bold text-luxury-ink italic mb-4">Pending Organization Verifications <span className="not-italic text-luxury-ink/30">({pendingOrgs.length})</span></h2>
          {pendingOrgs.length === 0 && <div className="theme-card rounded-2xl p-12 text-center border text-luxury-ink/30 font-serif italic text-lg" style={{ borderColor: 'var(--color-border)' }}>No pending org verifications ✓</div>}
          {pendingOrgs.map(org => (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={org.id}
              className="theme-card rounded-2xl p-6 border flex flex-col md:flex-row items-center gap-6" style={{ borderColor: 'var(--color-border)' }}>
              <div className="w-14 h-14 rounded-xl bg-brand-pink/10 flex items-center justify-center text-brand-pink shrink-0">
                <Building2 size={24} />
              </div>
              <div className="flex-1 text-center md:text-left">
                <Link to={`/profile/${org.id}`} className="text-base font-bold text-luxury-ink mb-1 hover:text-brand-teal transition-colors block">{org.orgName || org.name}</Link>
                <p className="text-xs font-medium text-luxury-ink/40 mb-1">
                  {org.orgType === 'company' ? 'Company' : org.orgType === 'school' ? 'School' : org.orgType === 'coaching' ? 'Coaching Centre' : org.orgType === 'ngo' ? 'NGO / Club' : 'Organization'}
                  {' '}• {org.city || 'Unknown City'} • {org.email}
                </p>
                {org.orgWebsite && (
                  <a href={org.orgWebsite} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold uppercase tracking-widest text-brand-teal hover:underline flex items-center gap-1 justify-center md:justify-start">
                    <Globe size={12} /> Website
                  </a>
                )}
                {org.orgDescription && (
                  <p className="text-xs text-luxury-ink/50 mt-1 line-clamp-2">{org.orgDescription}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {org.orgDocumentUrl && (
                  <a href={getOptimizedImageUrl(org.orgDocumentUrl)} target="_blank" rel="noopener noreferrer" className="p-3 rounded-xl border border-luxury-ink/5 hover:bg-brand-teal/5 hover:text-brand-teal transition-all text-luxury-ink/30" title="View Document">
                    <FileText size={20} />
                  </a>
                )}
                <button onClick={() => handleRejectOrg(org.id, org.orgName || org.name, org.email)} className="p-3 rounded-xl border border-luxury-ink/5 hover:bg-red-50 hover:text-red-500 transition-all text-luxury-ink/20"><XCircle size={20} /></button>
                <button onClick={() => handleApproveOrg(org.id, org.orgName || org.name)} className="p-3 rounded-xl bg-brand-teal text-white hover:bg-brand-mint transition-all shadow-lg"><CheckCircle size={20} /></button>
              </div>
            </motion.div>
          ))}
        </div>
      )}


    </div>
  );
}
