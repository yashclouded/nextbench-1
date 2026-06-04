import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Moon, Sun, ShieldAlert, Edit2, LogOut, Loader2, LifeBuoy, Bookmark, User, Settings, ExternalLink, Trash2, Lock } from 'lucide-react';
import { collection, query, where, getDocs, deleteDoc, doc, getDoc, addDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/AuthContext';
import { useTheme } from '../../lib/ThemeContext';
import { useToast } from '../../lib/ToastContext';
import { claimUsername, validateUsername } from '../../lib/usernames';
import { PERSONA_NAMES } from '../../lib/confessions';
import { Link, useNavigate } from 'react-router-dom';

interface ProfileSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileSettings({ isOpen, onClose }: ProfileSettingsProps) {
  const { user, userData } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'general' | 'blocked' | 'account' | 'support' | 'saved'>('general');
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [savedPosts, setSavedPosts] = useState<any[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  // Username states
  const [newUsername, setNewUsername] = useState('');
  const [isChangingUsername, setIsChangingUsername] = useState(false);

  // Persona state
  const [personaName, setPersonaName] = useState('');
  const [isChangingPersona, setIsChangingPersona] = useState(false);

  // Support states
  const [supportReason, setSupportReason] = useState('');
  const [supportDetails, setSupportDetails] = useState('');
  const [isSubmittingSupport, setIsSubmittingSupport] = useState(false);

  const isFollowersOnlyDM = userData?.chatPrivacy?.followersOnly || false;

  const toggleFollowersOnlyDM = async (val: boolean) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        'chatPrivacy.followersOnly': val
      });
      showToast('Privacy settings updated', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to update privacy settings', 'error');
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'blocked' && user) {
      loadBlockedUsers();
    }
    if (isOpen && activeTab === 'saved' && user) {
      loadSavedPosts();
    }
  }, [isOpen, activeTab, user]);

  useEffect(() => {
    if (isOpen && userData?.anonymousPersonaName) {
      setPersonaName(userData.anonymousPersonaName);
    }
  }, [isOpen, userData]);

  const loadBlockedUsers = async () => {
    if (!user) return;
    setLoadingBlocked(true);
    try {
      const q = query(collection(db, 'blocks'), where('blockerId', '==', user.uid));
      const snap = await getDocs(q);
      const users: any[] = [];
      for (const d of snap.docs) {
        const blockData = d.data();
        const userDoc = await getDoc(doc(db, 'users', blockData.blockedId));
        if (userDoc.exists()) {
          users.push({ blockDocId: d.id, id: userDoc.id, ...userDoc.data() });
        }
      }
      setBlockedUsers(users);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingBlocked(false);
    }
  };

  const handleUnblock = async (blockDocId: string) => {
    try {
      await deleteDoc(doc(db, 'blocks', blockDocId));
      setBlockedUsers(prev => prev.filter(u => u.blockDocId !== blockDocId));
      showToast('User unblocked', 'success');
    } catch (err) {
      showToast('Failed to unblock user', 'error');
    }
  };

  const loadSavedPosts = async () => {
    if (!user) return;
    setLoadingSaved(true);
    try {
      const q = query(collection(db, 'saved_posts'), where('userId', '==', user.uid));
      const snap = await getDocs(q);
      const posts: any[] = [];
      for (const d of snap.docs) {
        const postDoc = await getDoc(doc(db, 'posts', d.data().postId));
        if (postDoc.exists()) {
          posts.push({ saveDocId: d.id, id: postDoc.id, ...postDoc.data() });
        }
      }
      // Sort by newest saved first implicitly or based on post date
      posts.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setSavedPosts(posts);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSaved(false);
    }
  };

  const handleUnsave = async (saveDocId: string) => {
    try {
      await deleteDoc(doc(db, 'saved_posts', saveDocId));
      setSavedPosts(prev => prev.filter(p => p.saveDocId !== saveDocId));
      showToast('Post removed from saved', 'info');
    } catch (err) {
      showToast('Failed to unsave post', 'error');
    }
  };

  const handleChangeUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userData) return;

    if (!newUsername.trim()) {
      showToast('Username cannot be empty', 'error');
      return;
    }

    const val = validateUsername(newUsername.trim());
    if (!val.valid) {
      showToast(val.error || 'Invalid username', 'error');
      return;
    }

    setIsChangingUsername(true);
    try {
      await claimUsername(user.uid, newUsername.trim(), userData.username);
      showToast('Username updated successfully!', 'success');
      setNewUsername('');
    } catch (err: any) {
      showToast(err.message || 'Failed to update username', 'error');
    } finally {
      setIsChangingUsername(false);
    }
  };

  const handleSavePersona = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!personaName) {
      showToast('Please select a persona', 'error');
      return;
    }
    
    setIsChangingPersona(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        anonymousPersonaName: personaName,
        updatedAt: serverTimestamp()
      });
      showToast('Anonymous persona updated!', 'success');
    } catch (err: any) {
      console.error("PERSONA UPDATE ERROR:", err);
      showToast(`Failed to update persona: ${err.message}`, 'error');
    } finally {
      setIsChangingPersona(false);
    }
  };

  const handleSubmitSupport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!supportReason.trim() || !supportDetails.trim()) {
      showToast('Please fill out all fields', 'error');
      return;
    }
    setIsSubmittingSupport(true);
    try {
      await addDoc(collection(db, 'reports'), {
        reporterId: user.uid,
        contentType: 'support_ticket',
        contentId: 'general',
        reason: supportReason.trim(),
        details: supportDetails.trim(),
        status: 'pending',
        createdAt: serverTimestamp()
      });
      showToast('Support ticket submitted successfully!', 'success');
      setSupportReason('');
      setSupportDetails('');
      setActiveTab('general');
    } catch (err: any) {
      showToast(err.message || 'Failed to submit support ticket', 'error');
    } finally {
      setIsSubmittingSupport(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-md"
        style={{ background: 'var(--color-overlay-heavy)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
          style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-6 border-b flex items-center justify-between bg-surface-base" style={{ borderColor: 'var(--color-border)' }}>
            <h2 className="text-xl font-bold text-luxury-ink">Settings</h2>
            <button onClick={onClose} className="p-2 text-luxury-ink/40 hover:text-luxury-ink rounded-full transition-colors bg-surface-soft">
              <X size={18} />
            </button>
          </div>

          <div className="flex flex-1 overflow-hidden min-h-[50vh] sm:min-h-[400px]">
            {/* Sidebar */}
            <div className="w-[140px] sm:w-[200px] shrink-0 border-r bg-surface-base flex flex-col p-2 space-y-1 overflow-y-auto" style={{ borderColor: 'var(--color-border)' }}>
              {[
                { id: 'general', label: 'General', icon: Settings },
                { id: 'account', label: 'Account', icon: User },
                { id: 'saved', label: 'Saved Posts', icon: Bookmark },
                { id: 'blocked', label: 'Blocked', icon: ShieldAlert },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all relative overflow-hidden group ${activeTab === tab.id ? 'text-brand-teal bg-brand-teal/10' : 'text-luxury-ink/60 hover:text-luxury-ink hover:bg-surface-soft'}`}
                >
                  <tab.icon size={16} className={`transition-colors ${activeTab === tab.id ? 'text-brand-teal' : 'text-luxury-ink/40 group-hover:text-luxury-ink'}`} />
                  <span className="relative z-10">{tab.label}</span>
                  {activeTab === tab.id && (
                    <motion.div layoutId="activeTabIndicator" className="absolute inset-0 bg-brand-teal/5" />
                  )}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 p-6 overflow-y-auto">
              {activeTab === 'general' && (
                <div className="space-y-8">
                  <div>
                    <h3 className="text-sm font-bold text-luxury-ink mb-4 uppercase tracking-widest">Appearance</h3>
                    <div className="flex items-center justify-between p-4 rounded-xl bg-surface-soft/50 border" style={{ borderColor: 'var(--color-border)' }}>
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-brand-teal/10 rounded-lg text-brand-teal">
                          {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
                        </div>
                        <div>
                          <p className="font-bold text-luxury-ink text-sm">Dark Theme</p>
                          <p className="text-[10px] text-luxury-ink/50 uppercase tracking-widest">Toggle app theme</p>
                        </div>
                      </div>
                      <button
                        onClick={toggleTheme}
                        className={`w-12 h-6 rounded-full transition-all relative ${theme === 'dark' ? 'bg-brand-teal' : 'bg-luxury-ink/20'}`}
                      >
                        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${theme === 'dark' ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-luxury-ink mb-4 uppercase tracking-widest">Privacy</h3>
                    <div className="flex items-center justify-between p-4 rounded-xl bg-surface-soft/50 border" style={{ borderColor: 'var(--color-border)' }}>
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-brand-pink/10 rounded-lg text-brand-pink">
                          <Lock size={20} />
                        </div>
                        <div>
                          <p className="font-bold text-luxury-ink text-sm">Only followers can DM me</p>
                          <p className="text-[10px] text-luxury-ink/50 uppercase tracking-widest">Others will send a request</p>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleFollowersOnlyDM(!isFollowersOnlyDM)}
                        className={`w-12 h-6 rounded-full transition-all relative ${isFollowersOnlyDM ? 'bg-brand-teal' : 'bg-luxury-ink/20'}`}
                      >
                        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${isFollowersOnlyDM ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-luxury-ink mb-4 uppercase tracking-widest">Support</h3>
                    {userData?.isAdmin ? (
                      <Link
                        to="/admin"
                        onClick={onClose}
                        className="flex items-center justify-between p-4 rounded-xl bg-surface-soft/50 border hover:border-brand-teal transition-all group"
                        style={{ borderColor: 'var(--color-border)' }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
                            <LifeBuoy size={20} />
                          </div>
                          <div>
                            <p className="font-bold text-luxury-ink text-sm group-hover:text-brand-teal transition-colors">Admin & Support</p>
                            <p className="text-[10px] text-luxury-ink/50 uppercase tracking-widest">Help center and reports</p>
                          </div>
                        </div>
                      </Link>
                    ) : (
                      <button
                        onClick={() => setActiveTab('support')}
                        className="w-full flex items-center justify-between p-4 rounded-xl bg-surface-soft/50 border hover:border-brand-teal transition-all group"
                        style={{ borderColor: 'var(--color-border)' }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
                            <LifeBuoy size={20} />
                          </div>
                          <div className="text-left">
                            <p className="font-bold text-luxury-ink text-sm group-hover:text-brand-teal transition-colors">Support</p>
                            <p className="text-[10px] text-luxury-ink/50 uppercase tracking-widest">Contact our team</p>
                          </div>
                        </div>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'account' && (
                <div className="space-y-8">
                  <div>
                    <h3 className="text-sm font-bold text-luxury-ink mb-4 uppercase tracking-widest">Username</h3>
                    
                    <div className="p-4 rounded-xl bg-surface-soft/50 border mb-4" style={{ borderColor: 'var(--color-border)' }}>
                      <p className="text-xs text-luxury-ink/70 mb-2">
                        You can change your username once every 30 days.
                      </p>
                      {userData?.lastUsernameChange && (
                        <p className="text-[10px] text-amber-500 font-bold uppercase tracking-widest mb-4">
                          Last changed: {userData.lastUsernameChange.toDate().toLocaleDateString()}
                        </p>
                      )}
                      
                      <form onSubmit={handleChangeUsername} className="flex gap-2">
                        <div className="flex-1 relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-ink/40 font-bold">@</span>
                          <input
                            type="text"
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value.toLowerCase())}
                            placeholder={userData?.username || "New username"}
                            className="w-full bg-surface-base border rounded-lg py-2 pl-8 pr-4 text-sm font-medium focus:outline-none focus:border-brand-teal"
                            style={{ borderColor: 'var(--color-border)' }}
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={isChangingUsername || !newUsername.trim()}
                          className="px-4 py-2 bg-brand-teal text-white rounded-lg text-xs font-bold disabled:opacity-50 transition-colors shrink-0 whitespace-nowrap"
                        >
                          {isChangingUsername ? 'Saving...' : 'Update'}
                        </button>
                      </form>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-purple-700 mb-4 uppercase tracking-widest">Anonymous Persona</h3>
                    
                    <div className="p-4 rounded-xl bg-purple-500/5 border mb-4" style={{ borderColor: 'var(--color-border)' }}>
                      <p className="text-xs text-purple-700/70 mb-4">
                        Set up your secret identity. You can use this persona to post anonymously.
                      </p>
                      
                      <form onSubmit={handleSavePersona} className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={personaName}
                          onChange={(e) => setPersonaName(e.target.value)}
                          placeholder="Enter your secret identity (e.g. Midnight Thinker)"
                          className="flex-1 bg-white/50 border border-purple-500/20 rounded-lg py-2 px-4 text-sm font-medium focus:outline-none focus:border-purple-500 transition-all text-purple-900"
                        />
                        <button
                          type="submit"
                          disabled={isChangingPersona || !personaName.trim()}
                          className="px-4 py-2 bg-purple-600 text-white rounded-lg text-xs font-bold disabled:opacity-50 transition-colors shrink-0 whitespace-nowrap"
                        >
                          {isChangingPersona ? 'Saving...' : 'Save Persona'}
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'blocked' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="h-full flex flex-col">
                  <h3 className="text-sm font-bold text-luxury-ink mb-4 uppercase tracking-widest flex items-center gap-2">
                    <ShieldAlert size={16} className="text-red-500" /> Blocked Users
                  </h3>
                  
                  {loadingBlocked ? (
                    <div className="py-8 text-center flex-1">
                      <Loader2 size={24} className="animate-spin text-luxury-ink/20 mx-auto" />
                    </div>
                  ) : blockedUsers.length === 0 ? (
                    <div className="py-8 text-center border-2 border-dashed rounded-xl flex-1 flex flex-col items-center justify-center" style={{ borderColor: 'var(--color-border)' }}>
                      <p className="text-sm text-luxury-ink/40 font-medium">You haven't blocked anyone.</p>
                    </div>
                  ) : (
                    <div className="space-y-2 flex-1 overflow-y-auto pr-2">
                      {blockedUsers.map(u => (
                        <div key={u.id} className="flex items-center justify-between p-3 rounded-xl border bg-surface-soft/30 hover:bg-surface-soft/60 transition-colors" style={{ borderColor: 'var(--color-border)' }}>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-surface-base flex items-center justify-center overflow-hidden border" style={{ borderColor: 'var(--color-border)' }}>
                              {u.profilePicture ? (
                                <img src={u.profilePicture} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="font-bold text-luxury-ink">{u.name?.[0]}</span>
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-luxury-ink">{u.name}</p>
                              {u.username && <p className="text-[10px] text-luxury-ink/40">@{u.username}</p>}
                            </div>
                          </div>
                          <button
                            onClick={() => handleUnblock(u.blockDocId)}
                            className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border hover:bg-surface-base transition-colors text-luxury-ink"
                            style={{ borderColor: 'var(--color-border)' }}
                          >
                            Unblock
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'saved' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="h-full flex flex-col">
                  <h3 className="text-sm font-bold text-luxury-ink mb-4 uppercase tracking-widest flex items-center gap-2">
                    <Bookmark size={16} className="text-brand-teal" /> Saved Posts
                  </h3>
                  
                  {loadingSaved ? (
                    <div className="py-8 text-center flex-1">
                      <Loader2 size={24} className="animate-spin text-luxury-ink/20 mx-auto" />
                    </div>
                  ) : savedPosts.length === 0 ? (
                    <div className="py-8 text-center border-2 border-dashed rounded-xl flex-1 flex flex-col items-center justify-center" style={{ borderColor: 'var(--color-border)' }}>
                      <p className="text-sm text-luxury-ink/40 font-medium">You haven't saved any posts yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 flex-1 overflow-y-auto pr-2">
                      {savedPosts.map(post => (
                        <div key={post.id} className="p-4 rounded-xl border bg-surface-base hover:shadow-md transition-all group flex flex-col" style={{ borderColor: 'var(--color-border)' }}>
                          <div className="flex justify-between items-start gap-4">
                            <div className="flex-1">
                              <h4 className="text-sm font-bold text-luxury-ink line-clamp-1">{post.title}</h4>
                              {post.content && (
                                <p className="text-xs text-luxury-ink/60 line-clamp-2 mt-1">{post.content}</p>
                              )}
                            </div>
                            {post.imageUrls?.[0] && (
                              <img src={post.imageUrls[0]} alt="" className="w-12 h-12 rounded-lg object-cover border" style={{ borderColor: 'var(--color-border)' }} />
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-4">
                            <span className="text-[10px] font-bold text-luxury-ink/40 uppercase tracking-widest">
                              {post.authorName} • {post.type}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleUnsave(post.saveDocId)}
                                className="p-1.5 text-luxury-ink/40 hover:text-brand-pink hover:bg-brand-pink/10 rounded-lg transition-colors"
                                title="Remove from saved"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'support' && (
                <div className="space-y-6">
                  <h3 className="text-sm font-bold text-luxury-ink uppercase tracking-widest flex items-center gap-2">
                    <LifeBuoy size={16} className="text-amber-500" /> Contact Support
                  </h3>
                  <div className="p-4 rounded-xl bg-surface-soft/50 border" style={{ borderColor: 'var(--color-border)' }}>
                    <p className="text-xs text-luxury-ink/70 mb-4">
                      Need help? Describe your issue below and our support team will review it.
                    </p>
                    <form onSubmit={handleSubmitSupport} className="space-y-4">
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/50 block mb-1">Subject</label>
                        <input
                          type="text"
                          value={supportReason}
                          onChange={(e) => setSupportReason(e.target.value)}
                          placeholder="What do you need help with?"
                          required
                          className="w-full bg-surface-base border rounded-lg py-3 px-4 text-sm font-medium focus:outline-none focus:border-brand-teal"
                          style={{ borderColor: 'var(--color-border)' }}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/50 block mb-1">Details</label>
                        <textarea
                          value={supportDetails}
                          onChange={(e) => setSupportDetails(e.target.value)}
                          placeholder="Please provide as much detail as possible..."
                          required
                          rows={4}
                          className="w-full bg-surface-base border rounded-lg py-3 px-4 text-sm font-medium focus:outline-none focus:border-brand-teal resize-none"
                          style={{ borderColor: 'var(--color-border)' }}
                        />
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setActiveTab('general')}
                          className="px-4 py-2 bg-surface-soft text-luxury-ink/60 rounded-lg text-xs font-bold hover:bg-luxury-ink/5 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmittingSupport}
                          className="px-6 py-2 bg-brand-teal text-white rounded-lg text-xs font-bold disabled:opacity-50 transition-colors"
                        >
                          {isSubmittingSupport ? 'Submitting...' : 'Submit Ticket'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
