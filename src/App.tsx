import { Routes, Route } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import LandingPage from './pages/LandingPage';
import Marketplace from './pages/Dashboard/Marketplace';
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
import ProtectedRoute from './components/ui/ProtectedRoute';

export default function App() {
  return (
    <div className="min-h-screen bg-surface-base font-sans select-none">
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/verification" element={<Verification />} />
          <Route path="/dashboard" element={<Marketplace />} />

          {/* Protected: Require auth */}
          <Route path="/sell" element={
            <ProtectedRoute requireAuth requireVerified>
              <SellItem />
            </ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute requireAuth>
              <Profile />
            </ProtectedRoute>
          } />
          <Route path="/messages" element={
            <ProtectedRoute requireAuth>
              <ChatList />
            </ProtectedRoute>
          } />
          <Route path="/chat/:roomId" element={
            <ProtectedRoute requireAuth>
              <ChatRoom />
            </ProtectedRoute>
          } />
          <Route path="/wishlist" element={
            <ProtectedRoute requireAuth>
              <Wishlist />
            </ProtectedRoute>
          } />
          <Route path="/notifications" element={
            <ProtectedRoute requireAuth>
              <Notifications />
            </ProtectedRoute>
          } />

          {/* Protected: Require admin */}
          <Route path="/admin" element={
            <ProtectedRoute requireAuth requireAdmin>
              <AdminPanel />
            </ProtectedRoute>
          } />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
