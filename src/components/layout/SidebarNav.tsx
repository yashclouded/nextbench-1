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

export default function SidebarNav() {
  const { user, userData } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut(auth);
    navigate('/');
  };

  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const { showToast } = useToast();
  const initialLoad = useRef(true);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'notifications'), where('userId', '==', user.uid), where('read', '==', false));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let msgs = 0;
      let others = 0;
      
      snapshot.docs.forEach(d => {
        if (d.data().type === 'new_message') msgs++;
        else others++;
      });

      setUnreadCount(others);
      setUnreadMsgCount(msgs);

      if (!initialLoad.current) {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (data.type === 'new_message') {
              showToast(data.title + ': ' + data.message, 'info');
            }
          }
        });
      }
      initialLoad.current = false;
    });
    return () => unsubscribe();
  }, [user]);

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
    <div className="h-screen sticky top-0 flex flex-col pt-8 pb-6 px-4 md:px-5 xl:px-6 border-r" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-card)' }}>
      {/* Logo */}
      <Link to="/" className="flex items-center gap-3 mb-10 px-3 group w-fit">
        <img src="/logo.png" alt="Nextbench Logo" className="h-9 w-auto transition-all group-hover:scale-110 group-hover:-rotate-3 duration-300 drop-shadow-sm group-hover:drop-shadow-md" />
        <span className="text-2xl font-black tracking-tighter text-luxury-ink hidden xl:block group-hover:text-brand-teal transition-colors duration-300">nextbench</span>
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
              className={`group flex items-center gap-4 px-4 py-3.5 xl:px-5 xl:py-4 rounded-2xl transition-all duration-300 relative w-full overflow-hidden ${
                isActive 
                  ? 'bg-luxury-ink text-surface-base shadow-lg shadow-luxury-ink/10 scale-[1.02]' 
                  : 'text-luxury-ink/50 hover:bg-surface-soft hover:text-luxury-ink'
              }`}
            >
              {isActive && (
                <div className="absolute inset-0 bg-gradient-to-r from-luxury-ink via-luxury-ink to-luxury-ink/90" />
              )}
              <div className="relative flex items-center justify-center z-10">
                <Icon size={24} className={`transition-transform duration-300 group-hover:scale-110 ${isActive ? 'stroke-[2.5px] text-surface-base' : 'stroke-[2px]'}`} />
                {!isActive && link.name === 'Messages' && unreadMsgCount > 0 && (
                  <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-brand-pink text-white rounded-full text-[9px] font-bold flex items-center justify-center border-2 shadow-sm animate-pulse" style={{ borderColor: 'var(--color-surface-card)' }}>
                    {unreadMsgCount > 9 ? '9+' : unreadMsgCount}
                  </div>
                )}
                {!isActive && link.name === 'Notifications' && unreadCount > 0 && (
                  <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-brand-pink text-white rounded-full text-[9px] font-bold flex items-center justify-center border-2 shadow-sm animate-pulse" style={{ borderColor: 'var(--color-surface-card)' }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </div>
                )}
              </div>
              <span className={`hidden xl:block text-[16px] tracking-tight z-10 ${isActive ? 'font-bold text-surface-base' : 'font-semibold'}`}>{link.name}</span>
            </Link>
          );
        })}
      </div>

      {/* Profile & Logout */}
      <div className="mt-auto pt-4">
        {user ? (
          <div className="p-1.5 rounded-3xl border bg-surface-base/80 backdrop-blur-md shadow-sm transition-all hover:shadow-md" style={{ borderColor: 'var(--color-border)' }}>
            <Link 
              to={userData?.username ? `/u/${userData.username}` : `/profile/${user.uid}`}
              className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-surface-soft transition-colors group relative overflow-hidden"
            >
              <div className="w-11 h-11 rounded-full bg-brand-teal/10 flex items-center justify-center overflow-hidden shrink-0 border border-brand-teal/20 group-hover:border-brand-teal/40 transition-colors">
                {userData?.profilePicture ? (
                  <img src={getOptimizedImageUrl(userData.profilePicture)} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <span className="text-brand-teal font-black text-sm">
                    {(userData?.name || user.email || 'U')[0].toUpperCase()}
                  </span>
                )}
              </div>
              <div className="hidden xl:block flex-1 min-w-0 pr-2">
                <p className="text-sm font-bold text-luxury-ink truncate group-hover:text-brand-teal transition-colors">{userData?.name || 'User'}</p>
                {userData?.username ? (
                  <p className="text-[11px] font-medium text-luxury-ink/40 truncate">@{userData.username}</p>
                ) : (
                  <p className="text-[9px] uppercase tracking-widest font-bold text-luxury-ink/30 truncate">{userData?.school || 'Student'}</p>
                )}
              </div>
            </Link>
            
            <div className="px-3 py-1">
              <div className="h-px w-full bg-luxury-ink/5" />
            </div>

            <button 
              onClick={handleSignOut}
              className="flex items-center justify-center xl:justify-start gap-3 w-full p-3 rounded-2xl text-luxury-ink/40 hover:bg-red-50 hover:text-red-500 transition-all font-bold group"
            >
              <LogOut size={20} className="stroke-[2px] group-hover:scale-110 transition-transform" />
              <span className="hidden xl:block text-sm">Log out</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 px-2 xl:px-2">
            <Link to="/login" className="w-full text-center py-3.5 bg-brand-teal text-white rounded-2xl font-bold hover:bg-brand-teal/90 transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5">
              Log In
            </Link>
            <Link to="/signup" className="w-full text-center py-3.5 bg-luxury-ink text-surface-base rounded-2xl font-bold hover:bg-luxury-ink/90 transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5" style={{ color: 'var(--color-surface-base)' }}>
              Sign Up
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
