import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc, updateDoc, serverTimestamp, writeBatch, collection, getDocs, onSnapshot, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import ChatView from '../../components/chat/ChatView';
import { ChatSkeleton } from '../../components/ui/skeleton/Skeleton';
import { Settings, X, Users } from 'lucide-react';

interface ClubChatProps {
  panelMode?: boolean;
  roomIdOverride?: string;
  onBack?: () => void;
}

export interface ClubData {
  id: string;
  name: string;
  description?: string;
  avatar?: string | null;
  type: 'public' | 'private';
  school: string;
  leadId: string;
  coLeadIds?: string[];
  memberIds?: string[];
  memberCount?: number;
  settings?: {
    onlyLeadsCanPost?: boolean;
  };
  pinnedMessageId?: string;
  pinnedMessageText?: string;
  unreadBy?: string[];
}

export default function ClubChat({ panelMode, roomIdOverride, onBack }: ClubChatProps = {}) {
  const params = useParams<{ clubId: string }>();
  const clubId = roomIdOverride || params.clubId;
  const { user, userData } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [club, setClub] = useState<ClubData | null>(null);
  const [showOptions, setShowOptions] = useState(false);

  const isLead = club?.leadId === user?.uid;
  const isColeader = club?.coLeadIds?.includes(user?.uid || '') || false;
  const isLeadOrCo = isLead || isColeader;
  const isMember = club?.memberIds?.includes(user?.uid || '') || false;
  const canPost = !club?.settings?.onlyLeadsCanPost || isLeadOrCo;

  // Listen to club metadata
  useEffect(() => {
    if (!clubId) return;

    const unsub = onSnapshot(doc(db, 'clubs', clubId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setClub({ id: snap.id, ...data } as ClubData);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `clubs/${clubId}`);
    });

    return () => unsub();
  }, [clubId]);

  // Handle pin message
  const handlePinMessage = async (msgId: string, text?: string) => {
    if (!user || !clubId) return;
    try {
      await updateDoc(doc(db, 'clubs', clubId), {
        pinnedMessageId: msgId,
        pinnedMessageText: text || '📷 Image',
        updatedAt: serverTimestamp(),
      });
      showToast('Message pinned', 'success');
    } catch {
      showToast('Failed to pin message', 'error');
    }
  };

  // Handle unpin message
  const handleUnpinMessage = async () => {
    if (!user || !clubId) return;
    try {
      await updateDoc(doc(db, 'clubs', clubId), {
        pinnedMessageId: null,
        pinnedMessageText: null,
        updatedAt: serverTimestamp(),
      });
      showToast('Message unpinned', 'success');
    } catch {
      showToast('Failed to unpin message', 'error');
    }
  };

  // Clear chat (deleted for me)
  const handleClearChat = async () => {
    if (!user || !clubId) return;
    if (!confirm('Are you sure you want to clear this chat?')) return;

    try {
      const msgsSnap = await getDocs(collection(db, 'clubs', clubId, 'messages'));
      let batch = writeBatch(db);
      let count = 0;
      for (const docSnap of msgsSnap.docs) {
        const data = docSnap.data();
        const deletedFor = data.deletedFor || [];
        if (!deletedFor.includes(user.uid)) {
          batch.update(docSnap.ref, { deletedFor: arrayUnion(user.uid) });
          count++;
          if (count % 500 === 0) {
            await batch.commit();
            batch = writeBatch(db);
          }
        }
      }
      if (count % 500 !== 0) {
        await batch.commit();
      }
      showToast('Chat cleared', 'success');
    } catch {
      showToast('Failed to clear chat', 'error');
    }
    setShowOptions(false);
  };

  if (!user || !club) {
    return (
      <div className="flex flex-col h-full bg-surface-base overflow-hidden">
        <ChatSkeleton />
      </div>
    );
  }

  const subtitleText = club.memberCount ? `${club.memberCount} member${club.memberCount > 1 ? 's' : ''}` : '';

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative">
      <ChatView
        collectionPath="clubs"
        roomId={club.id}
        title={club.name}
        subtitle={subtitleText}
        avatar={club.avatar}
        isMember={isMember}
        isAdmin={isLeadOrCo}
        canPost={canPost}
        onBack={onBack ? onBack : () => navigate('/messages')}
        showOptions={showOptions}
        setShowOptions={setShowOptions}
        pinnedMessageText={club.pinnedMessageText}
        onPin={handlePinMessage}
        onUnpin={handleUnpinMessage}
      />

      {/* Options Dropdown Menu */}
      {showOptions && (
        <div className="absolute right-6 top-16 mt-2 bg-surface-card rounded-2xl shadow-2xl border border-luxury-ink/10 py-1.5 w-48 z-40 overflow-hidden" onClick={() => setShowOptions(false)}>
          <Link to={`/club/${club.id}/settings`} className="flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-luxury-ink/70 hover:bg-surface-soft transition-colors">
            <Settings size={14} className="text-brand-teal" /> Club Settings
          </Link>
          <button onClick={handleClearChat} className="w-full text-left flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-luxury-ink/70 hover:bg-surface-soft transition-colors border-t border-luxury-ink/5">
            <X size={14} /> Clear Chat
          </button>
        </div>
      )}
    </div>
  );
}

