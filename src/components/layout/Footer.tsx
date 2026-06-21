import { Link, useNavigate } from 'react-router-dom';
import { GraduationCap, ShieldCheck, ArrowRight, Heart, ShoppingBag, BookOpen, MessageCircle, Mail, Instagram } from 'lucide-react';

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const navigate = useNavigate();

  return (
    <footer className="border-t" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface-base)' }}>
      {/* Main footer content */}
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-16 md:py-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-16">
          {/* Brand Column */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link to="/" className="inline-flex items-center gap-2.5 mb-5 group">
              <img src="/logo.png" alt="Nextbench Logo" className="h-7 w-auto transition-transform group-hover:scale-105" />
              <span className="text-lg font-semibold tracking-tight" style={{ color: 'var(--color-luxury-ink)' }}>nextbench</span>
            </Link>
            <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--color-luxury-ink-muted)' }}>
              The verified student marketplace. Buy and sell textbooks, notes, electronics, and more — safely within your own campus community.
            </p>
            <div className="flex items-center gap-3">
              <a
                href="https://www.instagram.com/nextbench_/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-300"
                style={{
                  backgroundColor: 'var(--color-surface-soft)',
                  color: 'var(--color-luxury-ink-muted)',
                  border: '1px solid var(--color-border)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-brand-pink)'; e.currentTarget.style.color = '#FFFFFF'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-surface-soft)'; e.currentTarget.style.color = 'var(--color-luxury-ink-muted)'; }}
              >
                <Instagram size={14} /> Instagram
              </a>
              <a
                href="mailto:nextbench@loreto.edu"
                className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-300"
                style={{
                  backgroundColor: 'var(--color-surface-soft)',
                  color: 'var(--color-luxury-ink-muted)',
                  border: '1px solid var(--color-border)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-brand-teal)'; e.currentTarget.style.color = '#FFFFFF'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-surface-soft)'; e.currentTarget.style.color = 'var(--color-luxury-ink-muted)'; }}
              >
                <Mail size={14} /> Contact
              </a>
            </div>
          </div>

          {/* Marketplace Column */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] mb-6" style={{ color: 'var(--color-brand-teal)' }}>
              Marketplace
            </h4>
            <ul className="space-y-3.5">
              {[
                { label: 'Browse Listings', path: '/dashboard' },
                { label: 'Sell an Item', path: '/sell' },
                { label: 'Community Feed', path: '/community' },
                { label: 'Wishlist', path: '/wishlist' },
              ].map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.path}
                    className="text-sm font-medium transition-colors duration-200 inline-flex items-center gap-1.5 group"
                    style={{ color: 'var(--color-luxury-ink-muted)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-brand-pink)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-luxury-ink-muted)'}
                  >
                    <ArrowRight size={10} className="opacity-0 -ml-3 group-hover:opacity-100 group-hover:ml-0 transition-all duration-200" />
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources Column */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] mb-6" style={{ color: 'var(--color-brand-teal)' }}>
              Resources
            </h4>
            <ul className="space-y-3.5">
              {[
                { label: 'How it Works', path: '#features', hash: true },
                { label: 'Verification', path: '/verification' },
                { label: 'Graduation Mode', path: '/signup?mode=graduation' },
                { label: 'Careers', path: '/careers' },
              ].map((link) => (
                <li key={link.label}>
                  {link.hash ? (
                    <a
                      href={link.path}
                      onClick={(e) => {
                        e.preventDefault();
                        const el = document.querySelector(link.path);
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                        else navigate('/');
                      }}
                      className="text-sm font-medium transition-colors duration-200 inline-flex items-center gap-1.5 group"
                      style={{ color: 'var(--color-luxury-ink-muted)' }}
                      onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-brand-pink)'}
                      onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-luxury-ink-muted)'}
                    >
                      <ArrowRight size={10} className="opacity-0 -ml-3 group-hover:opacity-100 group-hover:ml-0 transition-all duration-200" />
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      to={link.path}
                      className="text-sm font-medium transition-colors duration-200 inline-flex items-center gap-1.5 group"
                      style={{ color: 'var(--color-luxury-ink-muted)' }}
                      onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-brand-pink)'}
                      onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-luxury-ink-muted)'}
                    >
                      <ArrowRight size={10} className="opacity-0 -ml-3 group-hover:opacity-100 group-hover:ml-0 transition-all duration-200" />
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Legal & Trust Column */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] mb-6" style={{ color: 'var(--color-brand-teal)' }}>
              Legal & Trust
            </h4>
            <ul className="space-y-3.5">
              {[
                { label: 'Terms of Service', path: '/terms' },
                { label: 'Privacy Policy', path: '/privacy' },
                { label: 'Your Consent', path: '/privacy#consent' },
                { label: 'Admin Portal', path: '/admin' },
              ].map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.path}
                    className="text-sm font-medium transition-colors duration-200 inline-flex items-center gap-1.5 group"
                    style={{ color: 'var(--color-luxury-ink-muted)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-brand-pink)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-luxury-ink-muted)'}
                  >
                    <ArrowRight size={10} className="opacity-0 -ml-3 group-hover:opacity-100 group-hover:ml-0 transition-all duration-200" />
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>

            {/* Trust badge */}
            <div className="mt-8 p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface-soft)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck size={14} style={{ color: 'var(--color-brand-mint)' }} />
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-brand-mint)' }}>
                  Verified Only
                </span>
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-luxury-ink-muted)' }}>
                Every student is ID-verified. No outsiders, no scams.
              </p>
            </div>
          </div>
        </div>

        {/* Graduation Mode CTA */}
        <div className="mt-12 pt-10" style={{ borderTop: '1px solid var(--color-border)' }}>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-xl" style={{ backgroundColor: 'rgba(255,55,95,0.04)', border: '1px solid rgba(255,55,95,0.08)' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(255,55,95,0.1)' }}>
                <GraduationCap size={18} style={{ color: 'var(--color-brand-pink)' }} />
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--color-luxury-ink)' }}>Graduating this year?</p>
                <p className="text-xs" style={{ color: 'var(--color-luxury-ink-muted)' }}>Pass down your textbooks and gear to the next class.</p>
              </div>
            </div>
            <Link
              to="/signup?mode=graduation"
              className="flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold tracking-wide transition-all duration-300 whitespace-nowrap"
              style={{ backgroundColor: 'var(--color-brand-pink)', color: '#FFFFFF' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-brand-teal)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-brand-pink)'}
            >
              <GraduationCap size={14} />
              Activate Graduation Mode
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ borderTop: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface-soft)' }}>
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-luxury-ink-muted)' }}>
            &copy; {currentYear} Nextbench. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link to="/privacy" className="text-[10px] font-bold uppercase tracking-widest transition-colors" style={{ color: 'var(--color-luxury-ink-muted)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-brand-pink)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-luxury-ink-muted)'}
            >
              Privacy
            </Link>
            <Link to="/terms" className="text-[10px] font-bold uppercase tracking-widest transition-colors" style={{ color: 'var(--color-luxury-ink-muted)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-brand-pink)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-luxury-ink-muted)'}
            >
              Terms
            </Link>
            <Link to="/careers" className="text-[10px] font-bold uppercase tracking-widest transition-colors" style={{ color: 'var(--color-luxury-ink-muted)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-brand-pink)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-luxury-ink-muted)'}
            >
              Careers
            </Link>
            <Link to="mailto:nextbench@loreto.edu" className="text-[10px] font-bold uppercase tracking-widest transition-colors" style={{ color: 'var(--color-luxury-ink-muted)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-brand-pink)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-luxury-ink-muted)'}
            >
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
