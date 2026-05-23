import { ReactNode } from 'react';
import SidebarNav from './SidebarNav';
import BottomNav from './BottomNav';
import MobileHeader from './MobileHeader';
import SuggestedUsers from '../ui/SuggestedUsers';
import { useAuth } from '../../lib/AuthContext';
import UsernameSetup from '../ui/UsernameSetup';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { userData } = useAuth();
  const needsUsername = !!(userData && userData.verified && !userData.username);
  return (
    <div className="min-h-screen bg-surface-base font-sans selection:bg-brand-teal/20 selection:text-brand-teal text-luxury-ink relative">
      {/* Ambient decoration orbs */}
      <div className="ambient-orb ambient-orb-teal" />
      <div className="ambient-orb ambient-orb-pink" />
      
      <MobileHeader />
      {/* 3-column Layout for Desktop */}
      <div className="max-w-[1400px] mx-auto flex relative z-10">
        
        {/* Left Sidebar (hidden on mobile) */}
        <div className="hidden md:block w-[80px] xl:w-[280px] shrink-0">
          <SidebarNav />
        </div>

        {/* Center Main Content */}
        <main className="flex-1 min-w-0 md:border-l md:border-r pb-20 md:pb-0" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-card)' }}>
          {children}
        </main>

        {/* Right Sidebar (hidden on mobile and tablet) */}
        <div className="hidden lg:block w-[320px] xl:w-[350px] shrink-0">
          <SuggestedUsers />
        </div>
      </div>

      {/* Bottom Nav for Mobile */}
      <BottomNav />
      
      {needsUsername && <UsernameSetup isOpen={true} mandatory={true} onClose={() => {}} />}
    </div>
  );
}
