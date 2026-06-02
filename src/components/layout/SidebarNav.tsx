import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Search, PlusCircle, MessageSquare, User, LogOut, ShieldCheck, Bell } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { auth } from '../../lib/firebase';
import { signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useEffect, useState, useRef } from 'react';
import { useToast } from '../../lib/ToastContext';
import { getOptimizedImageUrl } from '../../lib/utils';
import { isChatMessageNotification } from '../../lib/notifications';
import { useUnreadChatCount } from '../../hooks/useUnreadChatCount';

export default function SidebarNav() {
  const { user, userData } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut(auth);
    navigate('/');
  };

  const [unreadCount, setUnreadCount] = useState(0);
  const unreadMsgCount = useUnreadChatCount(user?.uid);
  const { showToast } = useToast();
  const initialLoad = useRef(true);
  const locationPathRef = useRef(location.pathname);

  useEffect(() => {
    locationPathRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      initialLoad.current = true;
      return;
    }

    const q = query(collection(db, 'notifications'), where('userId', '==', user.uid), where('read', '==', false));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let others = 0;
      
      snapshot.docs.forEach(d => {
        if (!isChatMessageNotification(d.data())) others++;
      });

      setUnreadCount(others);

      if (!initialLoad.current) {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (isChatMessageNotification(data) && data.link !== locationPathRef.current) {
              showToast(data.title + ': ' + data.message, 'info');
            }
          }
        });
      }
      initialLoad.current = false;
    });
    return () => unsubscribe();
  }, [user, showToast]);

  const navLinks = [
    { name: 'Home', path: '/', icon: Home },
    { name: 'Search', path: '/search', icon: Search },
    { name: 'Sell', path: '/sell', icon: PlusCircle },
    { name: 'Messages', path: '/messages', icon: MessageSquare },
    { name: 'Notifications', path: '/notifications', icon: Bell },
    { name: 'Profile', path: user ? (userData?.username ? `/u/${userData.username}` : `/profile/${user.uid}`) : '/login', icon: User },
    ...(userData?.isAdmin ? [{ name: 'Admin', path: '/admin', icon: ShieldCheck }] : []),
  ];

  return (
    <div className="h-screen sticky top-0 flex flex-col pt-8 pb-6 px-3 xl:px-5" style={{ background: 'var(--color-surface-card)' }}>
      {/* Logo */}
      <Link to="/" className="flex items-center gap-3 mb-8 px-3 group w-fit">
        <img src="/logo.png" alt="Nextbench Logo" className="h-8 w-auto transition-transform group-hover:scale-105 duration-200" />
        <span className="text-xl font-bold tracking-tight text-luxury-ink hidden xl:block">nextbench</span>
      </Link>

      {/* Navigation Links */}
      <div className="flex-1 flex flex-col gap-0.5 w-full">
        {navLinks.map((link) => {
          const isActive = location.pathname === link.path;
          const Icon = link.icon;
          return (
            <Link
              key={link.name}
              to={link.path}
              className={`group flex items-center gap-4 px-4 py-3 xl:py-3.5 rounded-xl transition-all duration-200 relative w-full ${
                isActive 
                  ? 'bg-surface-soft text-luxury-ink' 
                  : 'text-luxury-ink/50 hover:bg-surface-soft/50 hover:text-luxury-ink/80'
              }`}
            >
              <div className="relative flex items-center justify-center">
                <Icon size={22} className={`transition-all duration-200 ${isActive ? 'stroke-[2.5px]' : 'stroke-[1.5px] group-hover:stroke-[2px]'}`} />
                {link.name === 'Messages' && unreadMsgCount > 0 && (
                  <div className="absolute -top-1 -right-1.5 w-4 h-4 bg-brand-pink text-white rounded-full text-[9px] font-bold flex items-center justify-center border-2" style={{ borderColor: 'var(--color-surface-card)' }}>
                    {unreadMsgCount > 9 ? '9+' : unreadMsgCount}
                  </div>
                )}
                {link.name === 'Notifications' && unreadCount > 0 && (
                  <div className="absolute -top-1 -right-1.5 w-4 h-4 bg-brand-pink text-white rounded-full text-[9px] font-bold flex items-center justify-center border-2" style={{ borderColor: 'var(--color-surface-card)' }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </div>
                )}
              </div>
              <span className={`hidden xl:block text-[15px] tracking-tight ${isActive ? 'font-bold' : 'font-medium'}`}>{link.name}</span>
            </Link>
          );
        })}
      </div>

      {/* Profile & Logout */}
      <div className="mt-auto pt-4">
        {user ? (
          <div className="flex flex-col gap-1">
            <Link 
              to={userData?.username ? `/u/${userData.username}` : `/profile/${user.uid}`}
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-soft transition-colors group"
            >
              <div className="w-10 h-10 rounded-full bg-surface-soft flex items-center justify-center overflow-hidden shrink-0">
                {userData?.profilePicture ? (
                  <img src={getOptimizedImageUrl(userData.profilePicture)} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <span className="text-brand-teal font-semibold text-sm">
                    {(userData?.name || user.email || 'U')[0].toUpperCase()}
                  </span>
                )}
              </div>
              <div className="hidden xl:block flex-1 min-w-0">
                <p className="text-sm font-semibold text-luxury-ink truncate">{userData?.name || 'User'}</p>
                {userData?.username ? (
                  <p className="text-xs text-luxury-ink/40 truncate">@{userData.username}</p>
                ) : (
                  <p className="text-xs text-luxury-ink/30 truncate">{userData?.school || 'Student'}</p>
                )}
              </div>
            </Link>

            <button 
              onClick={handleSignOut}
              className="flex items-center justify-center xl:justify-start gap-3 w-full p-3 rounded-xl text-luxury-ink/40 hover:bg-surface-soft hover:text-red-500 transition-all group"
            >
              <LogOut size={18} className="group-hover:scale-105 transition-transform" />
              <span className="hidden xl:block text-sm font-medium">Log out</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 px-1">
            <Link to="/login" className="w-full text-center py-3 bg-brand-teal text-white rounded-xl font-semibold text-sm hover:bg-brand-teal/90 transition-all">
              Log In
            </Link>
            <Link to="/signup" className="w-full text-center py-3 bg-luxury-ink text-surface-base rounded-xl font-semibold text-sm hover:bg-luxury-ink/90 transition-all" style={{ color: 'var(--color-surface-base)' }}>
              Sign Up
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
