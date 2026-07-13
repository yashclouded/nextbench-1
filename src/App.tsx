import React, { Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import DashboardLayout from './components/layout/DashboardLayout';
import ProtectedRoute from './components/ui/ProtectedRoute';
import ErrorBoundary from './components/ui/ErrorBoundary';
import { useAuth } from './lib/AuthContext';
import { lazyWithRetry } from './lib/lazyWithRetry';
import { LightboxProvider } from './lib/LightboxContext';

import { useToast } from './lib/ToastContext';
import {
  FeedSkeleton,
  MarketplaceSkeleton,
  ProfileSkeleton,
  ProductDetailSkeleton,
  MessagesSkeleton,
  NotificationsSkeleton,
  ChatSkeleton,
  SearchSkeleton,
  Skeleton,
} from './components/ui/skeleton/Skeleton';

const LandingPage   = lazyWithRetry(() => import('./pages/LandingPage'));
const Login         = lazyWithRetry(() => import('./pages/Auth/Login'));
const Signup        = lazyWithRetry(() => import('./pages/Auth/Signup'));
const OrgSignup     = lazyWithRetry(() => import('./pages/Auth/OrgSignup'));
const Verification  = lazyWithRetry(() => import('./pages/Auth/Verification'));
const Feed          = lazyWithRetry(() => import('./pages/Dashboard/Feed'));
const Search        = lazyWithRetry(() => import('./pages/Dashboard/Search'));
const ProductDetail = lazyWithRetry(() => import('./pages/Dashboard/ProductDetail'));
const Profile       = lazyWithRetry(() => import('./pages/Dashboard/Profile'));
const SellItem      = lazyWithRetry(() => import('./pages/Dashboard/SellItem'));
const AdminPanel    = lazyWithRetry(() => import('./pages/Dashboard/AdminPanel'));
const PostView      = lazyWithRetry(() => import('./pages/PostView'));
const MessagesLayout = lazyWithRetry(() => import('./pages/Dashboard/MessagesLayout'));
// Legacy /chat/:roomId deep-link — imported separately so old notification links still work.
// ChatRoom is also used internally by MessagesLayout (non-lazy), which is fine; React
// deduplicates the module so there's no double-bundle issue with modern bundlers.
const ChatRoomPage  = lazyWithRetry(() => import('./pages/Dashboard/ChatRoom'));
const ClubChat      = lazyWithRetry(() => import('./pages/Dashboard/ClubChat'));
const ClubSettings  = lazyWithRetry(() => import('./pages/Dashboard/ClubSettings'));
const ClubJoin      = lazyWithRetry(() => import('./pages/Dashboard/ClubJoin'));
const Wishlist      = lazyWithRetry(() => import('./pages/Dashboard/Wishlist'));
const Notifications = lazyWithRetry(() => import('./pages/Dashboard/Notifications'));
const TermsPage     = lazyWithRetry(() => import('./pages/Legal/TermsPage'));
const PrivacyPage   = lazyWithRetry(() => import('./pages/Legal/PrivacyPage'));
const CareersPage   = lazyWithRetry(() => import('./pages/Legal/CareersPage'));
const TransparencyPage = lazyWithRetry(() => import('./pages/Legal/TransparencyPage'));
const UsernameProfile = lazyWithRetry(() => import('./pages/Dashboard/UsernameProfile'));
const Invite        = lazyWithRetry(() => import('./pages/Dashboard/Invite'));
const NotFound      = lazyWithRetry(() => import('./pages/NotFound'));
const Marketplace = lazyWithRetry(() => import('./pages/Marketplace'));

function PageLoader() {
  return (
    <div className="mx-auto w-full max-w-xl px-5 py-8 sm:px-8">
      <div className="mb-8 flex items-center justify-between">
        <Skeleton className="h-7 w-28 rounded-xl" />
        <Skeleton className="h-9 w-9 rounded-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-4 w-3/4 rounded-full" />
        <Skeleton className="h-4 w-2/5 rounded-full" />
      </div>
    </div>
  );
}

function VerificationGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/signup" replace />;
  return <>{children}</>;
}

function NeutralLoadingShell() {
  return (
    <div className="min-h-screen flex flex-col bg-surface-base">
      <div className="h-16 px-6 border-b flex items-center justify-between bg-surface-card" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-teal flex items-center justify-center text-white font-bold text-lg">N</div>
          <span className="font-bold text-luxury-ink tracking-tight font-serif italic">Nextbench</span>
        </div>
        <div className="w-8 h-8 rounded-full bg-surface-soft skeleton" />
      </div>
      <div className="flex-1 max-w-xl mx-auto w-full pt-8 px-4">
        <FeedSkeleton />
      </div>
    </div>
  );
}

function SmartHome() {
  const { user, loading } = useAuth();
  if (loading) {
    return <NeutralLoadingShell />;
  }
  if (user) {
    return (
      <DashboardLayout>
        <Feed />
      </DashboardLayout>
    );
  }
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1"><LandingPage /></main>
      <Footer />
    </div>
  );
}

function MainLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1"><Outlet /></main>
      <Footer />
    </div>
  );
}

function DashLayout() {
  return (
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  );
}

export default function App() {
  const { showToast } = useToast();

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');
    if (refCode) {
      localStorage.setItem('pendingReferral', refCode);
    }

    // Handle push notifications when the app is in the foreground
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const { getMessagingInstance } = await import('./lib/firebase');
        const msg = await getMessagingInstance();
        if (msg) {
          const { onMessage } = await import('firebase/messaging');
          unsubscribe = onMessage(msg, (payload) => {
            const title = payload.notification?.title || 'New Notification';
            const body = payload.notification?.body || '';
            showToast(`${title}: ${body}`, 'info');
            if (Notification.permission === 'granted') {
              new Notification(title, { body, icon: '/logo.png' });
            }
          });
        }
      } catch (err) {
        console.warn('[App] Push messaging not available:', err);
      }
    })();
    return () => { unsubscribe?.(); };
  }, [showToast]);

  return (
    <ErrorBoundary>
      <LightboxProvider>
        <div className="bg-surface-base font-sans">
          <Helmet>
            <title>Nextbench | The Student Marketplace</title>
            <meta name="description" content="Nextbench is the exclusive marketplace and community for verified students. Buy, sell, and connect." />
          </Helmet>

          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<SmartHome />} />

              <Route element={<MainLayout />}>
                <Route path="/careers"      element={<CareersPage />} />
                <Route path="/terms"        element={<TermsPage />} />
                <Route path="/privacy"      element={<PrivacyPage />} />
                <Route path="/transparency" element={<TransparencyPage />} />
                <Route path="/login"        element={<Login />} />
                <Route path="/signup"       element={<Signup />} />
                <Route path="/org-signup"   element={<OrgSignup />} />
                <Route path="/marketplace"  element={<Suspense fallback={<MarketplaceSkeleton />}><Marketplace /></Suspense>} />
                <Route path="/verification" element={<VerificationGuard><Verification /></VerificationGuard>} />
                <Route path="/post/:postId" element={<PostView />} />
              </Route>

              {/* Dashboard 3-column layout */}
              <Route element={<DashLayout />}>
                <Route path="/dashboard"  element={<Navigate to="/" replace />} />
                <Route path="/community"  element={<Suspense fallback={<FeedSkeleton />}><Feed /></Suspense>} />
                <Route path="/search"     element={<Suspense fallback={<SearchSkeleton />}><Search /></Suspense>} />
                <Route path="/product/:id" element={<ProtectedRoute requireAuth><Suspense fallback={<ProductDetailSkeleton />}><ProductDetail /></Suspense></ProtectedRoute>} />
                {/* Listing items on marketplace — requires verification */}
                <Route path="/sell"       element={<ProtectedRoute requireAuth requireVerified><SellItem /></ProtectedRoute>} />
                <Route path="/edit-item/:id" element={<ProtectedRoute requireAuth requireVerified><SellItem /></ProtectedRoute>} />
                {/* Profile — auth only */}
                <Route path="/profile"    element={<ProtectedRoute requireAuth><Suspense fallback={<ProfileSkeleton />}><Profile /></Suspense></ProtectedRoute>} />
                <Route path="/profile/:userId" element={<ProtectedRoute requireAuth><Suspense fallback={<ProfileSkeleton />}><Profile /></Suspense></ProtectedRoute>} />
                {/* Wishlist & Notifications — auth only (no verification needed) */}
                <Route path="/wishlist"   element={<ProtectedRoute requireAuth><Suspense fallback={<MarketplaceSkeleton />}><Wishlist /></Suspense></ProtectedRoute>} />
                <Route path="/notifications" element={<ProtectedRoute requireAuth><Suspense fallback={<NotificationsSkeleton />}><Notifications /></Suspense></ProtectedRoute>} />
                {/* Messaging verified students — requires verification */}
                <Route path="/messages"   element={<ProtectedRoute requireAuth requireVerified><Suspense fallback={<MessagesSkeleton />}><MessagesLayout /></Suspense></ProtectedRoute>} />
                <Route path="/messages/:roomId" element={<ProtectedRoute requireAuth requireVerified><Suspense fallback={<MessagesSkeleton />}><MessagesLayout /></Suspense></ProtectedRoute>} />
                <Route path="/messages/club/:clubId" element={<ProtectedRoute requireAuth requireVerified><Suspense fallback={<MessagesSkeleton />}><MessagesLayout /></Suspense></ProtectedRoute>} />
                <Route path="/chat/:roomId" element={<ProtectedRoute requireAuth requireVerified><Suspense fallback={<ChatSkeleton />}><ChatRoomPage /></Suspense></ProtectedRoute>} />
                <Route path="/admin"      element={<ProtectedRoute requireAuth requireAdmin><AdminPanel /></ProtectedRoute>} />
                {/* Club features — auth only (no verification gate) */}
                <Route path="/club/join/:inviteCode" element={<ProtectedRoute requireAuth><ClubJoin /></ProtectedRoute>} />
                <Route path="/club/:clubId"          element={<ProtectedRoute requireAuth><Suspense fallback={<ChatSkeleton />}><ClubChat /></Suspense></ProtectedRoute>} />
                <Route path="/club/:clubId/settings" element={<ProtectedRoute requireAuth><ClubSettings /></ProtectedRoute>} />
                <Route path="/invite"     element={<ProtectedRoute requireAuth><Invite /></ProtectedRoute>} />
                <Route path="/u/:username" element={<ProtectedRoute requireAuth><Suspense fallback={<ProfileSkeleton />}><UsernameProfile /></Suspense></ProtectedRoute>} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </div>
      </LightboxProvider>
    </ErrorBoundary>
  );
}
