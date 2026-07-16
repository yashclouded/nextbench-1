import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { MessageBubble } from './MessageBubble';
import { Message } from '../../hooks/useChatEngine';

type RenderItem =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'unread'; key: string; label: string }
  | { kind: 'message'; key: string; msg: Message };

const toMillis = (v: any): number =>
  v?.toDate ? v.toDate().getTime() : v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.now();

const dayLabel = (ms: number): string => {
  const d = new Date(ms);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};

interface MessageListProps {
  messages: Message[];
  loading: boolean;
  hasMore: boolean;
  loadOlder: () => void;
  markAsRead: () => void;
  markVisibleRead: (messageIds: string[]) => void;
  user: any;
  isClub: boolean;
  isMember: boolean;
  isAdmin: boolean;
  collectionPath: 'chatRooms' | 'clubs';
  roomId: string;
  recipientId?: string;
  onPin?: (msgId: string, text?: string) => void;
  showLightbox: (urls: string[]) => void;
  resendMessage: (tempId: string) => void;
  removeFailedMessage: (tempId: string) => void;
  // context-menu + selection wiring (state owned by ChatView)
  isSelectMode: boolean;
  selectedMessages: Set<string>;
  toggleMessageSelection: (msgId: string) => void;
  activeReactionMsgId: string | null;
  setActiveReactionMsgId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedMessageId: string | null;
  setSelectedMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setMenuPosition: React.Dispatch<React.SetStateAction<{ top?: number; bottom?: number; left?: number; right?: number } | null>>;
  replyingTo: Message | null;
  setReplyingTo: React.Dispatch<React.SetStateAction<Message | null>>;
  setDeleteConfirmMsgId: React.Dispatch<React.SetStateAction<string | null>>;
  setDeleteEveryoneConfirmMsgId: React.Dispatch<React.SetStateAction<string | null>>;
}

export function MessageList({
  messages,
  loading,
  hasMore,
  loadOlder,
  markAsRead,
  markVisibleRead,
  user,
  isClub,
  isMember,
  isAdmin,
  collectionPath,
  roomId,
  recipientId,
  onPin,
  showLightbox,
  resendMessage,
  removeFailedMessage,
  isSelectMode,
  selectedMessages,
  toggleMessageSelection,
  activeReactionMsgId,
  setActiveReactionMsgId,
  selectedMessageId,
  setSelectedMessageId,
  setMenuPosition,
  replyingTo,
  setReplyingTo,
  setDeleteConfirmMsgId,
  setDeleteEveryoneConfirmMsgId,
}: MessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);
  // Throttle markAsRead to prevent write→read→render feedback loops in club chats
  const lastMarkAsReadRef = useRef<number>(0);
  // Track the last-seen message ID to distinguish new messages from loaded-older ones
  const lastMsgIdRef = useRef<string | undefined>(undefined);

  // Session-based "New messages" divider. At chat open (first non-loading
  // snapshot) we capture the newest message's timestamp as the boundary.
  // The divider anchors above the first message that is (a) newer than the
  // boundary and (b) from another user, and stays put for the session —
  // pure client state, reset on unmount. No Firestore schema involved.
  const boundaryMsRef = useRef<number | null>(null);
  const dividerAnchorKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (boundaryMsRef.current !== null) return; // capture once per mount
    if (loading) return; // wait for first load
    const newest = messages[messages.length - 1];
    boundaryMsRef.current = newest ? toMillis(newest.createdAt) : 0;
  }, [loading, messages]);

  // Flatten messages into virtualizer rows, inserting a day divider at each
  // local-date boundary. Messages arrive ascending by createdAt.
  const renderItems = useMemo<RenderItem[]>(() => {
    // Latch the unread anchor to the first qualifying message. Once set it
    // never moves, so the divider stays stable as more messages arrive.
    if (dividerAnchorKeyRef.current === null && boundaryMsRef.current !== null) {
      const anchor = messages.find(
        (m) => toMillis(m.createdAt) > (boundaryMsRef.current as number) && m.senderId !== user?.uid
      );
      if (anchor) dividerAnchorKeyRef.current = anchor.id;
    }

    const items: RenderItem[] = [];
    let lastDayKey = '';
    for (const msg of messages) {
      const ms = toMillis(msg.createdAt);
      const d = new Date(ms);
      const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (dayKey !== lastDayKey) {
        items.push({ kind: 'day', key: `day-${dayKey}`, label: dayLabel(ms) });
        lastDayKey = dayKey;
      }
      if (dividerAnchorKeyRef.current && msg.id === dividerAnchorKeyRef.current) {
        items.push({ kind: 'unread', key: 'unread-divider', label: 'New messages' });
      }
      items.push({ kind: 'message', key: msg.id, msg });
    }
    return items;
  }, [messages, user?.uid]);

  // Virtualize rows with dynamic measurement: estimateSize seeds the layout,
  // measureElement corrects each row to its real height after paint (images,
  // multi-line text, voice bubbles). Stable getItemKey keeps the scroll anchor
  // pinned to the same message when older rows are prepended by load-older.
  const rowVirtualizer = useVirtualizer({
    count: renderItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 8,
    measureElement: (el) => el.getBoundingClientRect().height,
    getItemKey: (index) => renderItems[index].key,
  });

  // Mark chat as read — throttled to at most once per 2 s to prevent write→read→render loops
  useEffect(() => {
    if (!isNearBottom || messages.length === 0) return;
    const now = Date.now();
    if (now - lastMarkAsReadRef.current < 2000) return;
    lastMarkAsReadRef.current = now;
    markAsRead();
  }, [messages.length, isNearBottom, markAsRead]);

  // Read receipts — batched, throttled to once per 2 s. Marks the messages
  // currently visible in the virtualizer (regardless of near-bottom, so reading
  // older history still sends receipts) as read by the current user.
  const lastReceiptRef = useRef<number>(0);
  const markReceiptsForVisible = useCallback(() => {
    const now = Date.now();
    if (now - lastReceiptRef.current < 2000) return;
    const visibleIds = rowVirtualizer
      .getVirtualItems()
      .map((vr) => renderItems[vr.index])
      .filter((it): it is Extract<RenderItem, { kind: 'message' }> => !!it && it.kind === 'message')
      .map((it) => it.msg.id);
    if (visibleIds.length === 0) return;
    lastReceiptRef.current = now;
    markVisibleRead(visibleIds);
  }, [markVisibleRead, renderItems]);

  // Fire on new messages arriving (and on mount when messages first load).
  useEffect(() => {
    if (messages.length === 0) return;
    markReceiptsForVisible();
  }, [messages.length, markReceiptsForVisible]);

  // Track scroll position
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const scrollOffsetFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    setIsNearBottom(scrollOffsetFromBottom <= 80);

    if (scrollOffsetFromBottom <= 80) {
      setNewMessageCount(0);
    }

    // Trigger loadOlder. No manual scroll-height compensation needed: the
    // virtualizer's stable item keys + dynamic measurement keep the anchored
    // message in place when older rows are prepended above it.
    if (target.scrollTop <= 80 && hasMore && !loading) {
      loadOlder();
    }

    // Send read receipts for whatever is now visible (self-throttled to 2s).
    markReceiptsForVisible();
  };

  // Scroll to bottom on genuinely new messages only (not when loading older history)
  const lastMessagesLengthRef = useRef(messages.length);
  useEffect(() => {
    const latestMsg = messages[messages.length - 1];
    const latestMsgId = latestMsg?.id;

    // Only scroll when a new message was appended at the bottom.
    // Comparing IDs prevents false-triggering when older messages are prepended
    // (load-older: length grows but latestMsgId stays the same).
    const isNewMessageAppended =
      messages.length > lastMessagesLengthRef.current && latestMsgId !== lastMsgIdRef.current;

    if (isNewMessageAppended) {
      const isMine = latestMsg?.senderId === user?.uid;
      if (isNearBottom || isMine) {
        setTimeout(() => {
          rowVirtualizer.scrollToIndex(renderItems.length - 1, { align: 'end' });
        }, 50);
        setNewMessageCount(0);
      } else {
        setNewMessageCount((prev) => prev + 1);
      }
    }

    lastMessagesLengthRef.current = messages.length;
    lastMsgIdRef.current = latestMsgId;
  }, [messages, user?.uid, isNearBottom]);

  return (
    <>
      {/* Messages Scroll Area */}
      <div
        ref={parentRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-6"
      >
        {messages.length === 0 && !loading && (
          <div className="text-center py-20">
            {isClub && !isMember ? (
              <>
                <p className="text-luxury-ink/20 font-serif italic text-lg mb-2">Join this club to view messages</p>
                <p className="text-luxury-ink/10 text-xs font-bold uppercase tracking-widest">Members can see the conversation here</p>
              </>
            ) : (
              <>
                <p className="text-luxury-ink/20 font-serif italic text-lg mb-2">Start the conversation</p>
                <p className="text-luxury-ink/10 text-xs font-bold uppercase tracking-widest">Messages are encrypted and secure</p>
              </>
            )}
          </div>
        )}

        {loading && messages.length === 0 && (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                <div className={`w-2/3 h-12 bg-surface-soft rounded-2xl animate-pulse`} />
              </div>
            ))}
          </div>
        )}

        {/* Virtualized Message Rows. Each row is absolutely positioned and
            re-measured after paint; paddingBottom stands in for the old
            container's space-y-3.5 (0.875rem = 14px) so measured heights
            include the inter-bubble gap. */}
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = renderItems[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)`, paddingBottom: 14 }}
              >
                {item.kind === 'day' ? (
                  <div className="flex justify-center py-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30 bg-surface-soft px-3 py-1 rounded-full">{item.label}</span>
                  </div>
                ) : item.kind === 'unread' ? (
                  <div className="flex items-center gap-3 py-2">
                    <div className="flex-1 h-px bg-brand-teal/30" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-brand-teal">{item.label}</span>
                    <div className="flex-1 h-px bg-brand-teal/30" />
                  </div>
                ) : (
                  <MessageBubble
                    msg={item.msg}
                    user={user}
                    isSelectMode={isSelectMode}
                    isSelected={selectedMessages.has(item.msg.id)}
                    toggleMessageSelection={toggleMessageSelection}
                    activeReactionMsgId={activeReactionMsgId}
                    setActiveReactionMsgId={setActiveReactionMsgId}
                    selectedMessageId={selectedMessageId}
                    setSelectedMessageId={setSelectedMessageId}
                    setMenuPosition={setMenuPosition}
                    replyingTo={replyingTo}
                    setReplyingTo={setReplyingTo}
                    setDeleteConfirmMsgId={setDeleteConfirmMsgId}
                    setDeleteEveryoneConfirmMsgId={setDeleteEveryoneConfirmMsgId}
                    onPin={onPin}
                    collectionPath={collectionPath}
                    roomId={roomId}
                    showLightbox={showLightbox}
                    resendMessage={resendMessage}
                    removeFailedMessage={removeFailedMessage}
                    isAdmin={isAdmin}
                    recipientId={recipientId}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Scroll Count Button */}
      {newMessageCount > 0 && (
        <button
          onClick={() => {
            rowVirtualizer.scrollToIndex(renderItems.length - 1, { align: 'end' });
            setNewMessageCount(0);
          }}
          className="absolute bottom-24 right-6 z-30 flex items-center gap-2 bg-luxury-ink text-surface-base px-4 py-2.5 rounded-full shadow-2xl hover:bg-brand-teal transition-all text-xs font-bold uppercase tracking-wider animate-bounce"
        >
          <ArrowDown size={14} />
          {newMessageCount} new message{newMessageCount > 1 ? 's' : ''}
        </button>
      )}
    </>
  );
}
