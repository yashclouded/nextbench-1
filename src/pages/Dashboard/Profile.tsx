import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Star, Package, Settings, MapPin, X, Smartphone, ExternalLink, Trash2, Camera, MessageSquare, Handshake, Heart, MoreHorizontal, Ban, Flag, Copy, Check, Edit2, Building2, Globe } from 'lucide-react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import React, { useState, useEffect, useRef } from 'react';
import { doc, updateDoc, serverTimestamp, collection, query, where, onSnapshot, deleteDoc, getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { useToast } from '../../lib/ToastContext';
import { uploadProfilePicture } from '../../lib/storage';
import { isHeicFile, convertHeicToJpeg } from '../../lib/heic-converter';
import { getOptimizedImageUrl } from '../../lib/utils';
import { followUser, unfollowUser, useFollowStatus, useFollowCounts } from '../../lib/follows';
import { getOrCreateDMRoom } from '../../lib/dm';
import { useScrollLock } from '../../hooks/useScrollLock';
import { useBlockStatus, blockUser, unblockUser } from '../../lib/blocks';
import UsernameSetup from '../../components/ui/UsernameSetup';
import ReportModal from '../../components/ui/ReportModal';
import ProfileSettings from '../../components/ui/ProfileSettings';
import SEO from '../../components/seo/SEO';


interface UserProduct {
  id: string; title: string; price: number; category: string; condition: string; image: string; status: string; createdAt: any;
}

interface ProfileProps {
  /** When rendered via UsernameProfile resolver */
  usernameResolvedUserId?: string;
}

export default function Profile({ usernameResolvedUserId }: ProfileProps) {
  const { userId: routeUserId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user, userData } = useAuth();
  const { showToast } = useToast();
  const [profileUser, setProfileUser] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAbout, setEditAbout] = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [myListings, setMyListings] = useState<UserProduct[]>([]);
  const [myPosts, setMyPosts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'pending' | 'sold'>('active');
  const [viewMode, setViewMode] = useState<'listings' | 'posts'>('listings');
  const [isUploadingPic, setIsUploadingPic] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedPost, setSelectedPost] = useState<any | null>(null);

  // Username
  const [showUsernameSetup, setShowUsernameSetup] = useState(false);
  const [copiedUsername, setCopiedUsername] = useState(false);

  // Follow system
  const [followAnimating, setFollowAnimating] = useState(false);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [followListUsers, setFollowListUsers] = useState<any[]>([]);
  const [loadingFollowList, setLoadingFollowList] = useState(false);
  const [isDMing, setIsDMing] = useState(false);

  // Block system
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useScrollLock(isEditing || showFollowersModal || showFollowingModal || !!selectedPost || showUsernameSetup || showReportModal || showSettingsModal);

  // Determine the actual userId to display
  const effectiveUserId = usernameResolvedUserId || routeUserId;
  const isOwnProfile = !effectiveUserId || effectiveUserId === user?.uid;
  const targetUserId = isOwnProfile ? user?.uid : effectiveUserId;

  const { isFollowing, isFollowedBy, isFriend } = useFollowStatus(targetUserId);
  const { followersCount, followingCount } = useFollowCounts(targetUserId);
  // followerIds / followingIds are fetched on-demand when modals open
  const { isBlocked, isBlockedBy } = useBlockStatus(targetUserId);

  // Close more menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  // Show username setup prompt for own profile without username
  useEffect(() => {
    if (isOwnProfile && userData && !userData.username) {
      // Small delay so the profile loads first
      const timer = setTimeout(() => setShowUsernameSetup(true), 800);
      return () => clearTimeout(timer);
    }
  }, [isOwnProfile, userData]);

  // Fetch profile user data
  useEffect(() => {
    const fetchUser = async () => {
      if (isOwnProfile) {
        setProfileUser(userData);
        setEditName(userData?.name || '');
        setEditAbout(userData?.about || '');
      } else if (effectiveUserId) {
        try {
          const docSnap = await getDoc(doc(db, 'users', effectiveUserId));
          if (docSnap.exists()) {
            setProfileUser(docSnap.data());
          } else {
            showToast('User not found', 'error');
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, `users/${effectiveUserId}`);
        }
      }
    };
    fetchUser();
  }, [effectiveUserId, isOwnProfile, userData]);

  // Auto-redirect to username URL if available and not already on it
  useEffect(() => {
    if (!usernameResolvedUserId && profileUser?.username) {
      navigate(`/u/${profileUser.username}`, { replace: true });
    }
  }, [profileUser?.username, usernameResolvedUserId, navigate]);

  // Fetch user's listings
  useEffect(() => {
    if (!targetUserId) return;
    
    let q;
    if (isOwnProfile) {
      q = query(collection(db, 'products'), where('sellerId', '==', targetUserId));
    } else {
      q = query(collection(db, 'products'), where('sellerId', '==', targetUserId), where('status', 'in', ['available', 'sold']));
    }
    
    const unsub = onSnapshot(q, (snap) => {
      const prods: UserProduct[] = [];
      snap.forEach(d => prods.push({ id: d.id, ...d.data() } as UserProduct));
      setMyListings(prods);
    });
    return () => unsub();
  }, [effectiveUserId, isOwnProfile, user]);

  // Fetch user's posts
  useEffect(() => {
    if (!targetUserId) return;
    
    const q = query(collection(db, 'posts'), where('authorId', '==', targetUserId));
    const unsub = onSnapshot(q, (snap) => {
      const posts: any[] = [];
      snap.forEach(d => posts.push({ id: d.id, ...d.data() }));
      posts.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setMyPosts(posts);
    });
    return () => unsub();
  }, [effectiveUserId, isOwnProfile, user]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isOwnProfile) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { name: editName, about: editAbout || null, updatedAt: serverTimestamp() });
      setIsEditing(false);
      showToast('Profile updated!', 'success');
    } catch (err) { handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`); }
  };

  const handleProfilePictureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !user || !isOwnProfile) return;
    let file = e.target.files[0];
    
    const isHeic = isHeicFile(file);
    const isStandardImage = file.type.startsWith('image/');
    
    if (!isHeic && !isStandardImage) {
      showToast('Please select a valid image file', 'error');
      return;
    }
    
    setIsUploadingPic(true);
    try {
      await user.getIdToken(true);
      
      if (isHeic) {
        showToast('Converting HEIC image...', 'info');
        file = await convertHeicToJpeg(file);
      }
      
      if (file.size > 5 * 1024 * 1024) {
        showToast('Image must be less than 5MB', 'error');
        setIsUploadingPic(false);
        return;
      }
      
      const imageUrl = await uploadProfilePicture(file, user.uid);
      await updateDoc(doc(db, 'users', user.uid), {
        profilePicture: imageUrl,
        updatedAt: serverTimestamp()
      });
      showToast('Profile picture updated!', 'success');
    } catch (err: any) {
      console.error("Profile picture upload error:", err);
      showToast(`Upload failed: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setIsUploadingPic(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteListing = async (productId: string) => {
    if (!confirm('Delete this listing permanently?')) return;
    try {
      await deleteDoc(doc(db, 'products', productId));
      showToast('Listing deleted', 'info');
    } catch (err) { handleFirestoreError(err, OperationType.DELETE, `products/${productId}`); }
  };

  const handleDeletePost = async (postId: string) => {
    if (!window.confirm('Are you sure you want to delete this post? This will also delete all comments and likes.')) return;
    try {
      const batch = writeBatch(db);
      
      const repliesQ = query(collection(db, 'post_replies'), where('postId', '==', postId));
      const repliesSnap = await getDocs(repliesQ);
      repliesSnap.forEach(docSnap => batch.delete(docSnap.ref));
      
      const upvotesQ = query(collection(db, 'post_upvotes'), where('postId', '==', postId));
      const upvotesSnap = await getDocs(upvotesQ);
      upvotesSnap.forEach(docSnap => batch.delete(docSnap.ref));

      const reactionsQ = query(collection(db, 'post_reactions'), where('postId', '==', postId));
      const reactionsSnap = await getDocs(reactionsQ);
      reactionsSnap.forEach(docSnap => batch.delete(docSnap.ref));
      
      batch.delete(doc(db, 'posts', postId));
      
      await batch.commit();
      
      showToast('Post deleted successfully', 'success');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'posts');
    }
  };

  // ─── Follow Handlers ───────────────────────────────────

  const handleFollow = async () => {
    if (!user || !targetUserId) return;
    if (!userData?.verified) {
      showToast('You must be verified to follow users.', 'error');
      return;
    }
    setFollowAnimating(true);
    try {
      if (isFollowing) {
        await unfollowUser(user.uid, targetUserId);
        showToast('Unfollowed', 'info');
      } else {
        await followUser(user.uid, targetUserId);
        showToast('Following!', 'success');
      }
    } catch (err) {
      showToast('Failed to update follow', 'error');
    }
    setTimeout(() => setFollowAnimating(false), 300);
  };

  const handleDM = async () => {
    if (!user || !targetUserId || !userData) return;
    if (!userData.verified) {
      showToast('Only verified students can send direct messages.', 'warning');
      return;
    }
    setIsDMing(true);
    try {
      const roomId = await getOrCreateDMRoom(user.uid, targetUserId);
      navigate(`/chat/${roomId}`, { state: { otherUser: profileUser } });
    } catch (err) {
      showToast('Failed to start conversation', 'error');
    } finally {
      setIsDMing(false);
    }
  };

  // ─── Block Handlers ─────────────────────────────────────

  const handleBlock = async () => {
    if (!user || !targetUserId) return;
    if (!userData?.verified) {
      showToast('You must be verified to block users.', 'error');
      return;
    }
    try {
      if (isBlocked) {
        await unblockUser(user.uid, targetUserId);
        showToast('User unblocked', 'info');
      } else {
        await blockUser(user.uid, targetUserId);
        showToast('User blocked', 'info');
        // Also unfollow if following
        if (isFollowing) {
          await unfollowUser(user.uid, targetUserId);
        }
      }
      setShowMoreMenu(false);
    } catch {
      showToast('Failed to update block', 'error');
    }
  };

  const handleCopyUsername = () => {
    const un = profileUser?.username;
    if (!un) return;
    navigator.clipboard.writeText(`nextbench.in/u/${un}`);
    setCopiedUsername(true);
    showToast('Profile link copied!', 'success');
    setTimeout(() => setCopiedUsername(false), 2000);
  };

  // ─── Follow List Modal ─────────────────────────────────

  const loadFollowList = async (userIds: string[]) => {
    setLoadingFollowList(true);
    try {
      const users: any[] = [];
      // Fetch concurrently instead of sequentially
      const promises = userIds.slice(0, 50).map(async (uid) => {
        const docSnap = await getDoc(doc(db, 'users', uid));
        if (docSnap.exists()) return { id: docSnap.id, ...docSnap.data() };
        return null;
      });
      const results = await Promise.all(promises);
      setFollowListUsers(results.filter(Boolean));
    } catch (err) {
      console.error('Error loading follow list:', err);
    } finally {
      setLoadingFollowList(false);
    }
  };

  const openFollowers = async () => {
    setShowFollowersModal(true);
    setShowFollowingModal(false);
    // Fetch follower IDs on demand
    const { collection: coll, query: q, where: w, getDocs: gd } = await import('firebase/firestore');
    const snap = await gd(q(coll(db, 'follows'), w('followingId', '==', targetUserId)));
    const ids = snap.docs.map(d => d.data().followerId);
    loadFollowList(ids);
  };

  const openFollowing = async () => {
    setShowFollowingModal(true);
    setShowFollowersModal(false);
    // Fetch following IDs on demand
    const { collection: coll, query: q, where: w, getDocs: gd } = await import('firebase/firestore');
    const snap = await gd(q(coll(db, 'follows'), w('followerId', '==', targetUserId)));
    const ids = snap.docs.map(d => d.data().followingId);
    loadFollowList(ids);
  };

  // ─── Blocked States ─────────────────────────────────────

  if (!isOwnProfile && isBlockedBy) {
    return (
      <div className="pt-32 pb-20 px-6 max-w-lg mx-auto text-center">
        <div className="theme-card rounded-3xl p-16">
          <div className="text-5xl mb-6">🚫</div>
          <h2 className="text-2xl font-bold text-luxury-ink mb-3">Profile Unavailable</h2>
          <p className="text-luxury-ink/50 text-sm">This profile is not available.</p>
        </div>
      </div>
    );
  }

  if (!isOwnProfile && isBlocked) {
    return (
      <div className="pt-32 pb-20 px-6 max-w-lg mx-auto text-center">
        <div className="theme-card rounded-3xl p-16">
          <Ban className="mx-auto text-luxury-ink/20 mb-6" size={48} />
          <h2 className="text-2xl font-bold text-luxury-ink mb-3">User Blocked</h2>
          <p className="text-luxury-ink/50 text-sm mb-8">You have blocked this user.</p>
          <button
            onClick={handleBlock}
            className="bg-brand-teal text-white px-8 py-3 rounded-full text-[11px] font-bold uppercase tracking-widest hover:bg-brand-pink transition-colors"
          >
            Unblock
          </button>
        </div>
      </div>
    );
  }

  if (!user || !profileUser) return <div className="pt-32 text-center text-xs font-bold uppercase tracking-widest text-luxury-ink/30">Loading profile...</div>;

  const userName = profileUser.name || 'Unknown User';
  const [firstName, ...lastNameParts] = userName.split(' ');
  const lastName = lastNameParts.join(' ');

  const activeListings = myListings.filter(p => p.status === 'available');
  const pendingListings = myListings.filter(p => p.status === 'pending');
  const soldListings = myListings.filter(p => p.status === 'sold');
  const displayedListings = activeTab === 'active' ? activeListings : activeTab === 'pending' ? pendingListings : soldListings;

  return (
    <div className="pt-24 md:pt-32 pb-20 px-6 max-w-7xl mx-auto relative">
      <SEO 
        title={profileUser ? `${profileUser.name}'s Profile` : 'Profile'}
        description={profileUser?.about ? profileUser.about.slice(0, 150) : `Check out ${profileUser?.name || 'this'}'s profile on Nextbench.`}
        image={profileUser?.profilePicture ? getOptimizedImageUrl(profileUser.profilePicture) : undefined}
      />
      {/* Profile Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-8 mb-16 relative">
        {/* Profile picture with gradient ring */}
        <div className="relative shrink-0 group">
          <div className="w-28 h-28 md:w-36 md:h-36 rounded-full overflow-hidden flex items-center justify-center text-luxury-ink font-serif text-4xl md:text-5xl relative gradient-border" style={{ background: 'var(--color-surface-soft)' }}>
            {profileUser.profilePicture ? (
              <img src={getOptimizedImageUrl(profileUser.profilePicture)} alt="User" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : firstName[0]?.toUpperCase()}
            
            {isOwnProfile && (
              <div onClick={() => !isUploadingPic && fileInputRef.current?.click()} className="absolute inset-0 bg-luxury-ink/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer backdrop-blur-sm">
                {isUploadingPic ? (
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Camera className="text-white" size={24} />
                )}
              </div>
            )}
          </div>
          {isOwnProfile && (
            <input type="file" ref={fileInputRef} onChange={handleProfilePictureUpload} accept="image/*,.heic,.heif" className="hidden" />
          )}
          {profileUser.verified && (
            <div className="absolute bottom-0 right-0 bg-brand-teal text-white p-2 rounded-full shadow-md border-2" style={{ borderColor: 'var(--color-surface-base)' }}>
              {profileUser.accountType === 'organization' ? <Building2 size={18} /> : <ShieldCheck size={18} />}
            </div>
          )}
        </div>

        <div className="flex-1 w-full">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-luxury-ink">{firstName} {lastName}</h1>
                {isFriend && (
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold bg-brand-teal/10 text-brand-teal px-2 py-1 rounded-full">
                    <Handshake size={12} /> Friends
                  </span>
                )}
              </div>
              
              {/* Username display */}
              {profileUser.username && (
                <button onClick={handleCopyUsername} className="flex items-center gap-1.5 mb-2 group/un">
                  <span className="username-badge">@{profileUser.username}</span>
                  {copiedUsername ? (
                    <Check size={12} className="text-brand-mint" />
                  ) : (
                    <Copy size={12} className="text-luxury-ink/20 opacity-0 group-hover/un:opacity-100 transition-opacity" />
                  )}
                </button>
              )}
              
              <p className="text-luxury-ink/50 font-medium flex items-center gap-1.5 text-sm mt-1">
                <MapPin size={14} className="text-brand-teal/70" /> {profileUser.accountType === 'organization' ? (profileUser.city || profileUser.school) : profileUser.school}
              </p>
              {/* Org type label */}
              {profileUser.accountType === 'organization' && profileUser.orgType && (
                <span className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 bg-brand-pink/10 text-brand-pink rounded-full text-[10px] font-bold uppercase tracking-widest">
                  <Building2 size={12} />
                  {profileUser.orgType === 'company' ? 'Company' : profileUser.orgType === 'school' ? 'School' : profileUser.orgType === 'coaching' ? 'Coaching Centre' : profileUser.orgType === 'ngo' ? 'NGO / Club' : 'Organization'}
                </span>
              )}
              {/* Org website */}
              {profileUser.orgWebsite && (
                <a href={profileUser.orgWebsite} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 mt-2 text-xs text-brand-teal hover:text-brand-pink transition-colors font-medium">
                  <Globe size={13} /> {profileUser.orgWebsite.replace(/^https?:\/\//, '')}
                </a>
              )}
              {profileUser.about && <p className="text-sm text-luxury-ink/80 max-w-lg leading-relaxed mt-3">{profileUser.about}</p>}
            </div>
            
            <div className="flex items-center gap-3 shrink-0">
              {isOwnProfile ? (
                <>
                  <button onClick={() => { setEditName(profileUser.name || ''); setEditAbout(profileUser.about || ''); setIsEditing(true); }}
                    className="p-2.5 rounded-full transition-all hover:scale-105" style={{ border: '1px solid var(--color-border)' }}
                    title="Edit Profile"
                  >
                    <Edit2 size={20} className="text-luxury-ink/60" />
                  </button>
                  
                  {/* New Wishlist Link */}
                  <Link to="/wishlist"
                    className="p-2.5 rounded-full transition-all hover:scale-105" style={{ border: '1px solid var(--color-border)' }}
                    title="Wishlist"
                  >
                    <Heart size={20} className="text-luxury-ink/60" />
                  </Link>
                  
                  {/* Settings Button moved to absolute on mobile */}
                  <button onClick={() => setShowSettingsModal(true)}
                    className="p-2.5 rounded-full transition-all hover:scale-105 absolute top-6 right-6 md:static" style={{ border: '1px solid var(--color-border)' }}
                    title="Settings"
                  >
                    <Settings size={20} className="text-luxury-ink/60" />
                  </button>

                  {deferredPrompt && (
                    <button onClick={handleInstallClick} className="p-2.5 rounded-full bg-brand-teal text-white hover:bg-brand-pink transition-all flex items-center justify-center" title="Install App">
                      <Smartphone size={20} />
                    </button>
                  )}
                  <Link to="/sell" className="bg-luxury-ink text-surface-base px-6 py-2.5 rounded-full font-bold hover:bg-luxury-ink/80 transition-all text-sm hidden sm:block" style={{ color: 'var(--color-surface-base)' }}>
                    List Item
                  </Link>
                </>
              ) : (
                <>
                  {/* Follow Button */}
                  <button
                    onClick={handleFollow}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-bold transition-all ${followAnimating ? 'scale-95 opacity-80' : ''} ${
                      isFollowing
                        ? 'text-luxury-ink hover:text-red-500'
                        : 'bg-luxury-ink text-surface-base hover:bg-luxury-ink/80'
                    }`}
                    style={isFollowing ? { background: 'var(--color-surface-card)', border: '1px solid var(--color-border)' } : { color: 'var(--color-surface-base)' }}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </button>

                  {/* DM Button */}
                  <button
                    onClick={handleDM}
                    disabled={isDMing}
                    className="flex items-center justify-center w-10 h-10 rounded-full text-luxury-ink hover:bg-luxury-ink/5 transition-all disabled:opacity-50"
                    style={{ border: '1px solid var(--color-border)' }}
                  >
                    <MessageSquare size={18} />
                  </button>

                  {/* More Menu (Block/Report) */}
                  <div className="relative" ref={moreMenuRef}>
                    <button
                      onClick={() => setShowMoreMenu(!showMoreMenu)}
                      className="flex items-center justify-center w-10 h-10 rounded-full text-luxury-ink/60 hover:bg-luxury-ink/5 transition-all"
                      style={{ border: '1px solid var(--color-border)' }}
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    
                    {showMoreMenu && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="absolute right-0 top-12 w-52 rounded-2xl shadow-2xl overflow-hidden z-50"
                        style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)' }}
                      >
                        <button
                          onClick={handleBlock}
                          className="w-full flex items-center gap-3 px-5 py-4 text-sm font-medium text-luxury-ink hover:bg-surface-soft transition-colors text-left"
                        >
                          <Ban size={16} className={isBlocked ? 'text-brand-mint' : 'text-red-500'} />
                          {isBlocked ? 'Unblock User' : 'Block User'}
                        </button>
                        <button
                          onClick={() => { setShowReportModal(true); setShowMoreMenu(false); }}
                          className="w-full flex items-center gap-3 px-5 py-4 text-sm font-medium text-luxury-ink hover:bg-surface-soft transition-colors text-left border-t"
                          style={{ borderColor: 'var(--color-border)' }}
                        >
                          <Flag size={16} className="text-amber-500" />
                          Report User
                        </button>
                      </motion.div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Clean Horizontal Stats */}
          <div className="flex flex-wrap items-center gap-6 mt-6">
            <button onClick={openFollowers} className="flex items-center gap-1.5 hover:opacity-70 transition-opacity">
              <span className="text-base font-bold text-luxury-ink">{followersCount}</span>
              <span className="text-sm text-luxury-ink/60">Followers</span>
            </button>
            <button onClick={openFollowing} className="flex items-center gap-1.5 hover:opacity-70 transition-opacity">
              <span className="text-base font-bold text-luxury-ink">{followingCount}</span>
              <span className="text-sm text-luxury-ink/60">Following</span>
            </button>
            <div className="flex items-center gap-1.5">
              <span className="text-base font-bold text-luxury-ink">{soldListings.length}</span>
              <span className="text-sm text-luxury-ink/60">Deals</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-base font-bold text-luxury-ink">{profileUser.reputation?.toFixed(1) || '5.0'}</span>
              <span className="text-sm text-luxury-ink/60 flex items-center gap-1">Reputation <Star size={12} className="text-brand-teal mb-0.5" /></span>
            </div>
          </div>
        </div>
      </div>

      {/* Content Toggle */}
      <div className="flex w-full border-b mb-8" style={{ borderColor: 'var(--color-border)' }}>
        <button 
          onClick={() => setViewMode('listings')}
          className={`flex-1 flex justify-center pb-4 pt-2 transition-all hover:bg-luxury-ink/5 relative text-sm sm:text-base ${viewMode === 'listings' ? 'text-luxury-ink font-bold' : 'text-luxury-ink/50 font-medium'}`}
        >
          Listings
          {viewMode === 'listings' && <div className="absolute bottom-0 h-1 w-16 bg-brand-pink rounded-t-full"></div>}
        </button>
        <button 
          onClick={() => setViewMode('posts')}
          className={`flex-1 flex justify-center pb-4 pt-2 transition-all hover:bg-luxury-ink/5 relative text-sm sm:text-base ${viewMode === 'posts' ? 'text-luxury-ink font-bold' : 'text-luxury-ink/50 font-medium'}`}
        >
          Posts
          {viewMode === 'posts' && <div className="absolute bottom-0 h-1 w-12 bg-brand-teal rounded-t-full"></div>}
        </button>
      </div>

      {/* Listings Section */}
      {viewMode === 'listings' && (
        <>
          {isOwnProfile && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar mb-6 pb-2">
              {([['active', `Active (${activeListings.length})`], ['pending', `Pending (${pendingListings.length})`], ['sold', `Sold (${soldListings.length})`]] as const).map(([key, label]) => (
                <button key={key} onClick={() => setActiveTab(key as any)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
                    activeTab === key ? 'bg-luxury-ink text-surface-base' : 'bg-luxury-ink/5 text-luxury-ink/60 hover:bg-luxury-ink/10'
                  }`}
                  style={activeTab === key ? { color: 'var(--color-surface-base)' } : undefined}
                >{label}</button>
              ))}
            </div>
          )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayedListings.map(product => (
          <div key={product.id} className="theme-card rounded-2xl overflow-hidden group transition-all hover:scale-[1.01] flex flex-col">
            <div className="aspect-[4/3] relative overflow-hidden bg-surface-soft shrink-0">
              <img src={getOptimizedImageUrl(product.image)} alt={product.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" referrerPolicy="no-referrer" />
              <div className="absolute top-3 right-3 flex gap-2">
                <Link to={`/product/${product.id}`} className="glass p-2 rounded-full text-luxury-ink/60 hover:text-brand-teal transition-colors shadow-sm"><ExternalLink size={14} /></Link>
                {isOwnProfile && (
                  <>
                    <Link to={`/edit-item/${product.id}`} className="glass p-2 rounded-full text-luxury-ink/60 hover:text-brand-teal transition-colors shadow-sm"><Edit2 size={14} /></Link>
                    <button onClick={() => handleDeleteListing(product.id)} className="glass p-2 rounded-full text-luxury-ink/60 hover:text-red-500 transition-colors shadow-sm"><Trash2 size={14} /></button>
                  </>
                )}
              </div>
              {product.status === 'pending' && (
                <div className="absolute bottom-3 left-3 bg-amber-500 text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">Pending Review</div>
              )}
              {product.status === 'sold' && (
                <div className="absolute inset-0 bg-luxury-ink/30 flex items-center justify-center"><span className="bg-surface-card text-luxury-ink px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest">Sold</span></div>
              )}
            </div>
            <div className="p-4 flex flex-col flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-brand-teal">{product.category}</span>
                <span className="text-lg font-serif font-bold text-luxury-ink">₹{product.price}</span>
              </div>
              <h3 className="text-sm font-bold text-luxury-ink leading-snug line-clamp-2">{product.title}</h3>
            </div>
          </div>
        ))}

        {displayedListings.length === 0 && (
          <div className="col-span-full rounded-2xl p-12 text-center border-2 border-dashed" style={{ borderColor: 'var(--color-border)' }}>
            <p className="text-luxury-ink/30 font-serif italic text-lg">No {activeTab} listings.</p>
          </div>
        )}

        {activeTab === 'active' && isOwnProfile && (
          <Link to="/sell" className="border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-10 hover:border-brand-teal hover:bg-brand-teal/5 transition-all group" style={{ borderColor: 'var(--color-border)' }}>
            <div className="w-14 h-14 bg-luxury-ink/5 rounded-xl flex items-center justify-center mb-3 group-hover:bg-brand-teal transition-all">
              <Package className="text-luxury-ink/20 group-hover:text-white" size={28} />
            </div>
            <p className="text-sm font-bold text-luxury-ink">Add New Listing</p>
          </Link>
        )}
      </div>
      </>
      )}

      {/* Posts Section */}
      {viewMode === 'posts' && (
        <div className="space-y-6 max-w-2xl mx-auto w-full">
          {myPosts.filter(post => post.privacy !== 'private' || isFriend || isOwnProfile).map(post => {
            const postImageUrls = post.imageUrls && post.imageUrls.length > 0
              ? post.imageUrls
              : (post.imageUrl ? [post.imageUrl] : []);
            const hasImage = postImageUrls.length > 0;

            return (
              <div key={post.id} className="theme-card rounded-2xl p-5 md:p-6 transition-all hover:scale-[1.005]">
                {hasImage && (
                  <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-4 bg-surface-soft" style={{ border: '1px solid var(--color-border)' }}>
                    <img 
                      src={getOptimizedImageUrl(postImageUrls[0])} 
                      alt={post.title} 
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" 
                      referrerPolicy="no-referrer" 
                    />
                  </div>
                )}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <span className="inline-block px-3 py-1 bg-brand-teal/10 text-brand-teal rounded-full text-[10px] font-bold uppercase tracking-widest mb-2">
                      {post.type}
                    </span>
                    <h3 className="text-xl font-bold text-luxury-ink">{post.title}</h3>
                  </div>
                  {post.status === 'pending' && (
                    <span className="bg-amber-500/10 text-amber-500 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest shrink-0">Pending</span>
                  )}
                </div>
                <p className="text-luxury-ink/70 leading-relaxed mb-4 text-sm line-clamp-3">{post.content}</p>
                
                <div className="flex items-center gap-4 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="text-sm font-bold text-luxury-ink/40 flex items-center gap-5">
                    <span className="flex items-center gap-2"><Heart size={24} /> {post.upvotesCount || 0}</span>
                    <span className="flex items-center gap-2"><MessageSquare size={24} /> {post.repliesCount || 0}</span>
                  </div>
                  {(userData?.role === 'admin' || post.authorId === user?.uid) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeletePost(post.id); }}
                      className="ml-auto p-2 hover:bg-red-500/10 hover:text-red-500 rounded-full text-luxury-ink/40 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {myPosts.filter(post => post.privacy !== 'private' || isFriend || isOwnProfile).length === 0 && (
            <div className="col-span-full rounded-2xl p-12 text-center border-2 border-dashed" style={{ borderColor: 'var(--color-border)' }}>
              <p className="text-luxury-ink/30 font-serif italic text-lg">No community posts yet.</p>
            </div>
          )}
        </div>
      )}

      {/* Edit Profile Modal */}
      <AnimatePresence>
        {isEditing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: 'var(--color-overlay)' }}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="rounded-2xl w-full max-w-md p-8 relative shadow-2xl" style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)' }}>
              <button onClick={() => setIsEditing(false)} className="absolute top-4 right-4 p-2 text-luxury-ink/40 hover:text-luxury-ink"><X size={20} /></button>
              <h3 className="text-xl font-bold text-luxury-ink mb-2">Edit Profile</h3>
              <p className="text-xs font-bold uppercase tracking-widest text-luxury-ink/40 mb-6">Update your public information.</p>
              <form onSubmit={handleUpdateProfile} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 ml-1">Display Name</label>
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} required maxLength={100}
                    className="w-full rounded-xl py-4 px-6 text-sm font-medium theme-input" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 ml-1">About Me (Optional)</label>
                  <textarea value={editAbout} onChange={(e) => setEditAbout(e.target.value)} rows={4} maxLength={500} placeholder="Share something about yourself..."
                    className="w-full rounded-xl py-4 px-6 text-sm font-medium resize-none theme-input" />
                </div>
                <button type="submit" className="w-full py-4 bg-brand-teal text-white text-[11px] font-bold uppercase tracking-[0.2em] shadow-lg hover:bg-brand-pink transition-colors rounded-xl">
                  Save Changes
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Username Setup Modal */}
      <UsernameSetup
        isOpen={showUsernameSetup}
        onClose={() => setShowUsernameSetup(false)}
        mandatory={isOwnProfile && !userData?.username}
      />

      <ProfileSettings
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />

      {/* Report Modal */}
      {targetUserId && (
        <ReportModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          contentType="user"
          contentId={targetUserId}
        />
      )}

      {/* Followers/Following Modal */}
      <AnimatePresence>
        {(showFollowersModal || showFollowingModal) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm"
            style={{ background: 'var(--color-overlay)' }}
            onClick={() => { setShowFollowersModal(false); setShowFollowingModal(false); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="rounded-2xl w-full max-w-md shadow-2xl max-h-[70vh] flex flex-col overflow-hidden"
              style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b flex justify-between items-center" style={{ borderColor: 'var(--color-border)' }}>
                <h3 className="text-xl font-bold text-luxury-ink">
                  {showFollowersModal ? 'Followers' : 'Following'}
                </h3>
                <button
                  onClick={() => { setShowFollowersModal(false); setShowFollowingModal(false); }}
                  className="p-2 text-luxury-ink/40 hover:text-luxury-ink rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {loadingFollowList ? (
                  <div className="py-12 text-center">
                    <div className="w-8 h-8 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-luxury-ink/30 text-xs font-bold uppercase tracking-widest">Loading...</p>
                  </div>
                ) : followListUsers.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-luxury-ink/40 font-serif italic text-lg">
                      {showFollowersModal ? 'No followers yet.' : 'Not following anyone yet.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {followListUsers.map(u => (
                      <Link
                        key={u.id}
                        to={u.username ? `/u/${u.username}` : `/profile/${u.id}`}
                        onClick={() => { setShowFollowersModal(false); setShowFollowingModal(false); }}
                        className="flex items-center gap-4 p-3 rounded-xl hover:bg-surface-soft transition-all group"
                      >
                        <div className="w-12 h-12 rounded-full bg-brand-teal/5 flex items-center justify-center overflow-hidden shrink-0" style={{ border: '1px solid var(--color-border)' }}>
                          {u.profilePicture ? (
                            <img src={getOptimizedImageUrl(u.profilePicture)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <span className="text-brand-teal font-serif font-bold text-lg">{u.name?.[0]?.toUpperCase()}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-luxury-ink text-sm group-hover:text-brand-teal transition-colors flex items-center gap-1.5">
                            {u.name}
                            {u.verified && <ShieldCheck size={14} className="text-brand-teal" />}
                          </p>
                          {u.username && <p className="text-[11px] text-luxury-ink/40">@{u.username}</p>}
                          <p className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30 truncate">{u.school}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
