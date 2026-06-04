/**
 * MessagesShell.tsx
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import BottomNav from './BottomNav';
import MobileHeader from './MobileHeader';
import UsernameSetup from '../ui/UsernameSetup';
import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import MessagesLayout from '../../pages/Dashboard/MessagesLayout';
import SidebarNav from './SidebarNav';

export default function MessagesShell() {
  const { userData, user } = useAuth();
  const navigate = useNavigate();
  const needsUsername = !!(userData && userData.verified && !userData.username);

  return (
    <div className="h-screen overflow-hidden bg-surface-base font-sans text-luxury-ink flex flex-col">
      {/* Verification banner */}
      {userData && !userData.verified && (
        <div className="bg-brand-teal text-white px-4 py-2.5 text-center text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-3 z-50 shrink-0">
          <ShieldAlert size={14} />
          <span>Your account is unverified.</span>
          <Link to="/verification" className="bg-white text-brand-teal px-3 py-1 rounded-full hover:bg-brand-pink hover:text-white transition-colors">
            Verify Now
          </Link>
        </div>
      )}

      {/* Mobile header (shown on small screens) */}
      <div className="md:hidden shrink-0">
        <MobileHeader />
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className="hidden md:block w-72px shrink-0 border-r" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-card)' }}>
          <SidebarNav />
        </div>

        {/* ── Messages content ── */}
        <div className="flex-1 overflow-hidden">
          <MessagesLayout />
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="md:hidden shrink-0">
        <BottomNav />
      </div>

      {needsUsername && <UsernameSetup isOpen={true} mandatory={true} onClose={() => {}} />}
    </div>
  );
}