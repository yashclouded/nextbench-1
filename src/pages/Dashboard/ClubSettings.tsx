import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Users, Crown, Shield, UserPlus, UserMinus, Copy, RefreshCw, Settings, Lock, Globe, Megaphone, Clock, BellOff, Trash2, LogOut, Search, X, Link as LinkIcon, Camera, Check } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { db } from '../../lib/firebase';
import { doc, onSnapshot, getDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { useToast } from '../../lib/ToastContext';
import { getOptimizedImageUrl } from '../../lib/utils';
import { uploadClubAvatar } from '../../lib/storage';
import {
  ClubData, promoteColeader, demoteColeader, removeMember,
  transferLeadership, updateClubSettings, updateClubInfo,
  regenerateInviteCode, deleteClub, leaveClub, addMemberDirectly
} from '../../lib/clubs';
import { useScrollLock } from '../../hooks/useScrollLock';

interface MemberInfo {
  id: string;
  name: string;
  profilePicture?: string;
  school?: string;
  verified?: boolean;
}

export default function ClubSettings() {
  const { clubId } = useParams<{ clubId: string }>();
  const { user, userData } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [club, setClub] = useState<ClubData | null>(null);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);
  const [searchUsers, setSearchUsers] = useState('');
  const [userResults, setUserResults] = useState<any[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [memberActionId, setMemberActionId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');

  const avatarInputRef = useRef<HTMLInputElement>(null);

  useScrollLock(showAddMember || showDeleteConfirm || showLeaveConfirm || showTransferModal);

  const isLead = club?.leadId === user?.uid;
  const isColeader = club?.coLeadIds?.includes(user?.uid || '') || false;
  const isLeadOrCo = isLead || isColeader;

  // Listen to club data
  useEffect(() => {
    if (!clubId) return;
    const unsub = onSnapshot(doc(db, 'clubs', clubId), (snap) => {
      if (snap.exists()) {
        setClub({ id: snap.id, ...snap.data() } as ClubData);
      }
    });
    return () => unsub();
  }, [clubId]);

  // Fetch member profiles
  useEffect(() => {
    if (!club) return;
    setLoadingMembers(true);

    const fetchMembers = async () => {
      const memberPromises = club.memberIds.map(async (uid) => {
        const uDoc = await getDoc(doc(db, 'users', uid));
        if (uDoc.exists()) {
          const d = uDoc.data();
          return { id: uid, name: d.name || 'User', profilePicture: d.profilePicture, school: d.school, verified: d.verified };
        }
        return { id: uid, name: 'Deleted User' };
      });

      const results = await Promise.all(memberPromises);
      // Sort: lead first, then co-leads, then alphabetical
      results.sort((a, b) => {
        if (a.id === club.leadId) return -1;
        if (b.id === club.leadId) return 1;
        const aCo = club.coLeadIds.includes(a.id) ? 1 : 0;
        const bCo = club.coLeadIds.includes(b.id) ? 1 : 0;
        if (aCo !== bCo) return bCo - aCo;
        return a.name.localeCompare(b.name);
      });

      setMembers(results);
      setLoadingMembers(false);
    };

    fetchMembers();
  }, [club?.memberIds?.length]);

  // Search users for adding
  useEffect(() => {
    if (!showAddMember || !searchUsers.trim()) {
      setUserResults([]);
      return;
    }

    setSearchingUsers(true);
    let searchTerm = searchUsers.trim();
    searchTerm = searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1);
    const endStr = searchTerm + '\uf8ff';

    const q = query(
      collection(db, 'users'),
      where('name', '>=', searchTerm),
      where('name', '<=', endStr),
      limit(15)
    );

    getDocs(q).then((snap) => {
      const results: any[] = [];
      snap.forEach((d) => {
        if (d.id !== user?.uid && !club?.memberIds.includes(d.id)) {
          results.push({ id: d.id, ...d.data() });
        }
      });
      setUserResults(results);
      setSearchingUsers(false);
    }).catch(() => setSearchingUsers(false));
  }, [searchUsers, showAddMember]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !clubId || !isLead) return;
    const file = e.target.files[0];
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be under 5MB', 'error');
      return;
    }
    setAvatarUploading(true);
    try {
      const url = await uploadClubAvatar(file, clubId);
      await updateClubInfo(clubId, { avatar: url });
      showToast('Club avatar updated', 'success');
    } catch {
      showToast('Failed to upload avatar', 'error');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleCopyInviteLink = () => {
    if (!club) return;
    const link = `${window.location.origin}/club/join/${club.inviteCode}`;
    navigator.clipboard.writeText(link);
    showToast('Invite link copied!', 'success');
  };

  const handleRegenerateCode = async () => {
    if (!clubId || !isLead) return;
    try {
      await regenerateInviteCode(clubId);
      showToast('Invite code regenerated', 'success');
    } catch {
      showToast('Failed to regenerate code', 'error');
    }
  };

  const handleAddMember = async (targetId: string) => {
    if (!clubId || !user) return;
    const result = await addMemberDirectly(user.uid, targetId, clubId);
    if (result.success) {
      showToast('Member added!', 'success');
      setShowAddMember(false);
      setSearchUsers('');
    } else {
      showToast(result.reason || 'Failed to add member', 'error');
    }
  };

  const handlePromote = async (userId: string) => {
    if (!clubId || !user) return;
    try {
      await promoteColeader(user.uid, userId, clubId);
      showToast('Promoted to co-lead', 'success');
    } catch {
      showToast('Failed to promote', 'error');
    }
    setMemberActionId(null);
  };

  const handleDemote = async (userId: string) => {
    if (!clubId || !user) return;
    try {
      await demoteColeader(user.uid, userId, clubId);
      showToast('Demoted to member', 'success');
    } catch {
      showToast('Failed to demote', 'error');
    }
    setMemberActionId(null);
  };

  const handleKick = async (userId: string) => {
    if (!clubId || !user) return;
    if (!confirm('Remove this member from the club?')) return;
    try {
      await removeMember(user.uid, userId, clubId);
      showToast('Member removed', 'success');
    } catch {
      showToast('Failed to remove member', 'error');
    }
    setMemberActionId(null);
  };

  const handleTransferLead = async (newLeadId: string) => {
    if (!clubId || !user) return;
    try {
      await transferLeadership(user.uid, newLeadId, clubId);
      showToast('Leadership transferred', 'success');
      setShowTransferModal(false);
    } catch {
      showToast('Failed to transfer leadership', 'error');
    }
  };

  const handleLeave = async () => {
    if (!clubId || !user) return;
    try {
      await leaveClub(user.uid, clubId);
      showToast('You left the club', 'success');
      navigate('/messages');
    } catch {
      showToast('Failed to leave club', 'error');
    }
  };

  const handleDelete = async () => {
    if (!clubId) return;
    try {
      await deleteClub(clubId);
      showToast('Club deleted', 'success');
      navigate('/messages');
    } catch {
      showToast('Failed to delete club', 'error');
    }
  };

  const handleToggleSetting = async (key: string, value: any) => {
    if (!clubId || !isLead) return;
    try {
      await updateClubSettings(clubId, { [key]: value });
    } catch {
      showToast('Failed to update setting', 'error');
    }
  };

  const handleToggleType = async () => {
    if (!clubId || !isLead || !club) return;
    const newType = club.type === 'public' ? 'private' : 'public';
    try {
      await updateClubInfo(clubId, { type: newType });
      showToast(`Club is now ${newType}`, 'success');
    } catch {
      showToast('Failed to update', 'error');
    }
  };

  if (!user || !club) {
    return (
      <div className="pt-32 text-center">
        <div className="w-10 h-10 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-luxury-ink/30 text-xs font-bold uppercase tracking-widest">Loading settings...</p>
      </div>
    );
  }

  const shouldHideMembers = club.settings?.hideMembersAbove50 && club.memberCount > 50;
  const filteredMembers = memberSearch.trim()
    ? members.filter((m) => m.name.toLowerCase().includes(memberSearch.toLowerCase()))
    : members;

  const getRoleLabel = (uid: string) => {
    if (club.leadId === uid) return 'Lead';
    if (club.coLeadIds?.includes(uid)) return 'Co-Lead';
    return 'Member';
  };

  const getRoleBadgeColor = (uid: string) => {
    if (club.leadId === uid) return 'bg-amber-100 text-amber-700';
    if (club.coLeadIds?.includes(uid)) return 'bg-brand-teal/10 text-brand-teal';
    return '';
  };

  return (
    <div className="pb-20 max-w-2xl mx-auto min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-40 px-4 md:px-0 pt-6 pb-4 border-b border-luxury-ink/5" style={{ background: 'var(--color-surface-card)' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/club/${clubId}`)} className="p-2 hover:bg-surface-soft rounded-full transition-all">
            <ArrowLeft size={20} className="text-luxury-ink" />
          </button>
          <h1 className="text-xl font-bold text-luxury-ink">Club Settings</h1>
        </div>
      </div>

      <div className="px-4 md:px-0 mt-6 space-y-6">
        {/* Club Info Card */}
        <div className="theme-card rounded-3xl p-6 border border-luxury-ink/5 text-center">
          <div className="relative w-20 h-20 mx-auto mb-4">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-teal/20 to-brand-pink/20 flex items-center justify-center overflow-hidden border-2 border-luxury-ink/5">
              {club.avatar ? (
                <img src={getOptimizedImageUrl(club.avatar)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <Users size={32} className="text-brand-teal" />
              )}
            </div>
            {isLead && (
              <>
                <input type="file" ref={avatarInputRef} onChange={handleAvatarUpload} accept="image/*" className="hidden" />
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="absolute -bottom-1 -right-1 w-7 h-7 bg-brand-teal text-white rounded-lg flex items-center justify-center shadow-lg hover:bg-brand-pink transition-colors"
                >
                  {avatarUploading ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Camera size={14} />}
                </button>
              </>
            )}
          </div>
          <h2 className="text-xl font-bold text-luxury-ink mb-1">{club.name}</h2>
          <p className="text-luxury-ink/50 text-sm mb-3 max-w-xs mx-auto">{club.description || 'No description'}</p>
          <div className="flex items-center justify-center gap-3">
            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${club.type === 'public' ? 'bg-brand-teal/10 text-brand-teal' : 'bg-luxury-ink/5 text-luxury-ink/40'}`}>
              {club.type === 'public' ? <><Globe size={10} className="inline mr-1" />Public</> : <><Lock size={10} className="inline mr-1" />Private</>}
            </span>
            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-luxury-ink/5 text-luxury-ink/40">
              <Users size={10} className="inline mr-1" />{club.memberCount} members
            </span>
          </div>
        </div>

        {/* Invite Link */}
        <div className="theme-card rounded-3xl p-6 border border-luxury-ink/5">
          <h3 className="text-sm font-bold text-luxury-ink mb-4 flex items-center gap-2">
            <LinkIcon size={16} className="text-brand-teal" /> Invite Link
          </h3>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 bg-surface-base rounded-xl px-4 py-3 text-sm font-mono text-luxury-ink/60 truncate border border-luxury-ink/5">
              {window.location.origin}/club/join/{club.inviteCode}
            </div>
            <button onClick={handleCopyInviteLink} className="p-3 bg-brand-teal text-white rounded-xl hover:bg-brand-pink transition-colors shadow-md shrink-0">
              <Copy size={16} />
            </button>
          </div>
          {isLead && (
            <button onClick={handleRegenerateCode} className="text-xs font-bold text-luxury-ink/30 hover:text-brand-teal transition-colors flex items-center gap-1.5">
              <RefreshCw size={12} /> Regenerate invite code
            </button>
          )}
        </div>

        {/* Members */}
        <div className="theme-card rounded-3xl p-6 border border-luxury-ink/5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-luxury-ink flex items-center gap-2">
              <Users size={16} className="text-brand-teal" /> Members ({club.memberCount})
            </h3>
            {isLeadOrCo && (
              <button onClick={() => setShowAddMember(true)} className="p-2 bg-brand-teal/10 text-brand-teal rounded-xl hover:bg-brand-teal/20 transition-colors">
                <UserPlus size={16} />
              </button>
            )}
          </div>

          {/* Member search */}
          {(club.memberCount > 10 || shouldHideMembers) && (
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-ink/20" size={14} />
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search members..."
                className="w-full bg-surface-base border border-luxury-ink/5 rounded-xl py-2.5 pl-9 pr-4 focus:outline-none focus:border-brand-teal text-sm"
              />
            </div>
          )}

          {shouldHideMembers && !memberSearch.trim() ? (
            <p className="text-luxury-ink/30 text-sm text-center py-4">Member list is hidden. Use search to find members.</p>
          ) : loadingMembers ? (
            <div className="py-4 text-center">
              <div className="w-6 h-6 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : (
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {filteredMembers.map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-soft transition-colors relative">
                  <Link to={`/profile/${m.id}`} className="w-10 h-10 rounded-full bg-brand-teal/10 flex items-center justify-center overflow-hidden shrink-0 border border-luxury-ink/5">
                    {m.profilePicture ? (
                      <img src={getOptimizedImageUrl(m.profilePicture)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="text-brand-teal font-bold text-sm">{m.name[0]?.toUpperCase()}</span>
                    )}
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link to={`/profile/${m.id}`} className="text-sm font-bold text-luxury-ink truncate block hover:text-brand-teal transition-colors">
                      {m.name} {m.id === user?.uid && <span className="text-luxury-ink/30">(You)</span>}
                    </Link>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30 truncate">{m.school || ''}</p>
                  </div>
                  {getRoleLabel(m.id) !== 'Member' && (
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${getRoleBadgeColor(m.id)}`}>
                      {getRoleLabel(m.id)}
                    </span>
                  )}
                  {/* Action menu for leads */}
                  {isLead && m.id !== user?.uid && (
                    <button onClick={() => setMemberActionId(memberActionId === m.id ? null : m.id)} className="p-1.5 hover:bg-surface-base rounded-lg transition-colors text-luxury-ink/20">
                      <Settings size={14} />
                    </button>
                  )}
                  {isColeader && !isLead && m.id !== user?.uid && m.id !== club.leadId && !club.coLeadIds.includes(m.id) && (
                    <button onClick={() => handleKick(m.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-luxury-ink/20 hover:text-red-500">
                      <UserMinus size={14} />
                    </button>
                  )}

                  {/* Member action dropdown (lead only) */}
                  {memberActionId === m.id && isLead && (
                    <div className="absolute right-12 top-1 z-20 w-44 bg-surface-card rounded-xl shadow-2xl border py-1.5 overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
                      {club.coLeadIds.includes(m.id) ? (
                        <button onClick={() => handleDemote(m.id)} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-luxury-ink hover:bg-surface-soft w-full">
                          <Shield size={14} className="text-luxury-ink/40" /> Demote to member
                        </button>
                      ) : (
                        <button onClick={() => handlePromote(m.id)} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-luxury-ink hover:bg-surface-soft w-full">
                          <Shield size={14} className="text-brand-teal" /> Promote to co-lead
                        </button>
                      )}
                      <button onClick={() => { setShowTransferModal(true); setMemberActionId(null); }} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-luxury-ink hover:bg-surface-soft w-full border-t border-luxury-ink/5">
                        <Crown size={14} className="text-amber-500" /> Transfer leadership
                      </button>
                      <button onClick={() => handleKick(m.id)} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-500 hover:bg-red-50 w-full border-t border-luxury-ink/5">
                        <UserMinus size={14} /> Remove from club
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Settings (Lead only) */}
        {isLead && (
          <div className="theme-card rounded-3xl p-6 border border-luxury-ink/5">
            <h3 className="text-sm font-bold text-luxury-ink mb-4 flex items-center gap-2">
              <Settings size={16} className="text-brand-teal" /> Club Settings
            </h3>
            <div className="space-y-4">
              {/* Public/Private toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {club.type === 'public' ? <Globe size={18} className="text-brand-teal" /> : <Lock size={18} className="text-luxury-ink/40" />}
                  <div>
                    <p className="text-sm font-bold text-luxury-ink">Club Visibility</p>
                    <p className="text-[11px] text-luxury-ink/40">{club.type === 'public' ? 'Anyone can discover & join' : 'Join by invite link only'}</p>
                  </div>
                </div>
                <button onClick={handleToggleType} className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors ${club.type === 'public' ? 'bg-brand-teal/10 text-brand-teal' : 'bg-luxury-ink/5 text-luxury-ink/40'}`}>
                  {club.type}
                </button>
              </div>

              {/* Hide members */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Users size={18} className="text-luxury-ink/40" />
                  <div>
                    <p className="text-sm font-bold text-luxury-ink">Hide Member List</p>
                    <p className="text-[11px] text-luxury-ink/40">Hide members if count exceeds 50</p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleSetting('hideMembersAbove50', !club.settings?.hideMembersAbove50)}
                  className={`w-12 h-7 rounded-full transition-colors relative ${club.settings?.hideMembersAbove50 ? 'bg-brand-teal' : 'bg-luxury-ink/10'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-transform shadow-sm ${club.settings?.hideMembersAbove50 ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Only leads can post */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Megaphone size={18} className="text-luxury-ink/40" />
                  <div>
                    <p className="text-sm font-bold text-luxury-ink">Announcement Mode</p>
                    <p className="text-[11px] text-luxury-ink/40">Only leads & co-leads can send messages</p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleSetting('onlyLeadsCanPost', !club.settings?.onlyLeadsCanPost)}
                  className={`w-12 h-7 rounded-full transition-colors relative ${club.settings?.onlyLeadsCanPost ? 'bg-brand-teal' : 'bg-luxury-ink/10'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-transform shadow-sm ${club.settings?.onlyLeadsCanPost ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Slow Mode */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock size={18} className="text-luxury-ink/40" />
                  <div>
                    <p className="text-sm font-bold text-luxury-ink">Slow Mode</p>
                    <p className="text-[11px] text-luxury-ink/40">Limit how often members can send</p>
                  </div>
                </div>
                <select
                  value={club.settings?.slowMode || 0}
                  onChange={(e) => handleToggleSetting('slowMode', Number(e.target.value))}
                  className="bg-surface-base border border-luxury-ink/5 rounded-xl px-3 py-1.5 text-xs font-bold text-luxury-ink focus:outline-none focus:border-brand-teal"
                >
                  <option value={0}>Off</option>
                  <option value={30}>30 seconds</option>
                  <option value={60}>1 minute</option>
                  <option value={300}>5 minutes</option>
                </select>
              </div>

              {/* Default mute */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BellOff size={18} className="text-luxury-ink/40" />
                  <div>
                    <p className="text-sm font-bold text-luxury-ink">Mute Notifications</p>
                    <p className="text-[11px] text-luxury-ink/40">Muted by default for new members</p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleSetting('muteNotifications', !club.settings?.muteNotifications)}
                  className={`w-12 h-7 rounded-full transition-colors relative ${club.settings?.muteNotifications ? 'bg-brand-teal' : 'bg-luxury-ink/10'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-transform shadow-sm ${club.settings?.muteNotifications ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Danger Zone */}
        <div className="theme-card rounded-3xl p-6 border border-red-100">
          <h3 className="text-sm font-bold text-red-500 mb-4">Danger Zone</h3>
          <div className="space-y-3">
            {!isLead && (
              <button onClick={() => setShowLeaveConfirm(true)} className="w-full flex items-center gap-3 p-3 rounded-xl text-red-500 hover:bg-red-50 transition-colors text-sm font-bold">
                <LogOut size={18} /> Leave Club
              </button>
            )}
            {isLead && (
              <>
                <button onClick={() => setShowTransferModal(true)} className="w-full flex items-center gap-3 p-3 rounded-xl text-luxury-ink hover:bg-surface-soft transition-colors text-sm font-bold">
                  <Crown size={18} className="text-amber-500" /> Transfer Leadership
                </button>
                <button onClick={() => setShowDeleteConfirm(true)} className="w-full flex items-center gap-3 p-3 rounded-xl text-red-500 hover:bg-red-50 transition-colors text-sm font-bold">
                  <Trash2 size={18} /> Delete Club
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Add Member Modal */}
      <AnimatePresence>
        {showAddMember && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-luxury-ink/20 backdrop-blur-sm"
            onClick={() => { setShowAddMember(false); setSearchUsers(''); }}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="theme-card rounded-3xl w-full max-w-md shadow-2xl border border-luxury-ink/5 max-h-[70vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-luxury-ink/5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-luxury-ink">Add Member</h3>
                  <button onClick={() => { setShowAddMember(false); setSearchUsers(''); }} className="p-2 text-luxury-ink/40 hover:text-luxury-ink rounded-full">
                    <X size={20} />
                  </button>
                </div>
                <p className="text-xs text-luxury-ink/40 mb-3">You can only add users who follow you. Otherwise, share the invite link.</p>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-luxury-ink/20" size={16} />
                  <input type="text" value={searchUsers} onChange={(e) => setSearchUsers(e.target.value)}
                    placeholder="Search by name..." autoFocus
                    className="w-full bg-surface-base border border-luxury-ink/5 rounded-xl py-3.5 pl-11 pr-4 focus:outline-none focus:border-brand-teal text-sm font-medium" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {searchingUsers ? (
                  <div className="py-8 text-center"><div className="w-6 h-6 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto" /></div>
                ) : userResults.length > 0 ? (
                  <div className="space-y-1">
                    {userResults.map((u) => (
                      <button key={u.id} onClick={() => handleAddMember(u.id)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-soft transition-all text-left">
                        <div className="w-10 h-10 rounded-full bg-brand-teal/10 flex items-center justify-center overflow-hidden border border-luxury-ink/5 shrink-0">
                          {u.profilePicture ? (
                            <img src={getOptimizedImageUrl(u.profilePicture)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <span className="text-brand-teal font-bold text-sm">{u.name?.[0]?.toUpperCase()}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-luxury-ink text-sm">{u.name}</p>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30">{u.school}</p>
                        </div>
                        <UserPlus size={16} className="text-brand-teal" />
                      </button>
                    ))}
                  </div>
                ) : searchUsers.trim() ? (
                  <p className="text-luxury-ink/30 text-sm text-center py-8">No users found</p>
                ) : (
                  <p className="text-luxury-ink/30 text-sm text-center py-8">Type a name to search</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Leave Confirm */}
      <AnimatePresence>
        {showLeaveConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-luxury-ink/20 backdrop-blur-sm"
            onClick={() => setShowLeaveConfirm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="theme-card w-full max-w-sm rounded-3xl p-6 shadow-2xl border" style={{ borderColor: 'var(--color-border)' }}
              onClick={(e) => e.stopPropagation()}>
              <h3 className="text-xl font-bold text-red-500 mb-2">Leave Club</h3>
              <p className="text-luxury-ink/60 text-sm mb-6">Are you sure you want to leave "{club.name}"?</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowLeaveConfirm(false)} className="px-5 py-2.5 rounded-full text-sm font-bold text-luxury-ink/60 hover:bg-surface-soft">Cancel</button>
                <button onClick={handleLeave} className="px-5 py-2.5 bg-red-500 text-white rounded-full text-sm font-bold hover:bg-red-600 shadow-lg">Leave</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirm */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-luxury-ink/20 backdrop-blur-sm"
            onClick={() => setShowDeleteConfirm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="theme-card w-full max-w-sm rounded-3xl p-6 shadow-2xl border" style={{ borderColor: 'var(--color-border)' }}
              onClick={(e) => e.stopPropagation()}>
              <h3 className="text-xl font-bold text-red-500 mb-2">Delete Club</h3>
              <p className="text-luxury-ink/60 text-sm mb-6">This will permanently delete "{club.name}" and all its messages. This cannot be undone.</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowDeleteConfirm(false)} className="px-5 py-2.5 rounded-full text-sm font-bold text-luxury-ink/60 hover:bg-surface-soft">Cancel</button>
                <button onClick={handleDelete} className="px-5 py-2.5 bg-red-500 text-white rounded-full text-sm font-bold hover:bg-red-600 shadow-lg">Delete Forever</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transfer Leadership Modal */}
      <AnimatePresence>
        {showTransferModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-luxury-ink/20 backdrop-blur-sm"
            onClick={() => setShowTransferModal(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="theme-card w-full max-w-md rounded-3xl shadow-2xl border border-luxury-ink/5 max-h-[60vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-luxury-ink/5">
                <h3 className="text-xl font-bold text-luxury-ink">Transfer Leadership</h3>
                <p className="text-xs text-luxury-ink/40 mt-1">Choose a new lead for this club</p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-1">
                {members.filter((m) => m.id !== user?.uid).map((m) => (
                  <button key={m.id} onClick={() => handleTransferLead(m.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-soft transition-all text-left">
                    <div className="w-10 h-10 rounded-full bg-brand-teal/10 flex items-center justify-center overflow-hidden border border-luxury-ink/5 shrink-0">
                      {m.profilePicture ? (
                        <img src={getOptimizedImageUrl(m.profilePicture)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="text-brand-teal font-bold text-sm">{m.name[0]?.toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-luxury-ink text-sm">{m.name}</p>
                    </div>
                    <Crown size={16} className="text-amber-500" />
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
