import { Link, useLocation } from 'react-router-dom';
import { Bell, Moon, Sun } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useEffect, useState } from 'react';
import { useTheme } from '../../lib/ThemeContext';
import { isChatMessageNotification } from '../../lib/notifications';

export default function MobileHeader() {
  const { user } = useAuth();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    const q = query(collection(db, 'notifications'), where('userId', '==', user.uid), where('read', '==', false));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let others = 0;
      snapshot.docs.forEach(d => {
        if (!isChatMessageNotification(d.data())) others++;
      });
      setUnreadCount(others);
    }, (err) => {
      console.warn('MobileHeader: notifications listener error (ignored):', err);
    });
    return () => unsubscribe();
  }, [user]);

  // Don't show header if we are not on main dashboard pages,
  // to avoid conflicting with modal headers or simple pages.
  const showHeaderPaths = ['/', '/dashboard', '/community', '/search', '/notifications'];
  if (!showHeaderPaths.includes(location.pathname)) {
    return null;
  }

  return (
    <div className="md:hidden sticky top-0 z-[60] nav-glass border-b px-4 py-3 flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
      <Link to="/" className="flex items-center gap-2">
        <img src="/logo.png" alt="Logo" className="h-6 w-auto" />
        <span className="text-xl font-bold tracking-tight text-luxury-ink">nextbench</span>
      </Link>
      <div className="flex items-center gap-1">
        <button 
          onClick={toggleTheme} 
          className="p-2 text-luxury-ink/60 hover:bg-luxury-ink/5 rounded-full transition-colors"
          title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        >
          {theme === 'dark' ? (
            <Sun size={20} className="text-amber-400 theme-toggle-icon" />
          ) : (
            <Moon size={20} className="theme-toggle-icon" />
          )}
        </button>
        <Link to="/notifications" className="relative p-2 text-luxury-ink hover:bg-luxury-ink/5 rounded-full transition-colors">
          <Bell size={24} className="stroke-[1.5px]" />
          {unreadCount > 0 && (
            <div className="absolute top-1 right-1 w-3.5 h-3.5 bg-brand-pink text-white rounded-full text-[8px] font-bold flex items-center justify-center border-2" style={{ borderColor: 'var(--color-surface-base)' }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </div>
          )}
        </Link>
      </div>
    </div>
  );
}
