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
  deleteField,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

const LIVE_MESSAGE_LIMIT = 50;
const OLDER_PAGE_SIZE = 50;
// Typing: re-arm a write at most this often while actively typing; entries
// older than the stale window are treated as "stopped" by readers.
const TYPING_WRITE_INTERVAL_MS = 2000;
export const TYPING_STALE_MS = 5000;
// Read receipts: cap how many messages we arrayUnion per throttle window.
const READ_RECEIPT_BATCH_CAP = 50;

function messageMillis(m: { createdAt: any }): number {
  if (m.createdAt?.toMillis) return m.createdAt.toMillis();
  if (m.createdAt instanceof Date) return m.createdAt.getTime();
  if (typeof m.createdAt === 'string') return new Date(m.createdAt).getTime();
  if (typeof m.createdAt === 'number') return m.createdAt;
  return 0;
}

function sortedFromMap<T extends { createdAt: any; deletedFor?: string[] }>(
  map: Map<string, T>,
  excludeUid?: string,
): T[] {
  const values = Array.from(map.values());
  // Hide messages the current user has deleted-for-me. Kept in the Map (a
  // 'modified' snapshot can flip deletedFor) but filtered out of the view.
  const visible = excludeUid
    ? values.filter((m) => !m.deletedFor?.includes(excludeUid))
    : values;
  return visible.sort((a, b) => messageMillis(a) - messageMillis(b));
}

export interface Message {
  id: string;
  senderId: string;
  senderName?: string;
  senderAvatar?: string | null;
  text?: string;
  image?: any;
  type?: 'text' | 'voice' | 'video' | 'file';
  audioUrl?: string;
  video?: { url: string; poster?: string; w?: number; h?: number; duration?: number };
  file?: { url: string; name: string; size?: number; mime?: string; pages?: number };
  duration?: number;
  fileSize?: number;
  mimeType?: string;
  createdAt: any;
  replyToId?: string | null;
  replyToText?: string | null;
  deletedFor?: string[];
  isDeletedForEveryone?: boolean;
  reactions?: Record<string, string[]>;
  readBy?: string[];
  clientMessageId?: string;
  status?: 'pending' | 'failed' | 'sent';
  forwardedFrom?: { senderId: string; senderName?: string };
}

export interface ChatEngineOptions {
  collectionPath: 'chatRooms' | 'clubs';
  roomId: string;
  user: any;
  userData: any;
  recipientId?: string; // DM only
  isBlocked?: boolean; // DM only
  clubMembers?: string[]; // clubs only — leadId + coLeadIds + memberIds, from the caller's already-live club doc
  enabled?: boolean; // when false, never opens the message listener (e.g. non-member previewing a club)
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
  enabled = true,
  onMessageSent,
}: ChatEngineOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  // Live typing state from the room doc: { [uid]: Timestamp }. Readers treat
  // entries older than TYPING_STALE_MS as stale (no timeout write needed).
  const [typingUsers, setTypingUsers] = useState<Record<string, any>>({});
  // Throttle typing writes to <=1 per TYPING_WRITE_INTERVAL_MS while active.
  const lastTypingWriteRef = useRef<number>(0);
  const isTypingRef = useRef(false);

  const messagesMapRef = useRef<Map<string, Message>>(new Map());
  const oldestDocRef = useRef<any>(null);
  const hasMoreRef = useRef(true);
  const loadingOlderRef = useRef(false);
  // The live-window cursor is latched from the freshest snapshot. It keeps
  // updating while snapshots are cache-only (a returning user's first snapshot
  // is fromCache and may under-report the window) and freezes once the first
  // server snapshot lands, so later live updates to the same window don't move
  // it. Without this a stale cached count could permanently disable "load older".
  const cursorSettledRef = useRef(false);
  // Incremented on every (re)subscription so an in-flight loadOlder from a prior
  // room can detect that the room changed under it and abort before it writes
  // another room's messages into the shared map / cursor.
  const subscriptionEpochRef = useRef(0);

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
      await updateDoc(roomRef, updatePayload);
    } catch (err) {
      console.error('Failed to mark chat as read:', err);
    }
  }, [user?.uid, roomId, collectionPath]);

  // Mark a set of currently-visible messages as read by the current user.
  // Batched (one writeBatch) and called from MessageList's existing 2s throttle
  // — never per-message. Skips own messages and ones already marked read.
  const markVisibleRead = useCallback(
    async (messageIds: string[]) => {
      if (!user || !roomId || messageIds.length === 0) return;
      const uid = user.uid;
      const toMark: string[] = [];
      for (const id of messageIds) {
        const m = messagesMapRef.current.get(id);
        if (!m) continue;
        if (m.senderId === uid) continue;          // own messages don't need a receipt
        if (m.readBy?.includes(uid)) continue;      // already read
        toMark.push(id);
        if (toMark.length >= READ_RECEIPT_BATCH_CAP) break;
      }
      if (toMark.length === 0) return;
      try {
        const batch = writeBatch(db);
        for (const id of toMark) {
          batch.update(doc(db, collectionPath, roomId, 'messages', id), { readBy: arrayUnion(uid) });
        }
        await batch.commit();
      } catch {
        // Best-effort; a failed receipt is non-critical.
      }
    },
    [user?.uid, roomId, collectionPath]
  );


  // Subscribe to the newest LIVE_MESSAGE_LIMIT messages via docChanges(). Only
  // added/modified docs get a new object reference in the Map; unaffected
  // messages keep their exact reference across renders, which is what lets
  // React.memo-wrapped bubbles skip re-rendering when an unrelated message
  // arrives elsewhere in the thread. The live listener is never torn down or
  // re-subscribed by "load older" — see loadOlder below.
  useEffect(() => {
    if (!user || !roomId || !enabled) {
      setLoading(false);
      return;
    }

    setLoading(true);
    messagesMapRef.current = new Map();
    oldestDocRef.current = null;
    hasMoreRef.current = true;
    cursorSettledRef.current = false;
    loadingOlderRef.current = false;
    subscriptionEpochRef.current += 1;
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
        // window. Keep refreshing it from cache-only snapshots (a returning
        // user's first snapshot is fromCache and may under-report the window),
        // then freeze it on the first server snapshot so later live updates to
        // the same window don't move the cursor.
        if (!cursorSettledRef.current && snapshot.docs.length > 0) {
          oldestDocRef.current = snapshot.docs[snapshot.docs.length - 1];
          const moreExist = snapshot.docs.length >= LIVE_MESSAGE_LIMIT;
          hasMoreRef.current = moreExist;
          setHasMore(moreExist);
          if (!snapshot.metadata.fromCache) {
            cursorSettledRef.current = true;
          }
        }

        setMessages(sortedFromMap(messagesMapRef.current, user?.uid));
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, `${collectionPath}/${roomId}/messages`);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [roomId, collectionPath, user?.uid, enabled]);

  // Live typing indicator: subscribe to the room doc's typingUsers map. Separate
  // from the message listener; light-weight (one doc). Clears own key on unmount.
  useEffect(() => {
    if (!user || !roomId || !enabled) {
      setTypingUsers({});
      return;
    }
    const roomRef = doc(db, collectionPath, roomId);
    const unsub = onSnapshot(roomRef, (snap) => {
      const data = snap.data();
      setTypingUsers((data?.typingUsers as Record<string, any>) || {});
    }, () => { /* ignore transient errors */ });

    return () => {
      unsub();
      // Best-effort clear of our own typing flag when leaving the room.
      if (isTypingRef.current && user) {
        isTypingRef.current = false;
        updateDoc(roomRef, { [`typingUsers.${user.uid}`]: deleteField() }).catch(() => {});
      }
    };
  }, [roomId, collectionPath, user?.uid, enabled]);

  // Write our own typing state. Debounced: while typing, re-arm a server
  // timestamp at most once per TYPING_WRITE_INTERVAL_MS; on stop, delete our key.
  // Never writes for blocked users or non-members.
  const setTyping = useCallback(
    (typing: boolean) => {
      if (!user || !roomId || isBlocked) return;
      const roomRef = doc(db, collectionPath, roomId);
      if (typing) {
        const now = Date.now();
        if (now - lastTypingWriteRef.current < TYPING_WRITE_INTERVAL_MS) return;
        lastTypingWriteRef.current = now;
        isTypingRef.current = true;
        updateDoc(roomRef, { [`typingUsers.${user.uid}`]: serverTimestamp() }).catch(() => {});
      } else {
        if (!isTypingRef.current) return; // already stopped
        isTypingRef.current = false;
        lastTypingWriteRef.current = 0;
        updateDoc(roomRef, { [`typingUsers.${user.uid}`]: deleteField() }).catch(() => {});
      }
    },
    [user?.uid, roomId, collectionPath, isBlocked]
  );


  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !hasMoreRef.current || !oldestDocRef.current) return;
    loadingOlderRef.current = true;
    // Snapshot the current subscription epoch. If the room changes (the effect
    // re-runs and resets the map/cursor) while getDocs is in flight, this page
    // belongs to the old room — discard it rather than merge it into the new
    // room's map and corrupt its cursor.
    const epoch = subscriptionEpochRef.current;
    try {
      const messagesCollection = collection(db, collectionPath, roomId, 'messages');
      const q = query(
        messagesCollection,
        orderBy('createdAt', 'desc'),
        startAfter(oldestDocRef.current),
        limit(OLDER_PAGE_SIZE)
      );
      const snap = await getDocs(q);

      if (epoch !== subscriptionEpochRef.current) return;

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
      setMessages(sortedFromMap(messagesMapRef.current, user?.uid));
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
        replyToText: replyTo?.text || (
          replyTo?.type === 'video' ? '📹 Video'
          : replyTo?.type === 'file' ? `📎 ${replyTo.file?.name || 'File'}`
          : replyTo?.type === 'voice' ? '🎤 Voice message'
          : replyTo?.image ? '📷 Image'
          : null
        ),
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
          video: null,
          file: null,
          audioUrl: '',
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `${collectionPath}/${roomId}/messages/${messageId}`);
      }
    },
    [user?.uid, roomId, collectionPath]
  );

  // Bulk delete-for-everyone. Only the sender's own messages pass the rules;
  // the caller gates the UI so every id is an own-message. Chunked at 450/batch
  // (Firestore's 500-op limit with headroom).
  const deleteForEveryoneBulk = useCallback(
    async (ids: string[]) => {
      if (!user || !roomId || ids.length === 0) return;
      try {
        for (let i = 0; i < ids.length; i += 450) {
          const chunk = ids.slice(i, i + 450);
          const batch = writeBatch(db);
          for (const id of chunk) {
            batch.update(doc(db, collectionPath, roomId, 'messages', id), {
              isDeletedForEveryone: true,
              text: '',
              image: '',
              video: null,
              file: null,
              audioUrl: '',
            });
          }
          await batch.commit();
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `${collectionPath}/${roomId}/messages`);
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

  // Send video message
  const sendVideoMessage = useCallback(
    async (video: { url: string; poster?: string; w?: number; h?: number; duration?: number }) => {
      if (!user || !roomId || !video?.url) return;
      try {
        const messageData: any = {
          senderId: user.uid,
          senderName: userData?.name || 'Unknown',
          senderAvatar: userData?.profilePicture || null,
          type: 'video' as const,
          video,
          createdAt: serverTimestamp(),
        };

        await addDoc(collection(db, collectionPath, roomId, 'messages'), messageData);

        const updateData = await getRoomMetadataUpdate('📹 Video');
        await updateDoc(doc(db, collectionPath, roomId), updateData);
      } catch (err) {
        console.error('Failed to send video message:', err);
        throw err;
      }
    },
    [user, roomId, collectionPath, userData, getRoomMetadataUpdate]
  );

  // Send a file/document message (PDF, docs, any type). Mirrors sendVideoMessage.
  const sendFileMessage = useCallback(
    async (file: { url: string; name: string; size?: number; mime?: string; pages?: number }, caption?: string) => {
      if (!user || !roomId || !file?.url) return;
      try {
        // Build the file object without undefined keys — Firestore rejects
        // undefined values (ignoreUndefinedProperties is not set). A raw
        // (non-PDF) upload has no `pages`, and files with an unknown type have
        // no `mime`.
        const fileData: any = { url: file.url, name: file.name };
        if (file.size !== undefined) fileData.size = file.size;
        if (file.mime) fileData.mime = file.mime;
        if (file.pages !== undefined) fileData.pages = file.pages;

        const messageData: any = {
          senderId: user.uid,
          senderName: userData?.name || 'Unknown',
          senderAvatar: userData?.profilePicture || null,
          type: 'file' as const,
          file: fileData,
          createdAt: serverTimestamp(),
        };
        const trimmed = caption?.trim();
        if (trimmed) messageData.text = trimmed;

        await addDoc(collection(db, collectionPath, roomId, 'messages'), messageData);

        const updateData = await getRoomMetadataUpdate('📎 File');
        await updateDoc(doc(db, collectionPath, roomId), updateData);
      } catch (err) {
        console.error('Failed to send file message:', err);
        throw err;
      }
    },
    [user, roomId, collectionPath, userData, getRoomMetadataUpdate]
  );


  // current user belongs to; each write is rules-gated (membership/canPost),
  // so a target that rejects is counted as failed without aborting the rest.
  const forwardMessage = useCallback(
    async (
      sources: Message[],
      targets: { collection: 'chatRooms' | 'clubs'; roomId: string }[]
    ): Promise<{ ok: number; failed: number }> => {
      if (!user || sources.length === 0 || targets.length === 0) return { ok: 0, failed: 0 };
      let ok = 0;
      let failed = 0;

      for (const target of targets) {
        try {
          // Resolve the target's members once for the unread/metadata write.
          const roomRef = doc(db, target.collection, target.roomId);
          const roomSnap = await getDoc(roomRef);
          if (!roomSnap.exists()) { failed++; continue; }
          const roomData = roomSnap.data() as any;

          let lastPreview = '';
          let deliveredToTarget = 0;
          for (const src of sources) {
            const msgData: any = {
              senderId: user.uid,
              senderName: userData?.name || 'Unknown',
              senderAvatar: userData?.profilePicture || null,
              createdAt: serverTimestamp(),
              forwardedFrom: {
                senderId: src.senderId,
                senderName: src.senderName || 'Unknown',
              },
            };
            if (src.text) msgData.text = src.text;
            if (src.image) msgData.image = src.image;
            if (src.type === 'video' && src.video) { msgData.type = 'video'; msgData.video = src.video; }
            if (src.type === 'file' && src.file) { msgData.type = 'file'; msgData.file = src.file; }
            if (src.type === 'voice' && src.audioUrl) {
              msgData.type = 'voice';
              msgData.audioUrl = src.audioUrl;
              if (src.duration !== undefined) msgData.duration = src.duration;
              if (src.fileSize !== undefined) msgData.fileSize = src.fileSize;
              if (src.mimeType) msgData.mimeType = src.mimeType;
            }
            // Per-message try/catch: one rejected message doesn't abort the
            // remaining sources for this target.
            try {
              await addDoc(collection(db, target.collection, target.roomId, 'messages'), msgData);
              deliveredToTarget++;
              lastPreview =
                src.type === 'video' ? '📹 Video'
                : src.type === 'file' ? '📎 File'
                : src.type === 'voice' ? '🎤 Voice message'
                : src.image ? '📷 Image'
                : (src.text || '');
            } catch (err) {
              console.error('Failed to forward a message to target:', target, err);
            }
          }

          // A target counts as delivered if at least one message landed. The
          // metadata write is best-effort — its failure must NOT flip a
          // delivered target to "failed".
          if (deliveredToTarget > 0) {
            try {
              const meta: any = {
                lastMessage: lastPreview,
                lastSenderId: user.uid,
                updatedAt: serverTimestamp(),
              };
              if (target.collection === 'clubs') {
                meta.lastSenderName = userData?.name || 'Unknown';
                const others = ((roomData.memberIds as string[]) || []).filter((id) => id !== user.uid);
                if (others.length > 0) meta.unreadBy = arrayUnion(...others);
              } else {
                const others = ((roomData.participants as string[]) || []).filter((id) => id !== user.uid);
                if (others.length > 0) meta.unreadBy = arrayUnion(...others);
              }
              await updateDoc(roomRef, meta);
            } catch (err) {
              console.error('Forward: metadata update failed (messages still delivered):', target, err);
            }
            ok++;
          } else {
            failed++;
          }
        } catch (err) {
          console.error('Failed to forward to target:', target, err);
          failed++;
        }
      }
      return { ok, failed };
    },
    [user, userData]
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
    deleteForEveryoneBulk,
    sendVoiceMessage,
    sendVideoMessage,
    sendFileMessage,
    forwardMessage,
    markAsRead,
    markVisibleRead,
    typingUsers,
    setTyping,
  };
}
