/**
 * MessagesShell.tsx
 */

import { NavLink, useNavigate } from 'react-router-dom';
import { Home, Search, ShoppingBag, MessageSquare, Bell, User, LogOut, Plus, Bookmark } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import BottomNav from './BottomNav';
import MobileHeader from './MobileHeader';
import UsernameSetup from '../ui/UsernameSetup';
import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getOptimizedImageUrl } from '../../lib/utils';
import MessagesLayout from '../../pages/Dashboard/MessagesLayout';
import { useUnreadChatCount } from '../../hooks/useUnreadChatCount';

const NAV_ITEMS = [
  { to: '/',            icon: Home,         label: 'Home' },
  { to: '/search',      icon: Search,       label: 'Search' },
  { to: '/sell',        icon: Plus,         label: 'Sell' },
  { to: '/messages',    icon: MessageSquare,label: 'Messages' },
  { to: '/notifications', icon: Bell,       label: 'Notifications' },
  { to: '/wishlist',    icon: Bookmark,     label: 'Wishlist' },
  { to: '/profile',     icon: User,         label: 'Profile' },
];

export default function MessagesShell() {
  const { userData, user, logout } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadChatCount();
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
        {/* ── Icon-only left sidebar (desktop only) ── */}
        <nav
          className="hidden md:flex flex-col items-center py-4 shrink-0 border-r gap-1"
          style={{
            width: '68px',
            borderColor: 'var(--color-border)',
            background: 'var(--color-surface-card)',
          }}
        >
          {/* Logo */}
          <Link to="/" className="mb-3 w-9 h-9 flex items-center justify-center">
            <img src="/logo.png" alt="Nextbench" className="w-8 h-8 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </Link>

          {/* Nav icons */}
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              title={label}
              className={({ isActive }) =>
                `relative flex items-center justify-center w-11 h-11 rounded-xl transition-all group ${
                  isActive
                    ? 'bg-surface-soft/60 text-luxury-ink'
                    : 'text-luxury-ink/50 hover:bg-surface-soft/40 hover:text-luxury-ink/80'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} className={`transition-all duration-200 ${isActive ? 'stroke-[2.5px]' : 'stroke-[1.5px]'}`} />
                  {/* Unread badge on messages icon */}
                  {label === 'Messages' && unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-brand-teal rounded-full" />
                  )}
                  {/* Tooltip */}
                  <span className="absolute left-full ml-2 px-2 py-1 bg-luxury-ink text-surface-base text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Avatar / profile */}
          {userData?.profilePicture ? (
            <button
              onClick={() => navigate('/profile')}
              title="Profile"
              className="w-9 h-9 rounded-full overflow-hidden border-2 border-luxury-ink/10 hover:border-brand-teal transition-colors mb-1"
            >
              <img src={getOptimizedImageUrl(userData.profilePicture)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </button>
          ) : (
            <button
              onClick={() => navigate('/profile')}
              title="Profile"
              className="w-9 h-9 rounded-full bg-brand-teal/10 flex items-center justify-center hover:bg-brand-teal/20 transition-colors mb-1"
            >
              <User size={16} className="text-brand-teal" />
            </button>
          )}
        </nav>

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