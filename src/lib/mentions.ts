/**
 * Mentions System
 *
 * Parses @username mentions from text, resolves them to user IDs,
 * and sends notifications to mentioned users.
 */

import { collection, query, where, getDocs, limit, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { createNotification } from './notifications';

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
          const userDoc = await getDoc(doc(db, 'users', userId));
          if (userDoc.exists()) {
            results.push({
              userId,
              name: userDoc.data().name || 'User',
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

  const capitalised = searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1).toLowerCase();

  const q = query(
    collection(db, 'users'),
    where('name', '>=', capitalised),
    where('name', '<=', capitalised + '\uf8ff'),
    limit(maxResults + 1) // +1 to account for self-exclusion
  );

  const snap = await getDocs(q);
  const results: { id: string; name: string; username?: string; profilePicture?: string; school?: string }[] = [];

  snap.forEach((d) => {
    if (d.id !== currentUserId && results.length < maxResults) {
      const data = d.data();
      results.push({
        id: d.id,
        name: data.name || 'User',
        username: data.username || undefined,
        profilePicture: data.profilePicture || undefined,
        school: data.school || undefined,
      });
    }
  });

  return results;
}

/**
 * Send mention notifications to all mentioned users.
 * Skips the sender (currentUserId).
 */
export async function notifyMentionedUsers(
  text: string,
  currentUserId: string,
  senderName: string,
  context: { type: 'post_reply' | 'club_chat' | 'dm'; link: string; postId?: string }
): Promise<void> {
  const usernames = parseMentions(text);
  if (usernames.length === 0) return;

  const mentionedUsers = await resolveMentionUsers(usernames);

  const contextLabel =
    context.type === 'post_reply' ? 'a comment'
    : context.type === 'club_chat' ? 'a group chat'
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
