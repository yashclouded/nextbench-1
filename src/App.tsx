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

// ─── Lazy-loaded pages ─────────────────────────────────────
// Each page is only downloaded when the user navigates to it,
// cutting the initial JS bundle dramatically.
// lazyWithRetry adds automatic retry + reload on stale chunk 404s.
const LandingPage = lazyWithRetry(() => import('./pages/LandingPage'));
const Login = lazyWithRetry(() => import('./pages/Auth/Login'));
const Signup = lazyWithRetry(() => import('./pages/Auth/Signup'));
const OrgSignup = lazyWithRetry(() => import('./pages/Auth/OrgSignup'));
const Verification = lazyWithRetry(() => import('./pages/Auth/Verification'));
const Feed = lazyWithRetry(() => import('./pages/Dashboard/Feed'));
const Search = lazyWithRetry(() => import('./pages/Dashboard/Search'));
const ProductDetail = lazyWithRetry(() => import('./pages/Dashboard/ProductDetail'));
const Profile = lazyWithRetry(() => import('./pages/Dashboard/Profile'));
const SellItem = lazyWithRetry(() => import('./pages/Dashboard/SellItem'));
const AdminPanel = lazyWithRetry(() => import('./pages/Dashboard/AdminPanel'));
const ChatList = lazyWithRetry(() => import('./pages/Dashboard/ChatList'));
const ChatRoom = lazyWithRetry(() => import('./pages/Dashboard/ChatRoom'));
const Wishlist = lazyWithRetry(() => import('./pages/Dashboard/Wishlist'));
const Notifications = lazyWithRetry(() => import('./pages/Dashboard/Notifications'));
const TermsPage = lazyWithRetry(() => import('./pages/Legal/TermsPage'));
const PrivacyPage = lazyWithRetry(() => import('./pages/Legal/PrivacyPage'));
const CareersPage = lazyWithRetry(() => import('./pages/Legal/CareersPage'));
const UsernameProfile = lazyWithRetry(() => import('./pages/Dashboard/UsernameProfile'));

// Minimal loading fallback — fast and non-disruptive
function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
    </div>
  );
}


/** Redirects logged-in-but-unverified users to /verification, and not-logged-in to /signup */
function VerificationGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/signup" replace />;
  return <>{children}</>;
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
            {/* Public Marketing/Auth Layout (Navbar + Footer) */}
            <Route element={<MainLayout />}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/careers" element={<CareersPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/org-signup" element={<OrgSignup />} />
              <Route path="/verification" element={<VerificationGuard><Verification /></VerificationGuard>} />
            </Route>

            {/* Dashboard 3-Column Layout */}
            <Route element={<DashLayout />}>
              {/* Protected Dashboard Routes */}
              <Route path="/dashboard" element={<ProtectedRoute requireAuth><Feed /></ProtectedRoute>} />
              <Route path="/community" element={<ProtectedRoute requireAuth><Feed /></ProtectedRoute>} />
              <Route path="/search" element={<ProtectedRoute requireAuth><Search /></ProtectedRoute>} />
              <Route path="/product/:id" element={<ProtectedRoute requireAuth><ProductDetail /></ProtectedRoute>} />
              <Route path="/sell" element={<ProtectedRoute requireAuth requireVerified><SellItem /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute requireAuth><Profile /></ProtectedRoute>} />
              <Route path="/profile/:userId" element={<ProtectedRoute requireAuth><Profile /></ProtectedRoute>} />
              <Route path="/messages" element={<ProtectedRoute requireAuth requireVerified><ChatList /></ProtectedRoute>} />
              <Route path="/chat/:roomId" element={<ProtectedRoute requireAuth requireVerified><ChatRoom /></ProtectedRoute>} />
              <Route path="/wishlist" element={<ProtectedRoute requireAuth requireVerified><Wishlist /></ProtectedRoute>} />
              <Route path="/notifications" element={<ProtectedRoute requireAuth requireVerified><Notifications /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute requireAuth requireAdmin><AdminPanel /></ProtectedRoute>} />
              
              {/* Username profile route */}
              <Route path="/u/:username" element={<ProtectedRoute requireAuth><UsernameProfile /></ProtectedRoute>} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
    </ErrorBoundary>
  );
}

