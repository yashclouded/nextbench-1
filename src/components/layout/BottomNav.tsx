import { Link, useLocation } from 'react-router-dom';
import { Home, Search, PlusCircle, MessageSquare, User, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { useUnreadChatCount } from '../../hooks/useUnreadChatCount';

export default function BottomNav() {
  const { user, userData } = useAuth();
  const location = useLocation();

  const navLinks = [
    { name: 'Home', path: '/', icon: Home },
    { name: 'Search', path: '/search', icon: Search },
    { name: 'Sell', path: '/sell', icon: PlusCircle },
    { name: 'Messages', path: '/messages', icon: MessageSquare },
    { name: 'Profile', path: user ? (userData?.username ? `/u/${userData.username}` : `/profile/${user.uid}`) : '/login', icon: User },
    ...(userData?.isAdmin ? [{ name: 'Admin', path: '/admin', icon: ShieldCheck }] : []),
  ];

  const unreadMsgCount = useUnreadChatCount(user?.uid);

  if (location.pathname.startsWith('/chat/')) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 nav-glass border-t pb-safe z-50 md:hidden" style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex items-center justify-around px-2 py-2">
        {navLinks.map((link) => {
          const isActive = location.pathname === link.path;
          const Icon = link.icon;
          return (
            <Link
              key={link.name}
              to={link.path}
              className={`p-2.5 rounded-xl transition-all flex flex-col items-center gap-0.5 ${
                isActive 
                  ? 'text-luxury-ink' 
                  : 'text-luxury-ink/35 active:text-luxury-ink/60'
              }`}
            >
              <div className="relative flex items-center justify-center">
                <Icon size={22} className={`transition-all ${isActive ? 'stroke-[2.5px]' : 'stroke-[1.5px]'}`} />
                {link.name === 'Messages' && unreadMsgCount > 0 && (
                  <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-brand-pink text-white rounded-full text-[8px] font-bold flex items-center justify-center border-2" style={{ borderColor: 'var(--color-surface-base)' }}>
                    {unreadMsgCount > 9 ? '9+' : unreadMsgCount}
                  </div>
                )}
              </div>
              <span className={`text-[10px] ${isActive ? 'font-semibold' : 'font-medium'}`}>{link.name}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
