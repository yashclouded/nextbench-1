import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  getDocs,
  startAfter,
  serverTimestamp,
  arrayUnion,
  writeBatch,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

const LIVE_MESSAGE_LIMIT = 50;
const OLDER_PAGE_SIZE = 50;

function messageMillis(m: { createdAt: any }): number {
  if (m.createdAt?.toMillis) return m.createdAt.toMillis();
  if (m.createdAt instanceof Date) return m.createdAt.getTime();
  if (typeof m.createdAt === 'string') return new Date(m.createdAt).getTime();
  if (typeof m.createdAt === 'number') return m.createdAt;
  return 0;
}

function sortedFromMap<T extends { createdAt: any }>(map: Map<string, T>): T[] {
  return Array.from(map.values()).sort((a, b) => messageMillis(a) - messageMillis(b));
}

export interface Message {
  id: string;
  senderId: string;
  senderName?: string;
  senderAvatar?: string | null;
  text?: string;
  image?: any;
  type?: 'text' | 'voice';
  audioUrl?: string;
  duration?: number;
  fileSize?: number;
  mimeType?: string;
  createdAt: any;
  replyToId?: string | null;
  replyToText?: string | null;
  deletedFor?: string[];
  isDeletedForEveryone?: boolean;
  reactions?: Record<string, string[]>;
  clientMessageId?: string;
  status?: 'pending' | 'failed' | 'sent';
}

export interface ChatEngineOptions {
  collectionPath: 'chatRooms' | 'clubs';
  roomId: string;
  user: any;
  userData: any;
  recipientId?: string; // DM only
  isBlocked?: boolean; // DM only
  clubMembers?: string[]; // clubs only — leadId + coLeadIds + memberIds, from the caller's already-live club doc
  onMessageSent?: (text?: string, image?: any) => void;
}

export function useChatEngine({
  collectionPath,
  roomId,
  user,
  userData,
  recipientId,
  isBlocked = false,
  clubMembers,
  onMessageSent,
}: ChatEngineOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);

  const messagesMapRef = useRef<Map<string, Message>>(new Map());
  const oldestDocRef = useRef<any>(null);
  const hasMoreRef = useRef(true);
  const loadingOlderRef = useRef(false);

  // Helper to generate the metadata update object for a room/club. For clubs,
  // the caller passes its already-live member list (see ClubChat.tsx) instead
  // of this hook doing its own getDoc(clubs/roomId) on every single send.
  const getRoomMetadataUpdate = useCallback(
    (lastMsgText: string) => {
      const updateData: any = {
        lastMessage: lastMsgText,
        lastSenderId: user.uid,
        updatedAt: serverTimestamp(),
      };

      if (collectionPath === 'clubs') {
        updateData.lastSenderName = userData?.name || 'Unknown';
        const others = (clubMembers || []).filter((id) => id !== user.uid);
        if (others.length > 0) {
          updateData.unreadBy = arrayUnion(...others);
        }
      } else if (recipientId) {
        updateData.unreadBy = arrayUnion(recipientId);
      }

      return updateData;
    },
    [user?.uid, userData?.name, collectionPath, clubMembers, recipientId]
  );

  // Mark room as read for user
  // Mark room as read for user — only writes if user is actually in unreadBy
  const markAsRead = useCallback(async () => {
    if (!user || !roomId) return;
    try {
      const roomRef = doc(db, collectionPath, roomId);
      const roomSnap = await getDoc(roomRef);
      if (!roomSnap.exists()) return;
      const data = roomSnap.data();
      const unreadBy: string[] = data?.unreadBy || [];
      if (!unreadBy.includes(user.uid)) return; // Already read — skip the write

      const updatePayload: any = {
        unreadBy: arrayRemove(user.uid),
      };
      // Firestore security rules for clubs require updatedAt == request.time on any update
      if (collectionPath === 'clubs') {
        updatePayload.updatedAt = serverTimestamp();
      }
      await updateDoc(roomRef, updatePayload);
    } catch (err) {
      console.error('Failed to mark chat as read:', err);
    }
  }, [user?.uid, roomId, collectionPath]);

  // Subscribe to the newest LIVE_MESSAGE_LIMIT messages via docChanges(). Only
  // added/modified docs get a new object reference in the Map; unaffected
  // messages keep their exact reference across renders, which is what lets
  // React.memo-wrapped bubbles skip re-rendering when an unrelated message
  // arrives elsewhere in the thread. The live listener is never torn down or
  // re-subscribed by "load older" — see loadOlder below.
  useEffect(() => {
    if (!user || !roomId) return;

    setLoading(true);
    messagesMapRef.current = new Map();
    oldestDocRef.current = null;
    hasMoreRef.current = true;
    setHasMore(true);

    const messagesCollection = collection(db, collectionPath, roomId, 'messages');
    const q = query(messagesCollection, orderBy('createdAt', 'desc'), limit(LIVE_MESSAGE_LIMIT));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          // Deletes in this app are soft (deleteForMe/deleteForEveryone use
          // updateDoc — no hard deleteDoc anywhere), so a 'removed' change never
          // means a real deletion. It only fires when an older message ages out
          // of the newest-LIVE_MESSAGE_LIMIT window as new messages arrive.
          // Evicting it here would punch a hole in the middle of a thread the
          // user has already paged older history into, so we keep the message
          // in the Map and let soft-delete state ride in via 'modified'.
          if (change.type !== 'removed') {
            messagesMapRef.current.set(change.doc.id, { id: change.doc.id, ...change.doc.data() } as Message);
          }
        });

        // The cursor for "load older" is the oldest doc in the initial live
        // window. Set it once — later snapshots are live updates to the same
        // window, not a new page, so they must not move the cursor.
        if (!oldestDocRef.current && snapshot.docs.length > 0) {
          oldestDocRef.current = snapshot.docs[snapshot.docs.length - 1];
          const moreExist = snapshot.docs.length >= LIVE_MESSAGE_LIMIT;
          hasMoreRef.current = moreExist;
          setHasMore(moreExist);
        }

        setMessages(sortedFromMap(messagesMapRef.current));
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, `${collectionPath}/${roomId}/messages`);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [roomId, collectionPath, user?.uid]);

  // Load one older page of messages. One-time getDocs, not the live listener —
  // pages loaded this way are not live-updated afterward (matches
  // WhatsApp/Telegram behavior, see design spec Phase 1).
  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !hasMoreRef.current || !oldestDocRef.current) return;
    loadingOlderRef.current = true;
    try {
      const messagesCollection = collection(db, collectionPath, roomId, 'messages');
      const q = query(
        messagesCollection,
        orderBy('createdAt', 'desc'),
        startAfter(oldestDocRef.current),
        limit(OLDER_PAGE_SIZE)
      );
      const snap = await getDocs(q);

      snap.docs.forEach((docSnap) => {
        if (!messagesMapRef.current.has(docSnap.id)) {
          messagesMapRef.current.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as Message);
        }
      });

      if (snap.docs.length > 0) {
        oldestDocRef.current = snap.docs[snap.docs.length - 1];
      }

      const moreExist = snap.docs.length >= OLDER_PAGE_SIZE;
      hasMoreRef.current = moreExist;
      setHasMore(moreExist);
      setMessages(sortedFromMap(messagesMapRef.current));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, `${collectionPath}/${roomId}/messages`);
    } finally {
      loadingOlderRef.current = false;
    }
  }, [collectionPath, roomId]);

  // Optimistic message send
  const sendMessage = useCallback(
    async (text?: string, image?: any, replyTo?: Message | null) => {
      if ((!text?.trim() && !image) || !user || !roomId) return;
      if (isBlocked) return;

      const messageText = text?.trim();
      const tempId = 'temp_' + Date.now();

      const newOptimisticMsg: Message = {
        id: tempId,
        senderId: user.uid,
        senderName: userData?.name || 'Unknown',
        senderAvatar: userData?.profilePicture || null,
        createdAt: new Date(),
        text: messageText,
        image,
        replyToId: replyTo?.id || null,
        replyToText: replyTo?.text || (replyTo?.image ? '📷 Image' : null),
        status: 'pending',
        clientMessageId: tempId,
      };

      // Add to optimistic queue
      setOptimisticMessages((prev) => [...prev, newOptimisticMsg]);

      const performSend = async (msg: Message) => {
        try {
          const msgData: any = {
            senderId: user.uid,
            senderName: userData?.name || 'Unknown',
            senderAvatar: userData?.profilePicture || null,
            createdAt: serverTimestamp(),
            clientMessageId: msg.clientMessageId,
          };
          if (msg.text) msgData.text = msg.text;
          if (msg.image) msgData.image = msg.image;
          if (msg.replyToId) {
            msgData.replyToId = msg.replyToId;
            msgData.replyToText = msg.replyToText;
          }

          // 1. Write the message document
          await addDoc(collection(db, collectionPath, roomId, 'messages'), msgData);

          // 2. Update room metadata using consolidated helper
          const updateData = await getRoomMetadataUpdate(msg.image ? '📷 Image' : msg.text);
          await updateDoc(doc(db, collectionPath, roomId), updateData);

          // 3. Remove from optimistic list
          setOptimisticMessages((prev) => prev.filter((m) => m.id !== msg.id));

          // 4. Fire callbacks
          if (onMessageSent) {
            onMessageSent(msg.text, msg.image);
          }
        } catch (err) {
          console.error('Failed to send message:', err);
          // Mark optimistic message as failed
          setOptimisticMessages((prev) =>
            prev.map((m) => (m.id === msg.id ? { ...m, status: 'failed' } : m))
          );
        }
      };

      await performSend(newOptimisticMsg);
    },
    [user, roomId, userData, collectionPath, isBlocked, onMessageSent, getRoomMetadataUpdate]
  );

  // Retry failed optimistic message
  const resendMessage = useCallback(
    async (tempId: string) => {
      const msg = optimisticMessages.find((m) => m.id === tempId);
      if (!msg) return;

      // Set state back to pending
      setOptimisticMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'pending' } : m))
      );

      try {
        const msgData: any = {
          senderId: user.uid,
          senderName: userData?.name || 'Unknown',
          senderAvatar: userData?.profilePicture || null,
          createdAt: serverTimestamp(),
          clientMessageId: msg.clientMessageId,
        };
        if (msg.text) msgData.text = msg.text;
        if (msg.image) msgData.image = msg.image;
        if (msg.replyToId) {
          msgData.replyToId = msg.replyToId;
          msgData.replyToText = msg.replyToText;
        }

        await addDoc(collection(db, collectionPath, roomId, 'messages'), msgData);

        const updateData = await getRoomMetadataUpdate(msg.image ? '📷 Image' : msg.text);
        await updateDoc(doc(db, collectionPath, roomId), updateData);

        setOptimisticMessages((prev) => prev.filter((m) => m.id !== tempId));
        if (onMessageSent) onMessageSent(msg.text, msg.image);
      } catch (err) {
        console.error('Failed to retry send:', err);
        setOptimisticMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m))
        );
      }
    },
    [optimisticMessages, user, roomId, collectionPath, onMessageSent, getRoomMetadataUpdate]
  );

  const removeFailedMessage = useCallback((tempId: string) => {
    setOptimisticMessages((prev) => prev.filter((m) => m.id !== tempId));
  }, []);

  // Delete message for me
  const deleteForMe = useCallback(
    async (messageId: string) => {
      if (!user || !roomId) return;
      try {
        await updateDoc(doc(db, collectionPath, roomId, 'messages', messageId), {
          deletedFor: arrayUnion(user.uid),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `${collectionPath}/${roomId}/messages/${messageId}`);
      }
    },
    [user?.uid, roomId, collectionPath]
  );

  // Delete message for everyone
  const deleteForEveryone = useCallback(
    async (messageId: string) => {
      if (!user || !roomId) return;
      try {
        await updateDoc(doc(db, collectionPath, roomId, 'messages', messageId), {
          isDeletedForEveryone: true,
          text: '',
          image: '',
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `${collectionPath}/${roomId}/messages/${messageId}`);
      }
    },
    [user?.uid, roomId, collectionPath]
  );

  // Send voice message
  const sendVoiceMessage = useCallback(
    async (audioUrl: string, duration: number, fileSize: number, mimeType: string) => {
      if (!user || !roomId) return;
      try {
        const messageData = {
          senderId: user.uid,
          senderName: userData?.name || 'Unknown',
          senderAvatar: userData?.profilePicture || null,
          type: 'voice' as const,
          audioUrl,
          duration,
          fileSize,
          mimeType,
          createdAt: serverTimestamp(),
        };

        // Write the message document
        await addDoc(collection(db, collectionPath, roomId, 'messages'), messageData);

        // Update room metadata using consolidated helper
        const updateData = await getRoomMetadataUpdate('🎤 Voice message');
        await updateDoc(doc(db, collectionPath, roomId), updateData);
      } catch (err) {
        console.error('Failed to send voice message:', err);
        throw err;
      }
    },
    [user, roomId, collectionPath, getRoomMetadataUpdate]
  );

  // Merge Firestore-synced real messages with pending/failed optimistic ones.
  // useMemo prevents the O(n log n) sort from running on every render (e.g. on each keystroke).
  const mergedMessages = useMemo(() => {
    const realClientIds = new Set(messages.map((m) => m.clientMessageId).filter(Boolean));
    const pending = optimisticMessages.filter((m) => !realClientIds.has(m.id));

    return [...messages, ...pending].sort((a, b) => {
      const getVal = (m: Message) => {
        if (m.createdAt?.toMillis) return m.createdAt.toMillis();
        if (m.createdAt instanceof Date) return m.createdAt.getTime();
        if (typeof m.createdAt === 'string') return new Date(m.createdAt).getTime();
        if (typeof m.createdAt === 'number') return m.createdAt;
        return Date.now(); // Fallback to current time for pending serverTimestamp
      };
      return getVal(a) - getVal(b);
    });
  }, [messages, optimisticMessages]);

  return {
    messages: mergedMessages,
    loading,
    hasMore,
    loadOlder,
    sendMessage,
    resendMessage,
    removeFailedMessage,
    deleteForMe,
    deleteForEveryone,
    sendVoiceMessage,
    markAsRead,
  };
}
