/**
 * Mentions System
 *
 * Parses @username mentions from text, resolves them to user IDs,
 * and sends notifications to mentioned users.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { createNotification } from './notifications';
import { getPublicProfile, searchPublicUsers } from './discovery';

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

/**
 * Send mention notifications to all mentioned users.
 * Skips the sender (currentUserId).
 */
export async function notifyMentionedUsers(
  text: string,
  currentUserId: string,
  senderName: string,
  context: { type: 'post_reply' | 'club_chat' | 'dm' | 'story'; link: string; postId?: string }
): Promise<void> {
  const usernames = parseMentions(text);
  if (usernames.length === 0) return;

  const mentionedUsers = await resolveMentionUsers(usernames);

  const contextLabel =
    context.type === 'post_reply' ? 'a comment'
    : context.type === 'club_chat' ? 'a group chat'
    : context.type === 'story' ? 'a story'
    : 'a message';

  await Promise.all(
    mentionedUsers
      .filter((u) => u.userId !== currentUserId)
      .map((u) =>
        createNotification({
          userId: u.userId,
          type: 'mention',
          title: 'You were mentioned',
          message: `${senderName} mentioned you in ${contextLabel}`,
          link: context.link,
          postId: context.postId,
        })
      )
  );
}
