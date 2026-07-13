import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface DiscoveryUser {
  id: string;
  name?: string;
  username?: string;
  school?: string;
  city?: string;
  about?: string | null;
  profilePicture?: string | null;
  coverPhoto?: string | null;
  verified?: boolean;
  reputation?: number;
  accountType?: string;
  orgName?: string;
}

export interface DiscoveryPost {
  id: string;
  title: string;
  content: string;
  type: string;
  school: string;
  city?: string;
  authorId: string;
  authorName: string;
  authorProfilePicture?: string | null;
  status: string;
  privacy?: 'public' | 'private';
  isAnonymous?: boolean;
  personaName?: string | null;
  personaEmoji?: string | null;
  reactionsCount?: Record<string, number> | null;
  imageUrl?: string;
  imageUrls?: string[];
  pdfUrl?: string;
  pdfPages?: number;
  videoUrl?: string;
  createdAt: any;
  updatedAt?: any;
  upvotesCount: number;
  downvotesCount?: number;
  repliesCount: number;
  poll?: {
    choices: string[];
    expiresAt: any;
    votes: Record<string, number>;
  };
}

export interface DiscoveryProduct {
  id: string;
  title: string;
  price: number;
  category: string;
  condition: string;
  image: string;
  images?: string[];
  status: string;
  sellerId: string;
  sellerName: string;
  sellerSchool: string;
  sellerProfilePicture?: string | null;
  city?: string;
  createdAt: any;
  updatedAt?: any;
  reservedById?: string | null;
  description?: string;
}

export interface DiscoverySearchResult {
  users: DiscoveryUser[];
  posts: DiscoveryPost[];
  products: DiscoveryProduct[];
  clubs?: Array<Record<string, unknown> & { id: string }>;
}

export interface DiscoveryReview {
  id: string;
  productId: string;
  sellerId?: string;
  reviewerId: string;
  reviewerName: string;
  rating: number;
  comment?: string;
  createdAt: any;
}

export interface BlockedUser extends DiscoveryUser {
  blockDocId: string;
}

export async function getDiscoveryFeed(params?: {
  mode?: 'for-you' | 'following';
  postCreatedAt?: number;
  productCreatedAt?: number;
  cursorIndex?: number;
} | null) {
  const callable = httpsCallable<any, any>(functions, 'getDiscoveryFeed');
  const result = await callable(params || {});
  return result.data;
}

export async function searchDiscovery(params: {
  query?: string;
  school?: string;
  city?: string;
  suggestions?: boolean;
}) {
  const callable = httpsCallable<typeof params, DiscoverySearchResult>(functions, 'searchDiscovery');
  const result = await callable(params);
  return result.data;
}

export async function getPublicUsers(userIds: string[]) {
  const ids = Array.from(new Set(userIds.filter(Boolean))).slice(0, 50);
  if (ids.length === 0) return [];
  const callable = httpsCallable<{ userIds: string[] }, { users: DiscoveryUser[] }>(functions, 'getPublicUsers');
  const result = await callable({ userIds: ids });
  return result.data.users;
}

export async function getBlockedUsers() {
  const callable = httpsCallable<Record<string, never>, { users: BlockedUser[] }>(functions, 'getBlockedUsers');
  const result = await callable({});
  return result.data.users;
}

export async function searchPublicUsers(params: { query?: string; limit?: number; excludeIds?: string[] }) {
  const callable = httpsCallable<typeof params, { users: DiscoveryUser[] }>(functions, 'searchPublicUsers');
  const result = await callable(params);
  return result.data.users;
}

export async function getPublicProfile(userId: string) {
  const callable = httpsCallable<{ userId: string }, { user: DiscoveryUser | null }>(functions, 'getPublicProfile');
  const result = await callable({ userId });
  return result.data.user;
}

export async function getPublicProfileContent(userId: string) {
  const callable = httpsCallable<
    { userId: string },
    { user: DiscoveryUser | null; posts: DiscoveryPost[]; products: DiscoveryProduct[] }
  >(functions, 'getPublicProfileContent');
  const result = await callable({ userId });
  return result.data;
}

export async function getPostReplies(postId: string) {
  const callable = httpsCallable<{ postId: string }, { replies: any[] }>(functions, 'getPostReplies');
  const result = await callable({ postId });
  return result.data.replies;
}

export async function getProductReviews(productId: string) {
  const callable = httpsCallable<{ productId: string }, { reviews: DiscoveryReview[] }>(functions, 'getProductReviews');
  const result = await callable({ productId });
  return result.data.reviews;
}

export async function createProductReview(productId: string, rating: number, comment: string) {
  const callable = httpsCallable<{ productId: string; rating: number; comment: string }, { id: string }>(functions, 'createProductReview');
  const result = await callable({ productId, rating, comment });
  return result.data;
}

export async function deletePostCascade(postId: string) {
  const callable = httpsCallable<{ postId: string }, { success: boolean }>(functions, 'deletePostCascade');
  const result = await callable({ postId });
  return result.data;
}

export async function lookupReferralCode(code: string) {
  const callable = httpsCallable<{ code: string }, { userId: string | null }>(functions, 'lookupReferralCode');
  const result = await callable({ code });
  return result.data.userId;
}

export async function createInviteCode() {
  const callable = httpsCallable<Record<string, never>, { code: string }>(functions, 'createInviteCode');
  const result = await callable({});
  return result.data.code;
}

export async function getLandingStats() {
  const callable = httpsCallable<Record<string, never>, { totalUsers: number; totalProducts: number; totalSchools: number }>(functions, 'getLandingStats');
  const result = await callable({});
  return result.data;
}

export async function getSuggestedUsers() {
  const callable = httpsCallable<Record<string, never>, { users: DiscoveryUser[] }>(functions, 'getSuggestedUsers');
  const result = await callable({});
  return result.data.users;
}
