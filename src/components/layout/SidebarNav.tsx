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

  const [isWideScreen, setIsWideScreen] = useState(() => window.innerWidth >= 1280);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsWideScreen(window.innerWidth >= 1280);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMessagesOrClub = location.pathname.startsWith('/messages') || location.pathname.startsWith('/club');
  const isExpanded = (isWideScreen && !isMessagesOrClub) || isHovered;

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
    }, (err) => {
      console.warn('SidebarNav: notifications listener error (ignored):', err);
    });
    return () => unsubscribe();
  }, [user?.uid, showToast]);

  const allNavLinks = [
    { name: 'Home', path: '/community', icon: Home },
    { name: 'Search', path: '/search', icon: Search },
    { name: 'Sell', path: '/sell', icon: PlusCircle },
    { name: 'Messages', path: '/messages', icon: MessageSquare },
    { name: 'Notifications', path: '/notifications', icon: Bell },
    { name: 'Profile', path: user ? (userData?.username ? `/u/${userData.username}` : `/profile/${user.uid}`) : '/login', icon: User },
    ...(userData?.isAdmin ? [{ name: 'Admin', path: '/admin', icon: ShieldCheck }] : []),
  ];

  const navLinks = user 
    ? allNavLinks 
    : allNavLinks.filter(link => ['Home', 'Search'].includes(link.name));

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`h-screen sticky top-0 flex flex-col pt-8 pb-6 transition-all duration-300 ease-in-out z-40 ${
        isExpanded ? 'w-[240px] px-4 xl:px-5' : 'w-[72px] px-3 items-center'
      } ${
        !isWideScreen && isHovered ? 'shadow-[10px_0_30px_rgba(0,0,0,0.15)] border-r border-luxury-ink/5' : ''
      }`}
      style={{ background: 'var(--color-surface-card)' }}
    >
      {/* Logo */}
      <Link to="/" className={`flex items-center gap-3 mb-8 group w-fit ${
        isExpanded ? 'px-3' : 'justify-center px-0'
      }`}>
        <img src="/logo.png" alt="Nextbench Logo" className="h-8 w-auto transition-transform group-hover:scale-105 duration-200" />
        <span className={`text-xl font-bold tracking-tight text-luxury-ink transition-all duration-300 overflow-hidden whitespace-nowrap ${
          isExpanded ? 'opacity-100 max-w-[150px] ml-3' : 'opacity-0 max-w-0 ml-0'
        }`}>nextbench</span>
      </Link>

      {/* Navigation Links */}
      <div className="flex-1 flex flex-col gap-1.5 w-full">
        {navLinks.map((link) => {
          const isActive = location.pathname === link.path;
          const Icon = link.icon;
          return (
            <Link
              key={link.name}
              to={link.path}
              title={!isExpanded ? link.name : undefined}
              className={`group flex items-center rounded-xl transition-all duration-200 ease-out relative w-full ${
                isActive 
                  ? 'bg-surface-soft/60 text-luxury-ink' 
                  : 'text-luxury-ink/50 hover:bg-surface-soft/40 hover:text-luxury-ink/80'
              } ${isExpanded ? 'px-3.5 py-2.5 xl:py-3 gap-4' : 'justify-center p-2.5'}`}
            >
              <div className="relative flex items-center justify-center">
                <Icon size={20} className={`transition-all duration-200 ${isActive ? 'stroke-[2.5px]' : 'stroke-[1.5px] group-hover:stroke-[2px]'}`} />
                {link.name === 'Messages' && unreadMsgCount > 0 && (
                  <div className={`absolute w-4 h-4 bg-brand-pink text-white rounded-full text-[9px] font-bold flex items-center justify-center border-2 ${
                    !isExpanded ? '-top-2.5 -right-2.5' : '-top-1 -right-1.5'
                  }`} style={{ borderColor: 'var(--color-surface-card)' }}>
                    {unreadMsgCount > 9 ? '9+' : unreadMsgCount}
                  </div>
                )}
                {link.name === 'Notifications' && unreadCount > 0 && (
                  <div className={`absolute w-4 h-4 bg-brand-pink text-white rounded-full text-[9px] font-bold flex items-center justify-center border-2 ${
                    !isExpanded ? '-top-2.5 -right-2.5' : '-top-1 -right-1.5'
                  }`} style={{ borderColor: 'var(--color-surface-card)' }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </div>
                )}
              </div>
              <span className={`text-[15px] tracking-normal transition-all duration-300 overflow-hidden whitespace-nowrap ${
                isExpanded ? 'opacity-100 max-w-[150px]' : 'opacity-0 max-w-0'
              } ${isActive ? 'font-semibold' : 'font-medium'}`}>
                {link.name}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Profile & Logout */}
      <div className="mt-auto pt-4 w-full">
        {user ? (
          <div className="flex flex-col gap-1 w-full">
            <Link 
              to={userData?.username ? `/u/${userData.username}` : `/profile/${user.uid}`}
              title={!isExpanded ? (userData?.name || 'Profile') : undefined}
              className={`flex items-center rounded-xl hover:bg-surface-soft transition-colors group ${
                isExpanded ? 'gap-3 p-3' : 'justify-center p-1.5'
              }`}
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
              <div className={`flex-1 min-w-0 transition-all duration-300 overflow-hidden whitespace-nowrap ${
                isExpanded ? 'opacity-100 max-w-[150px] ml-3' : 'opacity-0 max-w-0 ml-0'
              }`}>
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
              title={!isExpanded ? "Log out" : undefined}
              className={`flex items-center rounded-xl text-luxury-ink/40 hover:bg-surface-soft hover:text-red-500 transition-all group w-full ${
                isExpanded ? 'p-3 gap-3' : 'justify-center p-3'
              }`}
            >
              <LogOut size={18} className="group-hover:scale-105 transition-transform" />
              <span className={`text-sm font-medium transition-all duration-300 overflow-hidden whitespace-nowrap ${
                isExpanded ? 'opacity-100 max-w-[150px]' : 'opacity-0 max-w-0'
              }`}>Log out</span>
            </button>
          </div>
        ) : (
          <div className={`flex flex-col gap-2 ${isExpanded ? 'px-1' : 'px-0 items-center'}`}>
            <Link to="/login" className={`w-full text-center py-3 bg-brand-teal text-white rounded-xl font-semibold text-sm hover:bg-brand-teal/90 transition-all ${isExpanded ? '' : 'text-xs px-1'}`}>
              {isExpanded ? 'Log In' : 'Login'}
            </Link>
            <Link to="/signup" className={`w-full text-center py-3 bg-luxury-ink text-surface-base rounded-xl font-semibold text-sm hover:bg-luxury-ink/90 transition-all ${isExpanded ? '' : 'text-xs px-1'}`} style={{ color: 'var(--color-surface-base)' }}>
              {isExpanded ? 'Sign Up' : 'Signup'}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
