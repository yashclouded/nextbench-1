/**
 * Route classification for full-screen chat surfaces.
 *
 * The chat UI (ChatView) is a fixed-viewport, three-row flex column — pinned
 * header, internally-scrolling message list, pinned composer — which requires a
 * height-bounded parent. The layout chrome (DashboardLayout height model,
 * MobileHeader, BottomNav) must treat ALL chat entry points consistently:
 *   - Mobile DM:    /chat/:roomId
 *   - Mobile club:  /club/:clubId
 *   - Desktop inbox + in-panel: /messages, /messages/:roomId, /messages/club/:clubId
 *
 * NOT full-screen chat (these keep the normal page chrome):
 *   - /club/:clubId/settings
 *   - /club/join/:inviteCode
 *
 * Previously each component tested the path differently, so the mobile routes
 * fell through the cracks (unbounded height → keyboard covered the composer,
 * header didn't pin, page reflowed on send).
 */
export function isFullscreenChatRoute(pathname: string): boolean {
  // Normalize a trailing slash (except the root).
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  // Messages inbox + any nested chat panel.
  if (path === '/messages' || path.startsWith('/messages/')) return true;

  // Mobile DM full-screen.
  if (path.startsWith('/chat/')) return true;

  // Club chat is /club/:clubId only — exclude /club/:id/settings and /club/join/*.
  if (path.startsWith('/club/')) {
    const rest = path.slice('/club/'.length); // e.g. "abc123" or "abc123/settings" or "join/CODE"
    if (rest.length === 0) return false;
    if (rest.startsWith('join/') || rest === 'join') return false;
    // A single non-empty segment is the club chat; anything deeper (settings) is not.
    return !rest.includes('/');
  }

  return false;
}

/**
 * A specific conversation is OPEN (not the bare inbox list). Used to hide the
 * global mobile chrome (MobileHeader, BottomNav) so it can't overlap the
 * conversation's own sticky header / pinned composer.
 *
 * true for:  /chat/:id, /club/:id, /messages/:id, /messages/club/:id
 * false for: /messages (bare inbox — keeps tab nav), /club, /club/:id/settings,
 *            /club/join/*
 */
export function isChatConversationRoute(pathname: string): boolean {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  // Bare inbox is NOT a conversation.
  if (path === '/messages') return false;
  // Any nested /messages/... is a conversation panel (/messages/:id or /messages/club/:id).
  if (path.startsWith('/messages/')) return true;

  if (path.startsWith('/chat/')) return true;

  if (path.startsWith('/club/')) {
    const rest = path.slice('/club/'.length);
    if (rest.length === 0) return false;
    if (rest.startsWith('join/') || rest === 'join') return false;
    return !rest.includes('/'); // /club/:id only, not /club/:id/settings
  }

  return false;
}

