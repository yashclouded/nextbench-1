import React from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import DashboardLayout from './components/layout/DashboardLayout';

import LandingPage from './pages/LandingPage';
import Login from './pages/Auth/Login';
import Signup from './pages/Auth/Signup';
import Verification from './pages/Auth/Verification';
import ProductDetail from './pages/Dashboard/ProductDetail';
import Profile from './pages/Dashboard/Profile';
import SellItem from './pages/Dashboard/SellItem';
import AdminPanel from './pages/Dashboard/AdminPanel';
import ChatList from './pages/Dashboard/ChatList';
import ChatRoom from './pages/Dashboard/ChatRoom';
import Wishlist from './pages/Dashboard/Wishlist';
import Notifications from './pages/Dashboard/Notifications';
import TermsPage from './pages/Legal/TermsPage';
import PrivacyPage from './pages/Legal/PrivacyPage';
import Feed from './pages/Dashboard/Feed';
import Search from './pages/Dashboard/Search';
import UsernameProfile from './pages/Dashboard/UsernameProfile';
import ProtectedRoute from './components/ui/ProtectedRoute';
import { useAuth } from './lib/AuthContext';

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
          {/* Protected Routes */}
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
    </div>
  );
}
