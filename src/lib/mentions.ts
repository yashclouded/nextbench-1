/**
 * Mentions System
 *
 * Parses @username mentions from text, resolves them to user IDs,
 * and sends notifications to mentioned users.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { createNotification } from './notifications';
import { getPublicProfile, searchPublicUsers, getPublicUsers } from './discovery';

export interface MentionUser {
  id: string;
  name: string;
  username?: string;
  profilePicture?: string;
  school?: string;
}

/**
 * Extract all @username mentions from text.
 * Returns an array of unique, lowercased usernames (without the @ prefix).
 */
export function parseMentions(text: string): string[] {
  if (!text) return [];
  // Match @username patterns — usernames are 3-20 chars, a-z, 0-9, _, .
  const regex = /@([a-zA-Z][a-zA-Z0-9_.]{2,19})\b/g;
  const usernames = new Set<string>();
  let match;
  while ((match = regex.exec(text)) !== null) {
    usernames.add(match[1].toLowerCase());
  }
  return Array.from(usernames);
}

/**
 * Resolve an array of usernames to user data via the `usernames` collection.
 * Returns an array of { userId, name, username }.
 */
export async function resolveMentionUsers(
  usernames: string[]
): Promise<{ userId: string; name: string; username: string }[]> {
  if (usernames.length === 0) return [];

  const results: { userId: string; name: string; username: string }[] = [];

  // The `usernames` collection has docs with ID = lowercase username, data = { userId }
  await Promise.all(
    usernames.map(async (username) => {
      try {
        const usernameDoc = await getDoc(doc(db, 'usernames', username));
        if (usernameDoc.exists()) {
          const userId = usernameDoc.data().userId;
          const userDoc = await getPublicProfile(userId);
          if (userDoc) {
            results.push({
              userId,
              name: userDoc.name || 'User',
              username,
            });
          }
        }
      } catch (err) {
        console.warn(`Failed to resolve mention @${username}:`, err);
      }
    })
  );

  return results;
}

/**
 * Search users by name prefix for autocomplete suggestions.
 * Returns up to `maxResults` users matching the search term.
 */
export async function searchUsersForMention(
  searchTerm: string,
  currentUserId: string,
  maxResults: number = 6
): Promise<{ id: string; name: string; username?: string; profilePicture?: string; school?: string }[]> {
  if (!searchTerm || searchTerm.length < 1) return [];

  const users = await searchPublicUsers({
    query: searchTerm,
    limit: maxResults,
    excludeIds: [currentUserId],
  });

  return users.map(user => ({
    id: user.id,
    name: user.name || 'User',
    username: user.username || undefined,
    profilePicture: user.profilePicture || undefined,
    school: user.school || undefined,
  }));
}

// Cache resolved member rosters per membership signature so we don't re-fetch
// the club's members on every keystroke while typing a mention.
const scopedRosterCache = new Map<string, MentionUser[]>();

/**
 * Search a FIXED set of users (e.g. a club's members) for @-mention autocomplete.
 * Resolves the roster once (cached), then filters locally by name/username prefix.
 * Excludes the current user. Case-insensitive, matches at word boundaries.
 */
export async function searchScopedUsersForMention(
  searchTerm: string,
  userIds: string[],
  currentUserId: string,
  maxResults: number = 6
): Promise<MentionUser[]> {
  const others = Array.from(new Set(userIds.filter((id) => id && id !== currentUserId)));
  if (others.length === 0) return [];

  const cacheKey = others.slice().sort().join(',');
  let roster = scopedRosterCache.get(cacheKey);
  if (!roster) {
    const users = await getPublicUsers(others);
    roster = users.map((u) => ({
      id: u.id,
      name: u.name || 'User',
      username: u.username || undefined,
      profilePicture: u.profilePicture || undefined,
      school: u.school || undefined,
    }));
    scopedRosterCache.set(cacheKey, roster);
  }

  const q = searchTerm.trim().toLowerCase();
  const matches = q
    ? roster.filter((u) => {
        const name = u.name.toLowerCase();
        const username = (u.username || '').toLowerCase();
        return (
          username.startsWith(q) ||
          name.startsWith(q) ||
          name.split(/\s+/).some((part) => part.startsWith(q))
        );
      })
    : roster;

  return matches.slice(0, maxResults);
}

/**
 * Send mention notifications to all mentioned users.
 * Skips the sender (currentUserId).
 */
export async function notifyMentionedUsers(
  text: string,
  currentUserId: string,
  senderName: string,
  context: { type: 'post_reply' | 'club_chat' | 'dm' | 'story'; link: string; postId?: string },
  extraUserIds: string[] = []
): Promise<void> {
  const usernames = parseMentions(text);

  const mentionedUsers = await resolveMentionUsers(usernames);

  // Union resolved-by-username targets with any explicitly-tagged user ids
  // (e.g. club members picked from the autocomplete who may lack a username).
  const targetIds = new Set<string>();
  mentionedUsers.forEach((u) => targetIds.add(u.userId));
  extraUserIds.forEach((id) => targetIds.add(id));
  targetIds.delete(currentUserId);
  if (targetIds.size === 0) return;

  const contextLabel =
    context.type === 'post_reply' ? 'a comment'
    : context.type === 'club_chat' ? 'a group chat'
    : context.type === 'story' ? 'a story'
    : 'a message';

  await Promise.all(
    Array.from(targetIds).map((userId) =>
      createNotification({
        userId,
        type: 'mention',
        title: 'You were mentioned',
        message: `${senderName} mentioned you in ${contextLabel}`,
        link: context.link,
        postId: context.postId,
      })
    )
  );
}
