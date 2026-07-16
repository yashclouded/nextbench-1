/**
 * Inbox sort key for a conversation row.
 *
 * Rooms/clubs are ordered by `updatedAt` desc. When the current user sends a
 * message, the room's `updatedAt: serverTimestamp()` write fires an immediate
 * LOCAL snapshot (hasPendingWrites) where the timestamp reads as null. Sorting
 * that null as 0 drops the just-active room to the bottom, then it snaps to the
 * top ~100ms later when the server timestamp resolves — a visible flicker.
 *
 * Treat a pending local write with a not-yet-resolved timestamp as "now" so the
 * row stays at the top through the round-trip.
 */
export interface SortableConversation {
  updatedAt?: { toMillis?: () => number } | null;
  _pendingWrite?: boolean;
}

export function sortMillis(row: SortableConversation): number {
  const ms = row.updatedAt?.toMillis?.();
  if (typeof ms === 'number') return ms;
  // No resolved timestamp. If this is our own pending write, keep it at the top;
  // otherwise treat as oldest.
  return row._pendingWrite ? Number.MAX_SAFE_INTEGER : 0;
}
