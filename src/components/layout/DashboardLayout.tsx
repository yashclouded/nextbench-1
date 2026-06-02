import { ReactNode } from 'react';
import SidebarNav from './SidebarNav';
import BottomNav from './BottomNav';
import MobileHeader from './MobileHeader';
import SuggestedUsers from '../ui/SuggestedUsers';
import { useAuth } from '../../lib/AuthContext';
import UsernameSetup from '../ui/UsernameSetup';
import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { userData } = useAuth();
  const needsUsername = !!(userData && userData.verified && !userData.username);
  return (
    <div className="min-h-screen bg-surface-base font-sans text-luxury-ink relative">
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
      {/* Full-width Layout to snap options to left corner */}
      <div className="w-full flex relative z-10">
        
        {/* Left Sidebar (snapped to left edge) */}
        <div className="hidden md:block w-80px xl:w-280px shrink-0 border-r" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-card)' }}>
          <SidebarNav />
        </div>

        {/* Center the rest of the content (Main + Right Sidebar) in the remaining space */}
        <div className="flex-1 flex justify-center">
          <div className="flex w-full max-w-1100px">
            {/* Center Main Content */}
            <main className="flex-1 min-w-0 md:border-r pb-20 md:pb-0" style={{ borderColor: 'var(--color-border)' }}>
              {children}
            </main>

            {/* Right Sidebar (hidden on mobile and tablet) */}
            <div className="hidden lg:block w-[320px] xl:w-350px shrink-0">
              <SuggestedUsers />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Nav for Mobile */}
      <BottomNav />
      
      {needsUsername && <UsernameSetup isOpen={true} mandatory={true} onClose={() => {}} />}
    </div>
  );
}
