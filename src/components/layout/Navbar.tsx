import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ShoppingBag, User, Menu, X, ShieldCheck, Heart, MessageSquare } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { auth } from '../../lib/firebase';
import { signOut } from 'firebase/auth';
import NotificationBell from '../ui/NotificationBell';

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const isLandingPage = location.pathname === '/';
  const { user, userData } = useAuth();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSignOut = async () => {
    await signOut(auth);
    navigate('/');
  };

  const navLinks: { name: string; path: string; isHash?: boolean }[] = [
    { name: 'Marketplace', path: '/marketplace' },
    { name: 'Community', path: '/community' },
  ];

  if (!user) {
    navLinks.push(
      { name: 'How it Works', path: '#how-it-works', isHash: true },
      { name: 'Trust', path: '#trust', isHash: true }
    );
  }

  return (
    <nav 
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled || !isLandingPage ? 'nav-glass py-4 border-b border-brand-teal/10 shadow-sm' : 'bg-transparent py-8'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <img src="/logo.png" alt="Nextbench Logo" className="h-8 w-auto transition-transform group-hover:scale-105" />
          <span className="text-lg font-medium tracking-tight text-luxury-ink">nextbench</span>
        </Link>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-10">
          {navLinks.map((link) => (
            link.isHash ? (
              <a
                key={link.name}
                href={link.path}
                onClick={(e) => {
                  if (isLandingPage) {
                    e.preventDefault();
                    const el = document.querySelector(link.path);
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  } else {
                    navigate('/' + link.path);
                  }
                }}
                className="text-[13px] font-semibold uppercase tracking-widest transition-colors text-brand-teal/70 hover:text-brand-pink"
              >
                {link.name}
              </a>
            ) : (
              <Link 
                key={link.name} 
                to={link.path}
                className={`text-[13px] font-semibold uppercase tracking-widest transition-colors ${
                  location.pathname === link.path 
                    ? 'text-brand-pink' 
                    : 'text-brand-teal/70 hover:text-brand-pink'
                }`}
              >
                {link.name}
              </Link>
            )
          ))}
          {user && (
            <>
              <Link 
                to="/messages"
                className={`text-[13px] font-semibold uppercase tracking-widest transition-colors ${
                  location.pathname === '/messages' ? 'text-brand-pink' : 'text-brand-teal/70 hover:text-brand-pink'
                }`}
              >
                Messages
              </Link>
              <Link 
                to="/sell"
                className={`text-[13px] font-semibold uppercase tracking-widest transition-colors ${
                  location.pathname === '/sell' ? 'text-brand-pink' : 'text-brand-teal/70 hover:text-brand-pink'
                }`}
              >
                Sell Item
              </Link>
            </>
          )}
        </div>

        <div className="hidden md:flex items-center gap-4">
          {!user ? (
            <>
              <Link to="/login" className="text-[13px] font-bold uppercase tracking-widest text-brand-teal/80 hover:text-brand-pink transition-colors">
                Log In
              </Link>
              <Link 
                to="/signup" 
                className="bg-brand-pink text-white px-8 py-3 rounded-sm text-[13px] font-bold uppercase tracking-widest hover:bg-brand-teal transition-all luxury-shadow active:scale-95"
              >
                Sign Up
              </Link>
            </>
          ) : (
            <>
              <Link to="/wishlist" className="p-2 rounded-xl hover:bg-surface-soft transition-all group" title="Wishlist">
                <Heart size={20} className={`transition-colors ${location.pathname === '/wishlist' ? 'text-brand-pink fill-brand-pink' : 'text-brand-teal/50 group-hover:text-brand-pink'}`} />
              </Link>
              <NotificationBell />
              {!userData?.verified && (
                <Link
                  to="/verification"
                  className="bg-brand-pink text-white px-5 py-2.5 rounded-sm text-[11px] font-bold uppercase tracking-widest hover:bg-brand-teal transition-all shadow shadow-brand-pink/10 flex items-center gap-1.5"
                >
                  <ShieldCheck size={13} /> Become Verified
                </Link>
              )}
              <Link to="/profile" className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand-teal/50 hover:text-brand-pink transition-colors">
                {userData?.verified && <ShieldCheck size={16} className="text-brand-mint"  />}
                <span className="max-w-30 truncate">{userData?.name || user.email}</span>
              </Link>
              <button 
                onClick={handleSignOut}
                className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/30 hover:text-red-400 transition-colors ml-2"
              >
                Sign Out
              </button>
            </>
          )}
        </div>

        {/* Mobile Toggle */}
        <button 
          className="md:hidden text-luxury-ink"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden absolute top-full left-0 right-0 theme-card border-t border-luxury-ink/5 p-6 luxury-shadow"
        >
          <div className="flex flex-col gap-6">
            {navLinks.map((link) => (
              link.isHash ? (
                <a
                  key={link.name}
                  href={link.path}
                  onClick={(e) => {
                    setIsMobileMenuOpen(false);
                    if (isLandingPage) {
                      e.preventDefault();
                      const el = document.querySelector(link.path);
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    } else {
                      navigate('/' + link.path);
                    }
                  }}
                  className="text-lg font-medium text-luxury-ink"
                >
                  {link.name}
                </a>
              ) : (
                <Link 
                  key={link.name} 
                  to={link.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-lg font-medium text-luxury-ink"
                >
                  {link.name}
                </Link>
              )
            ))}
            {user && (
              <>
                <Link 
                  to="/messages"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-lg font-medium text-luxury-ink flex items-center gap-2"
                >
                  <MessageSquare size={18} /> Messages
                </Link>
                <Link 
                  to="/wishlist"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-lg font-medium text-luxury-ink flex items-center gap-2"
                >
                  <Heart size={18} /> Wishlist
                </Link>
                <Link 
                  to="/notifications"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-lg font-medium text-luxury-ink flex items-center gap-2"
                >
                  Notifications
                </Link>
                <Link 
                  to="/sell"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-lg font-medium text-luxury-ink"
                >
                  Sell Item
                </Link>
              </>
            )}
            <div className="flex flex-col gap-4 pt-4 border-t border-luxury-ink/10">
              {!user ? (
                <>
                  <Link 
                    to="/login" 
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="text-lg font-medium text-luxury-ink"
                  >
                    Login
                  </Link>
                  <Link 
                    to="/signup" 
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="bg-brand-pink text-white px-6 py-3 rounded-xl text-center font-medium"
                  >
                    Sign Up
                  </Link>
                </>
              ) : (
                <>
                  <Link 
                    to="/profile" 
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="text-lg font-medium text-luxury-ink"
                  >
                    My Profile
                  </Link>
                  {!userData?.verified && (
                    <Link 
                      to="/verification" 
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="bg-brand-pink text-white px-6 py-3 rounded-xl text-center font-bold text-sm flex items-center gap-2 justify-center"
                    >
                      <ShieldCheck size={16} /> Become Verified
                    </Link>
                  )}
                  {userData?.isAdmin && (
                    <Link 
                      to="/admin" 
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="text-lg font-medium text-brand-teal flex items-center gap-2"
                    >
                      <ShieldCheck size={18} /> Admin Panel
                    </Link>
                  )}
                  <button 
                    onClick={() => { handleSignOut(); setIsMobileMenuOpen(false); }}
                    className="text-lg font-bold text-red-500 text-left"
                  >
                    Sign Out
                  </button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </nav>
  );
}
