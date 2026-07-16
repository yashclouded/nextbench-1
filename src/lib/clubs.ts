/**
 * Clubs — Group Chat System
 *
 * Collection: `clubs`
 * Subcollection: `clubs/{clubId}/messages`
 *
 * Roles: lead (owner), co-lead, member
 * Types: public (discoverable) | private (invite-only)
 */

import { useState, useEffect } from 'react';
import {
  collection, query, where, getDocs, addDoc, updateDoc, deleteDoc,
  doc, getDoc, serverTimestamp, onSnapshot, arrayUnion, arrayRemove,
  increment, writeBatch, limit, orderBy
} from 'firebase/firestore';
import { db } from './firebase';
import { sortMillis } from './conversationSort';

// ─── Types ───────────────────────────────────────────────

export interface ClubSettings {
  hideMembersAbove50: boolean;
  onlyLeadsCanPost: boolean;
  slowMode: number; // seconds, 0 = off
  muteNotifications: boolean;
}

export interface ClubData {
  id: string;
  name: string;
  description: string;
  avatar?: string;
  type: 'public' | 'private';
  inviteCode: string;
  leadId: string;
  coLeadIds: string[];
  memberIds: string[];
  settings: ClubSettings;
  memberCount: number;
  lastMessage?: string;
  lastSenderId?: string;
  lastSenderName?: string;
  createdAt: any;
  updatedAt: any;
  school?: string;
  city?: string;
  tags?: string[];
  unreadBy?: string[];
  // Per-user conversation state (see src/lib/conversations.ts). Absent = empty.
  mutedBy?: string[];
  archivedBy?: string[];
  pinnedBy?: string[];
  deletedBy?: string[];
  // True when this row came from a snapshot with an unresolved local write
  // (just-sent updatedAt: serverTimestamp()). See lib/conversationSort.
  _pendingWrite?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function isLeadOrColeader(club: ClubData, userId: string): boolean {
  return club.leadId === userId || club.coLeadIds.includes(userId);
}

// ─── CRUD ────────────────────────────────────────────────

export async function createClub(
  leadId: string,
  name: string,
  description: string,
  type: 'public' | 'private',
  school?: string,
  city?: string,
  avatar?: string
): Promise<string> {
  const clubRef = await addDoc(collection(db, 'clubs'), {
    name: name.trim(),
    description: description.trim(),
    avatar: avatar || null,
    type,
    inviteCode: generateInviteCode(),
    leadId,
    coLeadIds: [],
    memberIds: [leadId],
    settings: {
      hideMembersAbove50: false,
      onlyLeadsCanPost: false,
      slowMode: 0,
      muteNotifications: false,
    },
    memberCount: 1,
    lastMessage: '',
    lastSenderId: '',
    lastSenderName: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    school: school || null,
    city: city || null,
    tags: [],
  });
  return clubRef.id;
}

export async function joinClub(userId: string, clubId: string): Promise<void> {
  const clubRef = doc(db, 'clubs', clubId);
  await updateDoc(clubRef, {
    memberIds: arrayUnion(userId),
    memberCount: increment(1),
    updatedAt: serverTimestamp(),
  });
}

export async function leaveClub(userId: string, clubId: string): Promise<void> {
  const clubRef = doc(db, 'clubs', clubId);
  await updateDoc(clubRef, {
    memberIds: arrayRemove(userId),
    coLeadIds: arrayRemove(userId),
    memberCount: increment(-1),
    updatedAt: serverTimestamp(),
  });
}

export async function joinByInviteCode(userId: string, code: string): Promise<string | null> {
  const q = query(collection(db, 'clubs'), where('inviteCode', '==', code));
  const snap = await getDocs(q);
  if (snap.empty) return null;

  const clubDoc = snap.docs[0];
  const data = clubDoc.data();

  if (data.memberIds.includes(userId)) {
    return clubDoc.id; // Already a member
  }

  await joinClub(userId, clubDoc.id);
  return clubDoc.id;
}

export async function addMemberDirectly(
  actorId: string,
  targetId: string,
  clubId: string
): Promise<{ success: boolean; reason?: string }> {
  const clubSnap = await getDoc(doc(db, 'clubs', clubId));
  if (!clubSnap.exists()) return { success: false, reason: 'Club not found' };

  const club = { id: clubSnap.id, ...clubSnap.data() } as ClubData;

  if (!isLeadOrColeader(club, actorId)) {
    return { success: false, reason: 'Only leads can add members' };
  }

  if (club.memberIds.includes(targetId)) {
    return { success: false, reason: 'Already a member' };
  }

  // Check if target follows the actor (required for direct add)
  const followQ = query(
    collection(db, 'follows'),
    where('followerId', '==', targetId),
    where('followingId', '==', actorId)
  );
  const followSnap = await getDocs(followQ);

  if (followSnap.empty) {
    return { success: false, reason: 'User must follow you to be added directly. Send an invite link instead.' };
  }

  await joinClub(targetId, clubId);
  return { success: true };
}

export async function removeMember(
  actorId: string,
  targetId: string,
  clubId: string
): Promise<void> {
  const clubRef = doc(db, 'clubs', clubId);
  await updateDoc(clubRef, {
    memberIds: arrayRemove(targetId),
    coLeadIds: arrayRemove(targetId),
    memberCount: increment(-1),
    updatedAt: serverTimestamp(),
  });
}

// ─── Role Management ─────────────────────────────────────

export async function promoteColeader(leadId: string, userId: string, clubId: string): Promise<void> {
  const clubRef = doc(db, 'clubs', clubId);
  await updateDoc(clubRef, {
    coLeadIds: arrayUnion(userId),
    updatedAt: serverTimestamp(),
  });
}

export async function demoteColeader(leadId: string, userId: string, clubId: string): Promise<void> {
  const clubRef = doc(db, 'clubs', clubId);
  await updateDoc(clubRef, {
    coLeadIds: arrayRemove(userId),
    updatedAt: serverTimestamp(),
  });
}

export async function transferLeadership(
  currentLeadId: string,
  newLeadId: string,
  clubId: string
): Promise<void> {
  const clubRef = doc(db, 'clubs', clubId);
  await updateDoc(clubRef, {
    leadId: newLeadId,
    coLeadIds: arrayRemove(newLeadId),
    updatedAt: serverTimestamp(),
  });
}

// ─── Settings ────────────────────────────────────────────

export async function updateClubSettings(
  clubId: string,
  settings: Partial<ClubSettings>
): Promise<void> {
  const clubRef = doc(db, 'clubs', clubId);
  const updates: any = { updatedAt: serverTimestamp() };
  for (const [key, value] of Object.entries(settings)) {
    updates[`settings.${key}`] = value;
  }
  await updateDoc(clubRef, updates);
}

export async function updateClubInfo(
  clubId: string,
  data: { name?: string; description?: string; avatar?: string; type?: 'public' | 'private' }
): Promise<void> {
  const clubRef = doc(db, 'clubs', clubId);
  const updates: any = { updatedAt: serverTimestamp() };
  if (data.name !== undefined) updates.name = data.name.trim();
  if (data.description !== undefined) updates.description = data.description.trim();
  if (data.avatar !== undefined) updates.avatar = data.avatar;
  if (data.type !== undefined) updates.type = data.type;
  await updateDoc(clubRef, updates);
}

export async function regenerateInviteCode(clubId: string): Promise<string> {
  const newCode = generateInviteCode();
  await updateDoc(doc(db, 'clubs', clubId), {
    inviteCode: newCode,
    updatedAt: serverTimestamp(),
  });
  return newCode;
}

export async function deleteClub(clubId: string): Promise<void> {
  // Delete all messages first
  const msgSnap = await getDocs(collection(db, 'clubs', clubId, 'messages'));
  const batch = writeBatch(db);
  let count = 0;
  for (const msgDoc of msgSnap.docs) {
    batch.delete(msgDoc.ref);
    count++;
    if (count >= 450) {
      await batch.commit();
      count = 0;
    }
  }
  if (count > 0) await batch.commit();

  // Delete the club doc
  await deleteDoc(doc(db, 'clubs', clubId));
}

// ─── Hooks ───────────────────────────────────────────────

/** Real-time list of clubs the current user is a member of */
export function useUserClubs(userId: string | undefined) {
  const [clubs, setClubs] = useState<ClubData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setClubs([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'clubs'),
      where('memberIds', 'array-contains', userId)
    );

    const unsub = onSnapshot(q, (snap) => {
      const result: ClubData[] = [];
      snap.forEach((d) => result.push({ id: d.id, ...d.data(), _pendingWrite: d.metadata.hasPendingWrites } as ClubData));
      // Sort by most recently active. A just-sent message leaves updatedAt
      // unresolved (null) in the local snapshot; sortMillis keeps that row at
      // the top instead of dropping it to the bottom then snapping back.
      result.sort((a, b) => sortMillis(b) - sortMillis(a));
      setClubs(result);
      setLoading(false);
    }, (err) => {
      console.error('useUserClubs error:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [userId]);

  return { clubs, loading };
}

/** Discover public clubs — prioritize same school, then same city */
export function usePublicClubs(userSchool?: string, userCity?: string, userId?: string) {
  const [clubs, setClubs] = useState<ClubData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setClubs([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'clubs'),
      where('type', '==', 'public'),
      limit(20)
    );

    const unsub = onSnapshot(q, (snap) => {
      const all: ClubData[] = [];
      snap.forEach((d) => {
        const club = { id: d.id, ...d.data() } as ClubData;
        // Don't suggest clubs user is already in
        if (!club.memberIds.includes(userId)) {
          all.push(club);
        }
      });

      // Sort: same school first, then same city, then by member count
      all.sort((a, b) => {
        const aSchool = a.school === userSchool ? 1 : 0;
        const bSchool = b.school === userSchool ? 1 : 0;
        if (aSchool !== bSchool) return bSchool - aSchool;

        const aCity = a.city === userCity ? 1 : 0;
        const bCity = b.city === userCity ? 1 : 0;
        if (aCity !== bCity) return bCity - aCity;

        return (b.memberCount || 0) - (a.memberCount || 0);
      });

      setClubs(all.slice(0, 5));
      setLoading(false);
    }, (err) => {
      console.error('usePublicClubs error:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [userId, userSchool, userCity]);

  return { clubs, loading };
}
