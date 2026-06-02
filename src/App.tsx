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
const MessagesShell = lazyWithRetry(() => import('./components/layout/MessagesShell'));
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
const UsernameProfile = lazyWithRetry(() => import('./pages/Dashboard/UsernameProfile'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function VerificationGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/signup" replace />;
  return <>{children}</>;
}

function SmartHome() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
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
  return (
    <ErrorBoundary>
      <div className="bg-surface-base font-sans select-none">
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
              <Route path="/login"        element={<Login />} />
              <Route path="/signup"       element={<Signup />} />
              <Route path="/org-signup"   element={<OrgSignup />} />
              <Route path="/verification" element={<VerificationGuard><Verification /></VerificationGuard>} />
            </Route>

            {/* Messages — full-screen shell, no DashLayout, no right sidebar */}
            <Route
              path="/messages"
              element={<ProtectedRoute requireAuth requireVerified><MessagesShell /></ProtectedRoute>}
            />
            <Route
              path="/messages/:roomId"
              element={<ProtectedRoute requireAuth requireVerified><MessagesShell /></ProtectedRoute>}
            />

            {/*
              Legacy deep-link kept for old notification URLs pointing to /chat/:roomId.
              ChatRoomPage renders in standalone (fixed inset-0) mode — no panelMode prop.
            */}
            <Route
              path="/chat/:roomId"
              element={<ProtectedRoute requireAuth requireVerified><ChatRoomPage /></ProtectedRoute>}
            />

            {/* Dashboard 3-column layout */}
            <Route element={<DashLayout />}>
              <Route path="/dashboard"  element={<Navigate to="/" replace />} />
              <Route path="/community"  element={<ProtectedRoute requireAuth><Feed /></ProtectedRoute>} />
              <Route path="/search"     element={<ProtectedRoute requireAuth><Search /></ProtectedRoute>} />
              <Route path="/product/:id" element={<ProtectedRoute requireAuth><ProductDetail /></ProtectedRoute>} />
              <Route path="/sell"       element={<ProtectedRoute requireAuth requireVerified><SellItem /></ProtectedRoute>} />
              <Route path="/edit-item/:id" element={<ProtectedRoute requireAuth requireVerified><SellItem /></ProtectedRoute>} />
              <Route path="/profile"    element={<ProtectedRoute requireAuth><Profile /></ProtectedRoute>} />
              <Route path="/profile/:userId" element={<ProtectedRoute requireAuth><Profile /></ProtectedRoute>} />
              <Route path="/wishlist"   element={<ProtectedRoute requireAuth requireVerified><Wishlist /></ProtectedRoute>} />
              <Route path="/notifications" element={<ProtectedRoute requireAuth requireVerified><Notifications /></ProtectedRoute>} />
              <Route path="/admin"      element={<ProtectedRoute requireAuth requireAdmin><AdminPanel /></ProtectedRoute>} />
              <Route path="/club/join/:inviteCode" element={<ProtectedRoute requireAuth requireVerified><ClubJoin /></ProtectedRoute>} />
              <Route path="/club/:clubId"          element={<ProtectedRoute requireAuth requireVerified><ClubChat /></ProtectedRoute>} />
              <Route path="/club/:clubId/settings" element={<ProtectedRoute requireAuth requireVerified><ClubSettings /></ProtectedRoute>} />
              <Route path="/u/:username" element={<ProtectedRoute requireAuth><UsernameProfile /></ProtectedRoute>} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
    </ErrorBoundary>
  );
}