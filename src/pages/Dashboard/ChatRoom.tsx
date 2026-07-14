import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { doc, getDoc, updateDoc, serverTimestamp, writeBatch, collection, getDocs, deleteField, arrayUnion } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { useBlockedIds, useBlockedByIds } from '../../lib/blocks';
import { useUserPresence } from '../../lib/presence';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { getOptimizedImageUrl } from '../../lib/utils';
import ReportModal from '../../components/ui/ReportModal';
import ChatView from '../../components/chat/ChatView';
import { ChatSkeleton } from '../../components/ui/skeleton/Skeleton';
import { ArrowLeft, User, Package, X, Flag, Pin } from 'lucide-react';

interface ChatRoomProps {
  panelMode?: boolean;
  onBack?: () => void;
  roomIdOverride?: string;
  panelState?: any; // Desktop panel: state passed directly (avoids history.state hack)
}

export interface ChatRoomData {
  id: string;
  participants: string[];
  lastMessage?: string;
  lastSenderId?: string;
  updatedAt: any;
  productId?: string;
  productTitle?: string;
  pinnedMessageId?: string;
  pinnedMessageText?: string;
  status?: 'active' | 'pending';
  requestedBy?: string;
  unreadBy?: string[];
}

export default function ChatRoom({ panelMode, onBack, roomIdOverride, panelState }: ChatRoomProps = {}) {
  const params = useParams<{ roomId: string }>();
  const roomId = roomIdOverride || params.roomId;
  const { user, userData } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  // panelState is passed directly from MessagesLayout on desktop to avoid history.state hacks
  const initialState = panelState ?? location.state;
  const [roomData, setRoomData] = useState<ChatRoomData | null>(initialState?.roomData || null);
  const [otherUser, setOtherUser] = useState<any>(initialState?.otherUser || null);
  const [showOptions, setShowOptions] = useState(false);
  const [showReport, setShowReport] = useState(false);

  const blockedIds = useBlockedIds();
  const blockedByIds = useBlockedByIds();

  const otherUserId = roomData?.participants?.find(id => id !== user?.uid);
  const otherPresence = useUserPresence(otherUserId);

  const isBlockedByMe = otherUserId ? blockedIds.has(otherUserId) : false;
  const hasBlockedMe = otherUserId ? blockedByIds.has(otherUserId) : false;
  const isBlocked = isBlockedByMe || hasBlockedMe;

  // Listen to room metadata changes
  useEffect(() => {
    if (!roomId || !user) return;

    const fetchRoom = async () => {
      try {
        const roomDoc = await getDoc(doc(db, 'chatRooms', roomId));
        if (roomDoc.exists()) {
          const data = { id: roomDoc.id, ...roomDoc.data() } as ChatRoomData;
          setRoomData(data);

          const resolvedOtherUserId = data.participants?.find((id) => id !== user.uid);
          if (resolvedOtherUserId && !otherUser) {
            const userDoc = await getDoc(doc(db, 'users', resolvedOtherUserId));
            if (userDoc.exists()) {
              setOtherUser({ id: resolvedOtherUserId, ...userDoc.data() });
            } else {
              setOtherUser({ id: resolvedOtherUserId, name: 'Deleted User', profilePicture: null });
            }
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `chatRooms/${roomId}`);
      }
    };

    fetchRoom();
  }, [roomId, user?.uid]);

  // Handle pin message
  const handlePinMessage = useCallback(async (msgId: string, text?: string) => {
    if (!user || !roomId) return;
    try {
      await updateDoc(doc(db, 'chatRooms', roomId), {
        pinnedMessageId: msgId,
        pinnedMessageText: text || '📷 Image',
        updatedAt: serverTimestamp(),
      });
      showToast('Message pinned', 'success');
    } catch {
      showToast('Failed to pin message', 'error');
    }
  }, [user, roomId, showToast]);

  // Handle unpin message
  const handleUnpinMessage = useCallback(async () => {
    if (!user || !roomId) return;
    try {
      await updateDoc(doc(db, 'chatRooms', roomId), {
        pinnedMessageId: null,
        pinnedMessageText: null,
        updatedAt: serverTimestamp(),
      });
      showToast('Message unpinned', 'success');
    } catch {
      showToast('Failed to unpin message', 'error');
    }
  }, [user, roomId, showToast]);

  const handleBack = useCallback(() => {
    if (onBack) onBack();
    else navigate('/messages');
  }, [onBack, navigate]);

  // Clear chat
  const handleClearChat = async () => {
    if (!user || !roomId) return;
    if (!confirm('Are you sure you want to clear this chat?')) return;

    try {
      const batch = writeBatch(db);
      const msgsSnap = await getDocs(collection(db, 'chatRooms', roomId, 'messages'));
      let count = 0;
      msgsSnap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const deletedFor = data.deletedFor || [];
        if (!deletedFor.includes(user.uid)) {
          batch.update(docSnap.ref, { deletedFor: arrayUnion(user.uid) });
          count++;
        }
      });
      if (count > 0) {
        await batch.commit();
      }
      showToast('Chat cleared', 'success');
    } catch {
      showToast('Failed to clear chat', 'error');
    }
    setShowOptions(false);
  };

  const handleAcceptRequest = async () => {
    if (!roomId) return;
    try {
      await updateDoc(doc(db, 'chatRooms', roomId), {
        status: 'active',
        requestedBy: deleteField(),
        updatedAt: serverTimestamp(),
      });
      showToast('Chat request accepted', 'success');
    } catch (err) {
      console.error('Accept request error:', err);
      showToast('Failed to accept request', 'error');
    }
  };

  const handleDeclineRequest = async () => {
    if (!roomId || !user) return;
    if (!confirm('Are you sure you want to decline and delete this request?')) return;
    try {
      const batch = writeBatch(db);
      const msgsSnap = await getDocs(collection(db, 'chatRooms', roomId, 'messages'));
      msgsSnap.docs.forEach(d => batch.delete(d.ref));
      batch.delete(doc(db, 'chatRooms', roomId));
      await batch.commit();
      showToast('Chat request declined', 'info');
      if (onBack) onBack();
      else navigate('/messages');
    } catch (err) {
      console.error('Decline request error:', err);
      showToast('Failed to decline request', 'error');
    }
  };

  const isPendingRequester = roomData?.status === 'pending' && roomData?.requestedBy === user?.uid;
  const isPendingRecipient = roomData?.status === 'pending' && roomData?.requestedBy !== user?.uid;

  if (!user || !otherUser) {
    return (
      <div className="flex flex-col h-full bg-surface-base overflow-hidden">
        <ChatSkeleton />
      </div>
    );
  }

  // Instagram-style blocked handling
  if (hasBlockedMe) {
    return (
      <div className="flex flex-col h-full bg-surface-base overflow-hidden pb-safe">
        <div className="px-6 py-4 border-b border-luxury-ink/5 flex items-center bg-surface-base shrink-0">
          <button onClick={() => onBack ? onBack() : navigate('/messages')} className="p-2 hover:bg-surface-soft rounded-full transition-colors mr-2">
            <ArrowLeft size={20} className="text-luxury-ink" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-luxury-ink/5 flex items-center justify-center border border-luxury-ink/5 shrink-0">
              <User size={20} className="text-luxury-ink/30" />
            </div>
            <span className="font-bold text-luxury-ink/40 text-sm">Nextbench User</span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <div className="text-5xl mb-4">🔍</div>
            <h3 className="text-lg font-bold text-luxury-ink mb-2 font-serif italic">User Not Found</h3>
            <p className="text-xs text-luxury-ink/40 font-bold uppercase tracking-widest">This user is no longer available.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative">
      <ChatView
        collectionPath="chatRooms"
        roomId={roomId}
        title={otherUser.name || 'Unknown User'}
        avatar={otherUser.profilePicture}
        isBlocked={isBlocked}
        otherUser={otherUser}
        otherPresence={otherPresence}
        onBack={handleBack}
        showOptions={showOptions}
        setShowOptions={setShowOptions}
        showReport={showReport}
        setShowReport={setShowReport}
        recipientId={otherUserId}
        pinnedMessageText={roomData?.pinnedMessageText}
        onPin={handlePinMessage}
        onUnpin={handleUnpinMessage}
      />

      {/* Pinned request bar for recipient */}
      {isPendingRecipient && (
        <div className="absolute bottom-20 left-4 right-4 bg-surface-card rounded-2xl p-4 border border-brand-teal/20 shadow-xl text-center z-40">
          <p className="text-sm font-bold text-luxury-ink mb-3">{otherUser?.name} wants to message you.</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={handleDeclineRequest} className="px-6 py-2 rounded-full border border-luxury-ink/10 text-xs font-bold uppercase tracking-wider hover:bg-surface-soft transition-colors text-luxury-ink/65">Decline</button>
            <button onClick={handleAcceptRequest} className="px-6 py-2 rounded-full bg-brand-teal text-white text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-colors shadow-md">Accept</button>
          </div>
        </div>
      )}

      {/* Pinned request bar for requester */}
      {isPendingRequester && (
        <div className="absolute bottom-20 left-4 right-4 bg-surface-card rounded-2xl p-4 border border-luxury-ink/5 shadow-xl text-center z-40">
          <p className="text-xs font-bold text-luxury-ink/50 uppercase tracking-widest">Waiting for {otherUser?.name} to accept your chat request.</p>
        </div>
      )}

      {/* Options Dropdown Menu */}
      {showOptions && (
        <div className="absolute right-6 top-16 mt-2 bg-surface-card rounded-2xl shadow-2xl border border-luxury-ink/10 py-1.5 w-48 z-40 overflow-hidden" onClick={() => setShowOptions(false)}>
          {roomData?.productId && roomData?.productTitle && (
            <Link to={`/product/${roomData.productId}`} className="flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-luxury-ink/70 hover:bg-surface-soft transition-colors">
              <Package size={14} className="text-brand-teal" /> View Listing
            </Link>
          )}
          <button onClick={handleClearChat} className="w-full text-left flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-luxury-ink/70 hover:bg-surface-soft transition-colors border-t border-luxury-ink/5">
            <X size={14} /> Clear Chat
          </button>
          <button onClick={() => setShowReport(true)} className="w-full text-left flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-red-500 hover:bg-red-50 transition-colors border-t border-luxury-ink/5">
            <Flag size={14} /> Report Chat
          </button>
        </div>
      )}

      <ReportModal isOpen={showReport} onClose={() => setShowReport(false)} contentType="message" contentId={roomId || ''} />
    </div>
  );
}
