import { Link, useLocation } from 'react-router-dom';
import { Home, Search, PlusCircle, MessageSquare, User, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useEffect, useState } from 'react';

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

  const [unreadMsgCount, setUnreadMsgCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'notifications'), where('userId', '==', user.uid), where('read', '==', false));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let msgs = 0;
      
      snapshot.docs.forEach(d => {
        if (d.data().type === 'new_message') msgs++;
      });

      setUnreadMsgCount(msgs);
    });
    return () => unsubscribe();
  }, [user]);

  if (location.pathname.startsWith('/chat/')) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 nav-glass border-t pb-safe z-50 md:hidden" style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex items-center justify-around px-2 py-3">
        {navLinks.map((link) => {
          const isActive = location.pathname === link.path;
          const Icon = link.icon;
          return (
            <Link
              key={link.name}
              to={link.path}
              className={`p-2 rounded-full transition-all flex flex-col items-center gap-1 w-14 ${
                isActive 
                  ? 'text-luxury-ink' 
                  : 'text-luxury-ink/40 hover:text-luxury-ink/70 hover:bg-luxury-ink/5'
              }`}
            >
              <div className="relative flex items-center justify-center">
                <Icon size={24} className={`transition-transform ${isActive ? 'stroke-[2.5px] scale-105' : 'stroke-[1.5px]'}`} />
                {isActive && (
                  <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-brand-pink rounded-full border" style={{ borderColor: 'var(--color-surface-base)' }}></div>
                )}
                {!isActive && link.name === 'Messages' && unreadMsgCount > 0 && (
                  <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-brand-pink text-white rounded-full text-[8px] font-bold flex items-center justify-center border-2" style={{ borderColor: 'var(--color-surface-base)' }}>
                    {unreadMsgCount > 9 ? '9+' : unreadMsgCount}
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
