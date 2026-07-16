/**
 * MessagesLayout.tsx
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, User, ShieldCheck, Search, Lock, X, Send, Users, Globe, Crown, ArrowLeft, Archive, BellOff, ArchiveRestore, Pin, MailOpen, Trash2, CheckCircle2, Circle } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { db } from '../../lib/firebase';
import {
  collection, query, where, onSnapshot, getDoc, doc,
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { getOptimizedImageUrl } from '../../lib/utils';
import { getOrCreateDMRoom } from '../../lib/dm';
import { useScrollLock } from '../../hooks/useScrollLock';
import { useAllBlockedUserIds } from '../../lib/blocks';
import { useUserClubs, createClub } from '../../lib/clubs';
import {
  markConversationRead, markConversationUnread,
  muteConversation, unmuteConversation,
  archiveConversation, unarchiveConversation,
  pinConversation, unpinConversation,
  deleteConversationForUser, bulkConversationOp,
  type ConvCollection,
} from '../../lib/conversations';
import { useToast } from '../../lib/ToastContext';
import ChatRoom from './ChatRoom';
import ClubChat from './ClubChat';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { SelectionToolbar, type SelectionAction } from '../../components/chat/SelectionToolbar';
import { searchPublicUsers } from '../../lib/discovery';
import { sortMillis } from '../../lib/conversationSort';

interface ChatRoomItem {
  id: string;
  participants: string[];
  lastMessage?: string;
  lastSenderId?: string;
  updatedAt: any;
  productTitle: string;
  productId?: string;
  type?: string;
  otherUser?: any;
  unreadBy?: string[];
  // Per-user conversation state (see src/lib/conversations.ts). Absent = empty.
  mutedBy?: string[];
  archivedBy?: string[];
  pinnedBy?: string[];
  deletedBy?: string[];
  // True when this row came from a snapshot with an unresolved local write
  // (just-sent updatedAt: serverTimestamp()). See lib/conversationSort.
  _pendingWrite?: boolean;
}

export default function MessagesLayout() {
  const { user, userData } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const uid = user?.uid || '';
  const { roomId: routeRoomId, clubId: routeClubId } = useParams<{ roomId?: string; clubId?: string }>();
  const { showToast } = useToast();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // The "active" chat — either from URL param or clicked in sidebar
  const [activeRoomId, setActiveRoomId] = useState<string | null>(routeClubId || routeRoomId || null);
  const [activeRoomState, setActiveRoomState] = useState<any>(location.state || null);

  // Component-scoped user profile cache — prevents duplicate fetches, clears on unmount
  const userCacheRef = useRef<{ [key: string]: Promise<any> }>({});

  const [chatRooms, setChatRooms] = useState<ChatRoomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatSearchTerm, setChatSearchTerm] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // Inbox multi-select
  const [selectMode, setSelectMode] = useState(false);
  const [selectedRooms, setSelectedRooms] = useState<Map<string, ConvCollection>>(new Map());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  // New DM modal
  const [showNewDM, setShowNewDM] = useState(false);
  const [searchUsers, setSearchUsers] = useState('');
  const [userResults, setUserResults] = useState<any[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [creatingDM, setCreatingDM] = useState(false);

  // Clubs
  const [activeRoomType, setActiveRoomType] = useState<'chat' | 'club'>(routeClubId ? 'club' : 'chat');
  const [showCreateClub, setShowCreateClub] = useState(false);
  const [clubName, setClubName] = useState('');
  const [clubDescription, setClubDescription] = useState('');
  const [clubType, setClubType] = useState<'public' | 'private'>('public');
  const [creatingClub, setCreatingClub] = useState(false);

  const { clubs, loading: clubsLoading } = useUserClubs(user?.uid);
  const allBlockedIds = useAllBlockedUserIds();

  useScrollLock(showNewDM || showCreateClub);

  // Clear any pending long-press timer on unmount.
  useEffect(() => () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  // Listen to toggle events from global sidebar
  useEffect(() => {
    const handleToggle = () => {
      setSidebarCollapsed(prev => !prev);
    };
    window.addEventListener('messages-sidebar-toggle', handleToggle);
    return () => window.removeEventListener('messages-sidebar-toggle', handleToggle);
  }, []);

  // Keep activeRoomId in sync when the URL param changes (deep-link / browser
  // navigation). Both /messages/:roomId and /messages/club/:clubId render this
  // same component, so React Router swaps the param without a remount.
  useEffect(() => {
    if (routeClubId) {
      setActiveRoomId(routeClubId);
      setActiveRoomType('club');
      setActiveRoomState(null);
    } else if (routeRoomId) {
      setActiveRoomId(routeRoomId);
      setActiveRoomType('chat');
      setActiveRoomState(location.state || null);
    } else {
      setActiveRoomId(null);
      setActiveRoomState(null);
    }
  }, [routeRoomId, routeClubId]);



  // Load chat rooms
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'chatRooms'),
      where('participants', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        const rooms: ChatRoomItem[] = [];
        const uncachedUserIds = new Set<string>();

        // Identify which users need to be fetched
        for (const roomDoc of snapshot.docs) {
          const data = roomDoc.data() as ChatRoomItem;
          const otherUserId = data.participants.find(id => id !== user.uid);
          if (otherUserId && !userCacheRef.current[otherUserId]) {
            uncachedUserIds.add(otherUserId);
          }
        }

        // Trigger fetches for any new users
        if (uncachedUserIds.size > 0) {
          Array.from(uncachedUserIds).forEach((userId) => {
            userCacheRef.current[userId] = getDoc(doc(db, 'users', userId))
              .then((uDoc) => {
                return uDoc.exists()
                  ? { id: userId, ...uDoc.data() }
                  : { id: userId, name: 'Deleted User', profilePicture: null };
              })
              .catch(() => {
                return { id: userId, name: 'User', profilePicture: null };
              });
          });
        }

        // Wait for all user profiles in the current rooms to resolve
        const resolvedUsersList = await Promise.all(
          snapshot.docs.map(async (roomDoc) => {
            const data = roomDoc.data() as ChatRoomItem;
            const otherUserId = data.participants.find(id => id !== user.uid);
            if (!otherUserId) return null;

            const otherUser = await userCacheRef.current[otherUserId];
            return { roomId: roomDoc.id, otherUser };
          })
        );

        const usersMap = Object.fromEntries(
          resolvedUsersList.filter(Boolean).map((x: any) => [x.roomId, x.otherUser])
        );

        for (const roomDoc of snapshot.docs) {
          const data = roomDoc.data() as ChatRoomItem;
          rooms.push({
            id: roomDoc.id,
            ...data,
            otherUser: usersMap[roomDoc.id],
            // A just-sent message writes updatedAt: serverTimestamp(), which
            // reads null in the immediate local snapshot (hasPendingWrites).
            // Mark it so the sort keeps it at the top instead of dropping it to
            // the bottom then snapping back when the server timestamp resolves.
            _pendingWrite: roomDoc.metadata.hasPendingWrites,
          } as ChatRoomItem);
        }

        rooms.sort((a, b) => {
          const timeA = sortMillis(a);
          const timeB = sortMillis(b);
          return timeB - timeA;
        });

        setChatRooms(rooms);
      } catch (err) {
        console.error('Error processing chat rooms:', err);
      } finally {
        setLoading(false);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'chatRooms');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  // Search users for new DM
  useEffect(() => {
    if (!showNewDM) { setUserResults([]); return; }
    setSearchingUsers(true);

    let cancelled = false;
    searchPublicUsers({
      query: searchUsers,
      limit: 20,
      excludeIds: user ? [user.uid] : [],
    }).then((results) => {
      if (!cancelled) setUserResults(results.filter(u => !allBlockedIds.has(u.id)));
    }).catch((err) => {
      if (!cancelled) {
        console.error(err);
        setUserResults([]);
      }
    }).finally(() => {
      if (!cancelled) setSearchingUsers(false);
    });

    return () => { cancelled = true; };
  }, [searchUsers, showNewDM, user?.uid]);

  const handleStartDM = async (otherUserId: string) => {
    if (!user || creatingDM) return;
    setCreatingDM(true);
    try {
      const roomId = await getOrCreateDMRoom(user.uid, otherUserId);
      setShowNewDM(false);
      setSearchUsers('');
      const u = userResults.find(u => u.id === otherUserId);
      openChat(roomId, { otherUser: u });
    } catch (err: any) {
      if (err?.message?.includes('BLOCKED')) {
        showToast('Cannot message this user.', 'error');
      } else {
        console.error('Failed to create DM:', err);
      }
    } finally {
      setCreatingDM(false);
    }
  };

  const handleCreateClub = async () => {
    if (!user || !clubName.trim() || creatingClub) return;
    setCreatingClub(true);
    try {
      const clubId = await createClub(user.uid, clubName, clubDescription, clubType, userData?.school, userData?.city);
      showToast('Club created!', 'success');
      setShowCreateClub(false);
      setClubName(''); setClubDescription(''); setClubType('public');
      navigate(`/club/${clubId}`);
    } catch {
      showToast('Failed to create club', 'error');
    } finally {
      setCreatingClub(false);
    }
  };

  // Open a chat — on desktop: navigate to the in-panel route (same component,
  // no remount). On mobile: navigate to the full-screen route.
  const openChat = (roomId: string, state?: any, type: 'chat' | 'club' = 'chat') => {
    // Opening un-deletes and clears unread instantly in the inbox (the chat
    // engine also clears unread on view; this keeps the list responsive).
    if (uid) {
      markConversationRead(type === 'club' ? 'clubs' : 'chatRooms', roomId, uid).catch(() => {});
    }
    const isDesktop = window.innerWidth >= 768;
    if (isDesktop) {
      navigate(type === 'club' ? `/messages/club/${roomId}` : `/messages/${roomId}`, { state });
    } else {
      navigate(type === 'club' ? `/club/${roomId}` : `/chat/${roomId}`, { state });
    }
  };

  // Close chat panel — return to the inbox list route
  const handleChatBack = () => {
    navigate('/messages');
  };

  // ── Multi-select ──────────────────────────────────────
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedRooms(new Map());
  };

  const toggleRoomSelection = (id: string, collectionPath: ConvCollection) => {
    setSelectedRooms((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, collectionPath);
      return next;
    });
  };

  const enterSelectWith = (id: string, collectionPath: ConvCollection) => {
    setSelectMode(true);
    setSelectedRooms(new Map([[id, collectionPath]]));
  };

  // Long-press to enter select mode on touch/mobile.
  const handleRowPointerDown = (id: string, collectionPath: ConvCollection) => {
    longPressFired.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      enterSelectWith(id, collectionPath);
      longPressTimer.current = null;
    }, 500);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // A row click either toggles selection (in select mode) or opens the chat.
  // Suppress the click that immediately follows a long-press (which already
  // selected the row), so it doesn't toggle it back off.
  const handleRowActivate = (id: string, collectionPath: ConvCollection, open: () => void) => {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    if (selectMode) {
      toggleRoomSelection(id, collectionPath);
    } else {
      open();
    }
  };

  // Run a bulk op across the current selection, toast partial failures, exit.
  const runBulk = async (
    op: (c: ConvCollection, roomId: string, u: string) => Promise<void>,
    successMsg: string
  ) => {
    const items = Array.from(selectedRooms.entries()).map(([roomId, collection]) => ({ collection, roomId }));
    if (items.length === 0 || !uid) return;
    const results = await bulkConversationOp(items, op, uid);
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      showToast(`${successMsg} (${items.length - failed}/${items.length}; ${failed} failed)`, failed === items.length ? 'error' : 'info');
    } else {
      showToast(successMsg, 'success');
    }
    exitSelectMode();
  };

  // Selection-derived toggles: pick the op that makes the majority consistent.
  const selectedItems = () => Array.from(selectedRooms.entries()).map(([id, c]) => ({ id, c }));
  const allSelected = (pred: (id: string, c: ConvCollection) => boolean) =>
    selectedItems().length > 0 && selectedItems().every(({ id, c }) => pred(id, c));

  // Resolve a per-user flag from the raw source lists (NOT the view-filtered
  // combinedList) so a selected row that has scrolled out of the current view
  // still reports its true state — otherwise a missing lookup defaults to false
  // and flips the bulk toggle the wrong way.
  const isRoomFlag = (id: string, c: ConvCollection, field: 'pinnedBy' | 'mutedBy' | 'unreadBy') => {
    const item = (c === 'clubs' ? clubs.find((x) => x.id === id) : chatRooms.find((x) => x.id === id)) as any;
    return !!item?.[field]?.includes(uid);
  };

  const handleBulkPin = () => {
    const everyPinned = allSelected((id, c) => isRoomFlag(id, c, 'pinnedBy'));
    runBulk(everyPinned ? unpinConversation : pinConversation, everyPinned ? 'Unpinned' : 'Pinned');
  };
  const handleBulkReadToggle = () => {
    const everyRead = allSelected((id, c) => !isRoomFlag(id, c, 'unreadBy'));
    runBulk(everyRead ? markConversationUnread : markConversationRead, everyRead ? 'Marked unread' : 'Marked read');
  };
  const handleBulkMute = () => {
    const everyMuted = allSelected((id, c) => isRoomFlag(id, c, 'mutedBy'));
    runBulk(everyMuted ? unmuteConversation : muteConversation, everyMuted ? 'Unmuted' : 'Muted');
  };
  const handleBulkArchive = () => {
    // In the archived view, the action restores; otherwise it archives.
    runBulk(showArchived ? unarchiveConversation : archiveConversation, showArchived ? 'Unarchived' : 'Archived');
  };
  const handleBulkDelete = () => setShowBulkDeleteConfirm(true);
  const confirmBulkDelete = () => {
    setShowBulkDeleteConfirm(false);
    runBulk(deleteConversationForUser, 'Deleted');
  };

  const bulkActions: SelectionAction[] = [
    { key: 'pin', icon: <Pin size={18} />, label: 'Pin', onClick: handleBulkPin },
    { key: 'read', icon: <MailOpen size={18} />, label: 'Mark read/unread', onClick: handleBulkReadToggle },
    { key: 'mute', icon: <BellOff size={18} />, label: 'Mute/unmute', onClick: handleBulkMute },
    { key: 'archive', icon: showArchived ? <ArchiveRestore size={18} /> : <Archive size={18} />, label: showArchived ? 'Unarchive' : 'Archive', onClick: handleBulkArchive },
    { key: 'delete', icon: <Trash2 size={18} />, label: 'Delete', onClick: handleBulkDelete, danger: true },
  ];


  if (userData && !userData.verified) {
    return (
      <div className="pt-32 pb-20 px-6 max-w-4xl mx-auto text-center">
        <div className="bg-surface-card rounded-3xl p-20 luxury-shadow border border-luxury-ink/5">
          <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Lock className="text-amber-500" size={32} />
          </div>
          <h3 className="text-2xl font-serif font-bold text-luxury-ink mb-2 italic">Verification <span className="not-italic">Required</span></h3>
          <p className="text-luxury-ink/40 text-sm max-w-sm mx-auto mb-8 font-medium">To keep our campus safe, you must be a verified student to access direct messaging.</p>
          <a href="/verification" className="inline-block bg-brand-teal text-white px-8 py-4 rounded-full font-bold hover:bg-brand-mint transition-all luxury-shadow uppercase text-[10px] tracking-widest">
            Complete Verification
          </a>
        </div>
      </div>
    );
  }

  // Per-user visibility: a room is hidden by soft-delete unless it has new
  // activity (I'm back in unreadBy); archived rooms live in a separate view.
  const isVisibleInView = (item: { deletedBy?: string[]; archivedBy?: string[]; unreadBy?: string[] }) => {
    const isDeleted = !!item.deletedBy?.includes(uid) && !item.unreadBy?.includes(uid);
    if (isDeleted) return false;
    const isArchived = !!item.archivedBy?.includes(uid);
    return showArchived ? isArchived : !isArchived;
  };

  const filteredChatRooms = chatRooms.filter((room) => {
    const otherUserId = room.participants.find(id => id !== user?.uid);
    if (otherUserId && allBlockedIds.has(otherUserId)) return false;
    if (!isVisibleInView(room)) return false;
    if (chatSearchTerm.trim()) {
      return (room.otherUser?.name?.toLowerCase() || '').includes(chatSearchTerm.toLowerCase());
    }
    return true;
  });

  const filteredClubs = clubs
    .filter(isVisibleInView)
    .filter((c) => !chatSearchTerm.trim() || c.name.toLowerCase().includes(chatSearchTerm.toLowerCase()));

  // Count archived rooms (across both collections) for the Archived toggle badge.
  const archivedCount =
    chatRooms.filter((r) => r.archivedBy?.includes(uid) && !(r.deletedBy?.includes(uid) && !r.unreadBy?.includes(uid))).length +
    clubs.filter((c) => c.archivedBy?.includes(uid) && !(c.deletedBy?.includes(uid) && !c.unreadBy?.includes(uid))).length;

  const combinedList = [
    ...filteredChatRooms.map(room => ({ ...room, isClub: false })),
    ...filteredClubs.map(club => ({ ...club, isClub: true }))
  ].sort((a, b) => {
    // Pinned conversations sort above unpinned; recency within each group.
    const aPinned = (a as any).pinnedBy?.includes(uid) ? 1 : 0;
    const bPinned = (b as any).pinnedBy?.includes(uid) ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    return sortMillis(b as any) - sortMillis(a as any);
  });

  // ─────────────────────────────────────────────
  // SIDEBAR
  // ─────────────────────────────────────────────
  const Sidebar = (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className={`pt-5 border-b border-luxury-ink/5 bg-surface-base shrink-0 transition-all ${
        sidebarCollapsed ? 'px-2 pb-4' : 'px-4 pb-0'
      }`}>
        {sidebarCollapsed ? (
          <div className="flex flex-col items-center gap-3">
            <button onClick={() => setShowNewDM(true)} className="p-2 text-brand-teal bg-brand-teal/10 rounded-full hover:bg-brand-teal/20 transition-colors" title="New Message">
              <MessageSquare size={16} />
            </button>
            <button onClick={() => setShowCreateClub(true)} className="p-2 text-brand-teal bg-brand-teal/10 rounded-full hover:bg-brand-teal/20 transition-colors" title="New Club">
              <Users size={16} />
            </button>
          </div>
        ) : selectMode ? (
          <div className="flex items-center justify-between mb-4 min-h-[36px]">
            <span className="text-sm font-bold text-luxury-ink">{selectedRooms.size} selected</span>
            <SelectionToolbar count={selectedRooms.size} actions={bulkActions} onCancel={exitSelectMode} />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-xl font-bold text-luxury-ink leading-none">Messages</h1>
              <div className="flex gap-2">
                <button onClick={() => setShowNewDM(true)} className="p-2 text-brand-teal bg-brand-teal/10 rounded-full hover:bg-brand-teal/20 transition-colors" title="New Message">
                  <MessageSquare size={16} />
                </button>
                <button onClick={() => setShowCreateClub(true)} className="p-2 text-brand-teal bg-brand-teal/10 rounded-full hover:bg-brand-teal/20 transition-colors" title="New Club">
                  <Users size={16} />
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="relative pt-1 pb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-ink/30 -mt-1.5" size={15} />
              <input
                type="text"
                placeholder="Search chats & clubs"
                value={chatSearchTerm}
                onChange={(e) => setChatSearchTerm(e.target.value)}
                className="w-full bg-surface-soft border-none rounded-xl py-2 pl-9 pr-3 focus:outline-none focus:ring-2 focus:ring-brand-teal/20 transition-all text-sm font-medium"
              />
            </div>
          </>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {/* Archived view toggle / header */}
        {!sidebarCollapsed && (showArchived || archivedCount > 0) && (
          showArchived ? (
            <button
              onClick={() => { exitSelectMode(); setShowArchived(false); }}
              className="w-full flex items-center gap-2 px-4 py-3 border-b border-luxury-ink/5 text-xs font-bold text-luxury-ink/60 hover:bg-surface-soft transition-colors"
            >
              <ArrowLeft size={14} /> Back to inbox
              <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30">Archived</span>
            </button>
          ) : (
            <button
              onClick={() => { exitSelectMode(); setShowArchived(true); }}
              className="w-full flex items-center gap-3 px-4 py-3 border-b border-luxury-ink/5 hover:bg-surface-soft transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-full bg-surface-soft flex items-center justify-center shrink-0">
                <Archive size={16} className="text-luxury-ink/40" />
              </div>
              <span className="text-sm font-semibold text-luxury-ink/70">Archived</span>
              <span className="ml-auto text-[10px] font-bold text-luxury-ink/30">{archivedCount}</span>
            </button>
          )
        )}
        {loading || clubsLoading ? (
          <div className="py-12 text-center font-serif italic text-luxury-ink/30 text-sm">Loading...</div>
        ) : combinedList.length === 0 ? (
          <div className="py-12 text-center px-2">
            <MessageSquare className="mx-auto text-brand-teal/20 mb-3" size={24} />
            {!sidebarCollapsed && (
              showArchived ? (
                <p className="text-sm font-bold text-luxury-ink/30">No archived chats</p>
              ) : (
              <>
                <p className="text-sm font-bold text-luxury-ink/30 mb-3">No messages</p>
                <button onClick={() => setShowNewDM(true)} className="text-xs font-bold text-brand-teal hover:underline block mx-auto mb-2">
                  Start a conversation
                </button>
                <button onClick={() => setShowCreateClub(true)} className="text-xs font-bold text-brand-teal hover:underline block mx-auto">
                  Create a club
                </button>
              </>
              )
            )}
          </div>
        ) : (
          combinedList.map((item) => {
            const isActive = item.id === activeRoomId;
            if (item.isClub) {
              const club = item as any;
              const isMuted = club.mutedBy?.includes(uid);
              const isUnread = club.unreadBy?.includes(uid) && !isMuted;
              const isChecked = selectedRooms.has(club.id);
              return (
                <button
                  key={`club-${club.id}`}
                  onClick={() => handleRowActivate(club.id, 'clubs', () => openChat(club.id, null, 'club'))}
                  onPointerDown={() => handleRowPointerDown(club.id, 'clubs')}
                  onPointerUp={cancelLongPress}
                  onPointerLeave={cancelLongPress}
                  onPointerMove={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                  className={`w-full flex items-center transition-colors cursor-pointer text-left ${
                    sidebarCollapsed ? 'justify-center py-3.5 px-2' : 'gap-3 py-3 px-4'
                  } ${
                    isChecked ? 'bg-brand-pink/8' : isActive ? 'bg-brand-teal/8 border-r-2 border-brand-teal' : isUnread ? 'bg-brand-teal/10 hover:bg-brand-teal/15' : 'hover:bg-surface-soft'
                  }`}
                  title={sidebarCollapsed ? club.name : undefined}
                >
                  {selectMode && !sidebarCollapsed && (
                    isChecked ? <CheckCircle2 size={20} className="text-brand-mint shrink-0" /> : <Circle size={20} className="text-luxury-ink/20 shrink-0" />
                  )}
                  <div className="relative shrink-0">
                    <div className={`rounded-xl bg-linear-to-br from-brand-teal/15 to-brand-pink/15 flex items-center justify-center overflow-hidden border border-luxury-ink/5 ${
                      sidebarCollapsed ? 'w-10 h-10' : 'w-11 h-11'
                    }`}>
                      {club.avatar ? (
                        <img src={getOptimizedImageUrl(club.avatar)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <Users size={sidebarCollapsed ? 16 : 18} className="text-brand-teal" />
                      )}
                    </div>
                    {club.type === 'private' && (
                      <div className="absolute -bottom-0.5 -right-0.5 bg-luxury-ink/60 text-white p-0.5 rounded-full border border-surface-base">
                        <Lock size={7} />
                      </div>
                    )}
                    {sidebarCollapsed && isUnread && (
                      <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-brand-teal rounded-full border-2 border-surface-base shrink-0" />
                    )}
                  </div>
                  {!sidebarCollapsed && (
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`truncate text-sm flex items-center gap-1 ${isUnread ? 'font-bold text-brand-teal' : 'font-semibold text-luxury-ink'}`}>
                          {club.name}
                          {club.leadId === user?.uid && <Crown size={10} className="text-amber-500 shrink-0" />}
                        </span>
                        <span className={`text-[10px] ml-1 shrink-0 flex items-center gap-1 ${isUnread ? 'text-brand-teal font-bold' : 'text-luxury-ink/30'}`}>
                          {isMuted && <BellOff size={10} className="text-luxury-ink/30" />}
                          {club.updatedAt?.toDate?.()?.toLocaleDateString([], { month: 'short', day: 'numeric' }) || ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className={`text-xs truncate flex-1 ${isUnread ? 'text-luxury-ink font-semibold' : 'text-luxury-ink/50'}`}>
                          {club.lastMessage
                            ? <>{club.lastSenderId === user?.uid ? 'You' : (club.lastSenderName || 'Someone')}: {club.lastMessage}</>
                            : <span className="italic text-luxury-ink/25">No messages yet</span>
                          }
                        </p>
                        {isUnread && <div className="w-2 h-2 bg-brand-teal rounded-full shrink-0" />}
                      </div>
                    </div>
                  )}
                </button>
              );
            } else {
              const room = item as any;
              const isMuted = room.mutedBy?.includes(uid);
              const isUnread = room.unreadBy?.includes(uid) && !isMuted;
              const isDM = room.type === 'dm' || !room.productTitle;
              const isChecked = selectedRooms.has(room.id);
              return (
                <button
                  key={`chat-${room.id}`}
                  onClick={() => handleRowActivate(room.id, 'chatRooms', () => openChat(room.id, { otherUser: room.otherUser, roomData: room }, 'chat'))}
                  onPointerDown={() => handleRowPointerDown(room.id, 'chatRooms')}
                  onPointerUp={cancelLongPress}
                  onPointerLeave={cancelLongPress}
                  onPointerMove={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                  className={`w-full flex items-center transition-colors cursor-pointer text-left ${
                    sidebarCollapsed ? 'justify-center py-3.5 px-2' : 'gap-3 py-3 px-4'
                  } ${
                    isChecked ? 'bg-brand-pink/8' : isActive ? 'bg-brand-teal/8 border-r-2 border-brand-teal' : isUnread ? 'bg-brand-teal/10 hover:bg-brand-teal/15' : 'hover:bg-surface-soft'
                  }`}
                  title={sidebarCollapsed ? (room.otherUser?.name || 'Unknown User') : undefined}
                >
                  {selectMode && !sidebarCollapsed && (
                    isChecked ? <CheckCircle2 size={20} className="text-brand-mint shrink-0" /> : <Circle size={20} className="text-luxury-ink/20 shrink-0" />
                  )}
                  <div className="relative shrink-0">
                    <div className={`rounded-full bg-brand-teal/5 flex items-center justify-center overflow-hidden ${
                      sidebarCollapsed ? 'w-10 h-10' : 'w-11 h-11'
                    }`}>
                      {room.otherUser?.profilePicture ? (
                        <img src={getOptimizedImageUrl(room.otherUser.profilePicture)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <User size={sidebarCollapsed ? 18 : 20} className="text-brand-teal" />
                      )}
                    </div>
                    {room.otherUser?.verified && (
                      <div className="absolute bottom-0 right-0 bg-brand-teal text-white p-0.5 rounded-full border-2 border-surface-base">
                        <ShieldCheck size={8}  />
                      </div>
                    )}
                    {sidebarCollapsed && isUnread && (
                      <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-brand-teal rounded-full border-2 border-surface-base shrink-0" />
                    )}
                  </div>
                  {!sidebarCollapsed && (
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`truncate text-sm ${isUnread ? 'font-bold text-brand-teal' : 'font-semibold text-luxury-ink'}`}>
                          {room.otherUser?.name || 'Unknown User'}
                        </span>
                        <span className={`text-[10px] whitespace-nowrap ml-1 shrink-0 flex items-center gap-1 ${isUnread ? 'text-brand-teal font-bold' : 'text-luxury-ink/30'}`}>
                          {isMuted && <BellOff size={10} className="text-luxury-ink/30" />}
                          {room.updatedAt?.toDate?.()?.toLocaleDateString([], { month: 'short', day: 'numeric' }) || ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className={`text-xs truncate flex-1 ${isUnread ? 'text-luxury-ink font-semibold' : 'text-luxury-ink/50'}`}>
                          {!isDM && <span className="text-brand-teal font-medium mr-1">[{room.productTitle}]</span>}
                          {room.lastSenderId === user?.uid ? 'You: ' : ''}{room.lastMessage || 'Start the conversation...'}
                        </p>
                        {isUnread && <div className="w-2 h-2 bg-brand-teal rounded-full shrink-0" />}
                      </div>
                    </div>
                  )}
                </button>
              );
            }
          })
        )}
      </div>
    </div>
  );

  // ─────────────────────────────────────────────
  // EMPTY STATE (no chat selected on desktop)
  // ─────────────────────────────────────────────
  const EmptyState = (
    <div className="hidden md:flex flex-col flex-1 items-center justify-center text-center p-8">
      <div className="w-20 h-20 bg-brand-teal/5 rounded-full flex items-center justify-center mb-5">
        <MessageSquare size={36} className="text-brand-teal/30" />
      </div>
      <h2 className="text-xl font-bold text-luxury-ink mb-2">Your Messages</h2>
      <p className="text-luxury-ink/40 text-sm max-w-xs mb-6">Select a conversation from the list or start a new one.</p>
      <button
        onClick={() => setShowNewDM(true)}
        className="bg-luxury-ink text-surface-base px-6 py-3 rounded-full font-bold text-sm hover:bg-brand-teal transition-all"
      >
        New Message
      </button>
    </div>
  );

  return (
    <>
      {/* ── Main Layout ── */}
      <div className="flex h-full overflow-hidden bg-surface-base">
        {/* Sidebar — always visible on desktop, hidden on mobile when chat is open */}
        <div
          className={`
            flex flex-col border-r border-luxury-ink/5
            transition-all duration-300 ease-in-out shrink-0
            ${sidebarCollapsed ? 'w-18' : 'w-full md:w-[320px] lg:w-90'}
            ${activeRoomId ? 'hidden md:flex' : 'flex'}
          `}
        >
          {Sidebar}
        </div>

        {/* Chat panel — right side on desktop, full screen on mobile */}
        {activeRoomId ? (
          <div className="flex-1 flex flex-col overflow-hidden relative">
            {activeRoomType === 'club' ? (
              <ClubChat
                key={activeRoomId}
                panelMode
                roomIdOverride={activeRoomId}
                onBack={handleChatBack}
              />
            ) : (
              <ChatRoom
                key={activeRoomId}
                panelMode
                roomIdOverride={activeRoomId}
                panelState={activeRoomState}
                onBack={handleChatBack}
              />
            )}
          </div>
        ) : (
          EmptyState
        )}
      </div>

      {/* ── New DM Modal ── */}
      <AnimatePresence>
        {showNewDM && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-luxury-ink/20 backdrop-blur-sm"
            onClick={() => { setShowNewDM(false); setSearchUsers(''); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="theme-card rounded-3xl w-full max-w-md shadow-2xl border border-luxury-ink/5 max-h-[70vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-luxury-ink/5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-luxury-ink">New Message</h3>
                  <button onClick={() => { setShowNewDM(false); setSearchUsers(''); }} className="p-2 text-luxury-ink/40 hover:text-luxury-ink rounded-full transition-colors">
                    <X size={20} />
                  </button>
                </div>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-luxury-ink/20" size={16} />
                  <input
                    type="text" value={searchUsers} onChange={(e) => setSearchUsers(e.target.value)}
                    placeholder="Search by name..." autoFocus
                    className="w-full bg-surface-base border border-luxury-ink/5 rounded-xl py-3.5 pl-11 pr-4 focus:outline-none focus:border-brand-teal text-sm font-medium"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {searchingUsers ? (
                  <div className="py-8 text-center"><div className="w-6 h-6 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto" /></div>
                ) : userResults.length > 0 ? (
                  <div className="space-y-1">
                    {userResults.map(u => (
                      <button key={u.id} onClick={() => handleStartDM(u.id)} disabled={creatingDM}
                        className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-surface-soft transition-all text-left disabled:opacity-50">
                        <div className="w-12 h-12 rounded-full bg-brand-teal/5 flex items-center justify-center overflow-hidden border border-luxury-ink/5 shrink-0">
                          {u.profilePicture
                            ? <img src={getOptimizedImageUrl(u.profilePicture)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            : <span className="text-brand-teal font-serif font-bold text-lg">{u.name?.[0]?.toUpperCase()}</span>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-luxury-ink text-sm flex items-center gap-1.5">
                            {u.name} {u.verified && <ShieldCheck size={14} className="text-brand-teal"  />}
                          </p>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30 truncate">{u.school}</p>
                        </div>
                        <Send size={16} className="text-luxury-ink/20" />
                      </button>
                    ))}
                  </div>
                ) : searchUsers.trim() ? (
                  <div className="py-8 text-center"><p className="text-luxury-ink/30 text-sm">No users found</p></div>
                ) : (
                  <div className="py-8 text-center">
                    <User className="mx-auto text-luxury-ink/10 mb-3" size={40} />
                    <p className="text-luxury-ink/30 text-sm font-medium">Type a name to find someone</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Create Club Modal ── */}
      <AnimatePresence>
        {showCreateClub && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-luxury-ink/20 backdrop-blur-sm"
            onClick={() => setShowCreateClub(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="theme-card rounded-3xl w-full max-w-md shadow-2xl border border-luxury-ink/5 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-luxury-ink/5">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-xl font-bold text-luxury-ink">Create Club</h3>
                  <button onClick={() => setShowCreateClub(false)} className="p-2 text-luxury-ink/40 hover:text-luxury-ink rounded-full"><X size={20} /></button>
                </div>
                <p className="text-xs text-luxury-ink/40">Start a group chat for your community</p>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/40 mb-2 block">Club Name *</label>
                  <input type="text" value={clubName} onChange={(e) => setClubName(e.target.value)} placeholder="e.g. Physics Study Group" maxLength={100}
                    className="w-full bg-surface-base border border-luxury-ink/5 rounded-xl py-3.5 px-4 focus:outline-none focus:border-brand-teal text-sm font-medium" />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/40 mb-2 block">Description</label>
                  <textarea value={clubDescription} onChange={(e) => setClubDescription(e.target.value)} placeholder="What's this club about?" maxLength={500} rows={3}
                    className="w-full bg-surface-base border border-luxury-ink/5 rounded-xl py-3.5 px-4 focus:outline-none focus:border-brand-teal text-sm font-medium resize-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/40 mb-3 block">Visibility</label>
                  <div className="flex gap-3">
                    {(['public', 'private'] as const).map((t) => (
                      <button key={t} onClick={() => setClubType(t)}
                        className={`flex-1 p-4 rounded-2xl border-2 transition-all text-center ${clubType === t ? 'border-brand-teal bg-brand-teal/5' : 'border-luxury-ink/5 hover:border-luxury-ink/10'}`}>
                        {t === 'public' ? <Globe size={20} className={`mx-auto mb-2 ${clubType === t ? 'text-brand-teal' : 'text-luxury-ink/20'}`} /> : <Lock size={20} className={`mx-auto mb-2 ${clubType === t ? 'text-brand-teal' : 'text-luxury-ink/20'}`} />}
                        <p className={`text-sm font-bold ${clubType === t ? 'text-brand-teal' : 'text-luxury-ink/40'}`}>{t.charAt(0).toUpperCase() + t.slice(1)}</p>
                        <p className="text-[10px] text-luxury-ink/30 mt-1">{t === 'public' ? 'Anyone can find & join' : 'Invite link only'}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={handleCreateClub} disabled={!clubName.trim() || creatingClub}
                  className="w-full py-4 bg-luxury-ink text-surface-base rounded-full font-bold text-sm hover:bg-brand-teal transition-all shadow-lg disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {creatingClub ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Create Club'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bulk Delete Confirm ── */}
      <ConfirmDialog
        isOpen={showBulkDeleteConfirm}
        title="Delete conversations"
        message={`Remove ${selectedRooms.size} conversation${selectedRooms.size === 1 ? '' : 's'} from your inbox? Messages are not deleted, and a conversation reappears if it receives new activity.`}
        confirmLabel="Delete"
        onConfirm={confirmBulkDelete}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />
    </>
  );
}
