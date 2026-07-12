import { ReactNode } from 'react';
import SidebarNav from './SidebarNav';
import BottomNav from './BottomNav';
import MobileHeader from './MobileHeader';
import SuggestedUsers from '../ui/SuggestedUsers';
import { useAuth } from '../../lib/AuthContext';
import UsernameSetup from '../ui/UsernameSetup';
import { ShieldAlert } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import RightSidebarDrawer from './RightSidebarDrawer'; 

import { useBiDirectionalSticky } from '../../hooks/useBiDirectionalSticky';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { userData } = useAuth();
  const location = useLocation();
  const needsUsername = !!(userData && userData.verified && !userData.username);
  const isClubPage = location.pathname.startsWith('/club');
  const isMessagesPage = location.pathname.startsWith('/messages');
  const isCollapsedLeftNav = isClubPage || isMessagesPage;
  const rightSidebarRef = useBiDirectionalSticky();

  return (
    <div className={`${isMessagesPage ? 'h-[100dvh] overflow-hidden flex flex-col' : 'min-h-screen'} bg-surface-base font-sans text-luxury-ink relative`}>
      {userData && !userData.verified && (
        <div className="bg-brand-teal text-white px-4 py-3 text-center text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-3 z-50 relative">
          <ShieldAlert size={16} />
          <span>Your account is unverified. You can browse, but interactions are disabled.</span>
          <Link to="/verification" className="bg-white text-brand-teal px-3 py-1 rounded-full hover:bg-brand-pink hover:text-white transition-colors">
            Verify Now
          </Link>
        </div>
      )}
      
      <MobileHeader />
      
      {/* Centered Layout Container */}
      <div className={`w-full flex justify-center relative ${isMessagesPage ? 'flex-1 min-h-0' : ''}`}>
        
        {/* Main Content Wrapper restricted to 1350px */}
        <div className={`flex w-full max-w-[1350px] min-w-0 ${isMessagesPage ? 'h-full' : ''}`}>
          
          {/* Left Sidebar (Now next to middle content) */}
          <div className={`hidden md:block shrink-0 border-r transition-all duration-300 relative z-50 ${
            isCollapsedLeftNav ? 'w-[72px]' : 'w-[72px] min-[1120px]:w-[240px]'
          } ${isMessagesPage ? 'h-full' : ''}`} style={{ borderColor: 'var(--color-border)' }}>
            <SidebarNav />
          </div>

          {/* Center Main Content */}
          <main className={`flex-1 min-w-0 md:border-r pb-20 md:pb-0 ${isMessagesPage ? 'flex flex-col relative h-full' : ''}`} style={{ borderColor: 'var(--color-border)' }}>
            {children}
          </main>

          {/* Right Sidebar (hidden on mobile and tablet) */}
          {!isMessagesPage && (
            <div ref={rightSidebarRef} className="hidden min-[1200px]:block w-[320px] min-[1400px]:w-[380px] shrink-0">
              <SuggestedUsers />
            </div>
          )}
        </div>
      </div>

      {/* Bottom Nav for Mobile */}
      <BottomNav />
      <RightSidebarDrawer />
      
      {needsUsername && <UsernameSetup isOpen={true} mandatory={true} onClose={() => {}} />}
    </div>
  );
}
