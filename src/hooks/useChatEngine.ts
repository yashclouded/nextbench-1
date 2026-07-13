import { useState, useEffect, useRef, useCallback } from 'react';
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
  serverTimestamp,
  arrayUnion,
  writeBatch,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

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
  onMessageSent?: (text?: string, image?: any) => void;
}

export function useChatEngine({
  collectionPath,
  roomId,
  user,
  userData,
  recipientId,
  isBlocked = false,
  onMessageSent,
}: ChatEngineOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const [limitCount, setLimitCount] = useState(50);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);

  const limitRef = useRef(50);
  limitRef.current = limitCount;

  // Helper to generate the metadata update object for a room/club
  const getRoomMetadataUpdate = useCallback(
    async (lastMsgText: string) => {
      const updateData: any = {
        lastMessage: lastMsgText,
        lastSenderId: user.uid,
        updatedAt: serverTimestamp(),
      };

      if (collectionPath === 'clubs') {
        updateData.lastSenderName = userData?.name || 'Unknown';
        try {
          const clubSnap = await getDoc(doc(db, 'clubs', roomId));
          if (clubSnap.exists()) {
            const clubData = clubSnap.data();
            const members = new Set<string>();
            if (clubData.leadId) members.add(clubData.leadId);
            if (Array.isArray(clubData.coLeadIds)) {
              clubData.coLeadIds.forEach((id: string) => members.add(id));
            }
            if (Array.isArray(clubData.memberIds)) {
              clubData.memberIds.forEach((id: string) => members.add(id));
            }
            // Remove self
            members.delete(user.uid);
            if (members.size > 0) {
              updateData.unreadBy = arrayUnion(...Array.from(members));
            }
          }
        } catch (err) {
          console.warn('Failed to get club members for unreadBy:', err);
        }
      } else if (recipientId) {
        updateData.unreadBy = arrayUnion(recipientId);
      }

      return updateData;
    },
    [user?.uid, userData?.name, collectionPath, roomId, recipientId]
  );

  // Mark room as read for user
  const markAsRead = useCallback(async () => {
    if (!user || !roomId) return;
    try {
      const roomRef = doc(db, collectionPath, roomId);
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

  // Subscribe to messages (dynamic limit snapshots keep old reactions/deletions live)
  useEffect(() => {
    if (!user || !roomId) return;

    setLoading(true);
    const messagesCollection = collection(db, collectionPath, roomId, 'messages');
    const q = query(messagesCollection, orderBy('createdAt', 'desc'), limit(limitCount));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const msgs: Message[] = [];
        snapshot.forEach((docSnap) => {
          msgs.push({ id: docSnap.id, ...docSnap.data() } as Message);
        });

        // Snapshots are descending; reverse to chronological for message list
        setMessages(msgs.reverse());
        setHasMore(snapshot.docs.length >= limitRef.current);
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, `${collectionPath}/${roomId}/messages`);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [roomId, collectionPath, limitCount, user?.uid]);

  // Trigger loading older messages
  const loadOlder = useCallback(() => {
    if (!loading && hasMore) {
      setLimitCount((prev) => prev + 50);
    }
  }, [loading, hasMore]);

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

  // Merge Firestore-synced real messages with pending/failed optimistic ones
  const mergedMessages = (() => {
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
  })();

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
