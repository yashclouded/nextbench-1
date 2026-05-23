import React, { Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import DashboardLayout from './components/layout/DashboardLayout';
import ProtectedRoute from './components/ui/ProtectedRoute';
import { useAuth } from './lib/AuthContext';

// ─── Lazy-loaded pages ─────────────────────────────────────
// Each page is only downloaded when the user navigates to it,
// cutting the initial JS bundle dramatically.
const LandingPage = React.lazy(() => import('./pages/LandingPage'));
const Login = React.lazy(() => import('./pages/Auth/Login'));
const Signup = React.lazy(() => import('./pages/Auth/Signup'));
const Verification = React.lazy(() => import('./pages/Auth/Verification'));
const Feed = React.lazy(() => import('./pages/Dashboard/Feed'));
const Search = React.lazy(() => import('./pages/Dashboard/Search'));
const ProductDetail = React.lazy(() => import('./pages/Dashboard/ProductDetail'));
const Profile = React.lazy(() => import('./pages/Dashboard/Profile'));
const SellItem = React.lazy(() => import('./pages/Dashboard/SellItem'));
const AdminPanel = React.lazy(() => import('./pages/Dashboard/AdminPanel'));
const ChatList = React.lazy(() => import('./pages/Dashboard/ChatList'));
const ChatRoom = React.lazy(() => import('./pages/Dashboard/ChatRoom'));
const Wishlist = React.lazy(() => import('./pages/Dashboard/Wishlist'));
const Notifications = React.lazy(() => import('./pages/Dashboard/Notifications'));
const TermsPage = React.lazy(() => import('./pages/Legal/TermsPage'));
const PrivacyPage = React.lazy(() => import('./pages/Legal/PrivacyPage'));
const UsernameProfile = React.lazy(() => import('./pages/Dashboard/UsernameProfile'));

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
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
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
            
            {/* Username route — MUST be last in dashboard routes */}
            <Route path="/:username" element={<ProtectedRoute requireAuth><UsernameProfile /></ProtectedRoute>} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}

