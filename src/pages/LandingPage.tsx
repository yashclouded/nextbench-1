import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Check, Shield, GraduationCap, Sparkles, BookOpen, Store, MessageCircle, Heart, Star, Search, ShoppingBag, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import SEO from '../components/seo/SEO';
import { fetchSchools, fetchRecentProducts, fetchLandingStats, fetchLandingUsers, fetchVerifiedUserCount, warmLandingCache, type LandingStats, type RealProduct, type RealUser } from '../lib/landingData';

/* ── Constants ──────────────────────────────────── */

const WORDS = ['Find', 'Connect', 'Save'];
const WORD_INTERVAL = 2200;

const TRANSITION = { duration: 0.8, ease: [0.22, 1, 0.36, 1] as const };
const STAGGER = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.12 } },
};

const item = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: TRANSITION },
};

const AVATAR_PALETTE = ['#FF6B6B', '#4ECDC4', '#FFD93D', '#6C5CE7', '#FF8A5C', '#45B7D1', '#F9A826', '#A29BFE', '#FD79A8', '#00CEC9'];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

/* ── Avatars (from real user data) ───────────────── */

function AvatarCircle({ user, index, total }: { user: RealUser; index: number; total: number }) {
  const color = getAvatarColor(user.name);
  const initial = user.name.charAt(0).toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...TRANSITION, delay: 0.1 + index * 0.06 }}
      className="relative -ml-2 first:ml-0"
      style={{ zIndex: total - index }}
    >
      <div
        className="w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center text-white font-bold text-sm border-[3px] shadow-lg overflow-hidden"
        style={{ backgroundColor: color, borderColor: 'var(--color-surface-base)' }}
        title={user.name}
      >
        {user.profilePicture ? (
          <img
            src={user.profilePicture}
            alt={user.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          initial
        )}
      </div>
    </motion.div>
  );
}

/* ── Animated Word Swap ──────────────────────────── */

function AnimatedWord() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % WORDS.length), WORD_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="relative inline-flex items-center px-5 py-2 rounded-full text-sm md:text-base font-semibold tracking-wide"
      style={{ backgroundColor: 'rgba(0, 113, 227, 0.08)', color: 'var(--color-brand-teal)' }}
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={WORDS[index]}
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -12, opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
          className="inline-block"
        >
          {WORDS[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ── Floating decorative elements ────────────────── */

function FloatingOrbs() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-[0.03]" style={{ backgroundColor: 'var(--color-brand-pink)' }} />
      <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full opacity-[0.02]" style={{ backgroundColor: 'var(--color-brand-teal)' }} />
      <div className="absolute top-1/3 -left-16 w-40 h-40 rounded-full opacity-[0.015]" style={{ backgroundColor: 'var(--color-brand-pink)' }} />
    </div>
  );
}

/* ── Product Mockup (real products from Firestore) ── */

function ProductMockup({ products }: { products: RealProduct[] }) {
  const display = products.slice(0, 6);
  const categories = ['All', ...new Set(products.map(p => p.category))].slice(0, 5);
  const colors = ['#E8F4FD', '#FCE8EF', '#FFF4E6', '#E8F8F0', '#F0E8FF', '#FFF0E8'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...TRANSITION, delay: 0.6 }}
      className="relative mx-auto max-w-4xl mt-16 md:mt-20"
    >
      <div className="rounded-t-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface-soft)' }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#FF5F57' }} />
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#FEBC2E' }} />
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#28C840' }} />
          <div className="flex-1 flex justify-center">
            <div className="text-[11px] px-3 py-1 rounded-md" style={{ backgroundColor: 'var(--color-surface-soft)', color: 'var(--color-luxury-ink-muted)' }}>
              nextbench.in / marketplace
            </div>
          </div>
        </div>
        <div className="p-6" style={{ backgroundColor: 'var(--color-surface-card)' }}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md" style={{ backgroundColor: 'var(--color-brand-teal)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--color-luxury-ink)' }}>nextbench</span>
            </div>
            <div className="flex items-center gap-3">
              <Search size={16} style={{ color: 'var(--color-luxury-ink-muted)' }} />
              <motion.div
                whileHover={{ scale: 1.04 }}
                className="text-xs px-3 py-1.5 rounded-full font-semibold cursor-default"
                style={{ backgroundColor: 'var(--color-brand-pink)', color: '#FFFFFF' }}
              >
                Sell
              </motion.div>
            </div>
          </div>
          <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar">
            {categories.map((cat, ci) => (
              <motion.span
                key={cat}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 + ci * 0.05 }}
                className="text-xs px-3 py-1.5 rounded-full font-medium whitespace-nowrap"
                style={{ backgroundColor: cat === 'All' ? 'var(--color-surface-soft)' : 'var(--color-surface-base)', color: 'var(--color-luxury-ink-muted)' }}
              >
                {cat}
              </motion.span>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {display.map((product, i) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 + i * 0.08 }}
                className="group p-3 rounded-lg border cursor-default transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface-soft)' }}
                whileHover={{ borderColor: 'rgba(0,113,227,0.25)' }}
              >
                <div className="w-full aspect-4/3 rounded-md mb-2 flex items-center justify-center overflow-hidden relative"
                  style={{ backgroundColor: colors[i % colors.length] }}
                >
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <motion.div
                      whileHover={{ scale: 1.08, opacity: 0.5 }}
                      transition={{ duration: 0.3 }}
                    >
                      <ShoppingBag size={28} style={{ color: i % 2 === 0 ? 'var(--color-brand-teal)' : 'var(--color-brand-pink)', opacity: 0.25 }} />
                    </motion.div>
                  )}
                </div>
                <p className="text-xs font-semibold truncate" style={{ color: 'var(--color-luxury-ink)' }} title={product.title}>{product.title}</p>
                <div className="flex items-center justify-between mt-1">
                  <motion.span
                    className="text-xs font-bold inline-block"
                    style={{ color: 'var(--color-brand-teal)' }}
                    whileHover={{ y: -1, color: '#FF375F' }}
                  >
                    ₹{product.price}
                  </motion.span>
                  <span className="text-[10px]" style={{ color: 'var(--color-luxury-ink-muted)' }}>{product.condition}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
      <div className="absolute -inset-x-4 bottom-0 h-16 bg-linear-to-t pointer-events-none" style={{ background: `linear-gradient(to top, var(--color-surface-base), var(--color-surface-base)/80, transparent)` }} />
      <div className="absolute -inset-x-8 -bottom-8 h-24 opacity-20 blur-3xl rounded-full pointer-events-none" style={{ backgroundColor: 'var(--color-brand-teal)' }} />
    </motion.div>
  );
}

/* ── Social Proof Strip (real schools — auto-scrolling marquee) ── */

function SocialProofStrip({ schools }: { schools: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollX, setScrollX] = useState(0);
  const speedRef = useRef(0.6);
  const rafRef = useRef<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const display = [...schools, ...schools, ...schools];
  const halfWidth = display.length * 140;

  useEffect(() => {
    const animate = () => {
      if (!isPaused) {
        setScrollX(prev => {
          const next = prev - speedRef.current;
          return next <= -halfWidth ? 0 : next;
        });
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPaused, halfWidth]);

  return (
    <section className="py-20 md:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.15em] mb-10" style={{ color: 'var(--color-luxury-ink-muted)' }}>
          Trusted by students at {schools.length} schools
        </p>
        <div
          className="relative overflow-hidden"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div
            ref={containerRef}
            className="flex gap-12 md:gap-16"
            style={{ transform: `translateX(${scrollX}px)`, whiteSpace: 'nowrap', willChange: 'transform' }}
          >
            {display.map((school, i) => (
              <div
                key={i}
                className="shrink-0 text-sm font-semibold tracking-tight whitespace-nowrap opacity-40 hover:opacity-60 transition-opacity cursor-default"
                style={{ color: 'var(--color-luxury-ink-muted)' }}
              >
                {school}
              </div>
            ))}
          </div>
          <div className="absolute inset-y-0 left-0 w-16 pointer-events-none z-10" style={{ background: `linear-gradient(to right, var(--color-surface-base), transparent)` }} />
          <div className="absolute inset-y-0 right-0 w-16 pointer-events-none z-10" style={{ background: `linear-gradient(to left, var(--color-surface-base), transparent)` }} />
        </div>
      </div>
    </section>
  );
}

/* ── Feature Block ───────────────────────────────── */

interface FeatureBlockProps {
  label: string;
  title: React.ReactNode;
  children: React.ReactNode;
  image: React.ReactNode;
  reversed?: boolean;
}

function FeatureBlock({ label, title, children, image, reversed }: FeatureBlockProps) {
  return (
    <section className="py-20 md:py-28">
      <div className="max-w-5xl mx-auto px-6">
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-12 md:gap-20 items-center ${reversed ? 'md:[direction:rtl]' : ''}`}>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={STAGGER}
          >
            <motion.span variants={item} className="text-[11px] font-bold uppercase tracking-[0.2em] mb-5 block" style={{ color: 'var(--color-brand-teal)' }}>
              {label}
            </motion.span>
            <motion.h2 variants={item} className="text-3xl md:text-4xl lg:text-5xl font-bold leading-[1.1] tracking-tight mb-6" style={{ color: 'var(--color-luxury-ink)' }}>
              {title}
            </motion.h2>
            <motion.div variants={item} className="text-base md:text-lg leading-relaxed" style={{ color: 'var(--color-luxury-ink-muted)' }}>
              {children}
            </motion.div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={TRANSITION}
          >
            {image}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ── Feature Illustrations ───────────────────────── */

function VerifyIllustration() {
  return (
    <div className="rounded-2xl border p-8" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface-soft)' }}>
      <div className="max-w-sm mx-auto">
        <div className="flex items-center gap-4 p-4 rounded-xl mb-4 border" style={{ borderColor: 'rgba(52,199,89,0.2)', backgroundColor: 'rgba(52,199,89,0.04)' }}>
          <Shield size={24} style={{ color: 'var(--color-brand-mint)' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-luxury-ink)' }}>Student ID Verified</p>
            <p className="text-xs" style={{ color: 'var(--color-luxury-ink-muted)' }}>Loreto Convent · Class of 2026</p>
          </div>
          <Check size={18} className="ml-auto" style={{ color: 'var(--color-brand-mint)' }} />
        </div>
        <div className="space-y-3">
          {['Upload your school ID', 'Take a quick selfie', 'Get verified in minutes'].map((step, i) => (
            <div key={i} className="flex items-center gap-3 text-sm" style={{ color: i === 2 ? 'var(--color-brand-teal)' : '#9CA3AF' }}>
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: i === 2 ? 'var(--color-brand-teal)' : 'var(--color-surface-soft)', color: i === 2 ? '#FFFFFF' : '#9CA3AF' }}>
                {i + 1}
              </div>
              {step}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BrowseIllustration({ products }: { products: RealProduct[] }) {
  const display = products.slice(0, 3);
  return (
    <div className="rounded-2xl border p-8" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface-soft)' }}>
      <div className="max-w-sm mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Search size={14} style={{ color: 'var(--color-luxury-ink-muted)' }} />
            <span className="text-xs" style={{ color: 'var(--color-luxury-ink-muted)' }}>Search textbooks...</span>
          </div>
          <div className="flex -space-x-2">
            {['D', 'S', 'A'].map((l, i) => (
              <div key={i} className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{ backgroundColor: i === 0 ? '#FF6B6B' : i === 1 ? '#4ECDC4' : '#FFD93D', color: '#FFFFFF', border: '2px solid var(--color-surface-base)' }}
              >
                {l}
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          {display.map((product) => (
            <div key={product.id} className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'var(--color-surface-card)' }}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: '#E8F4FD', color: 'var(--color-brand-teal)' }}>
                    {product.category}
                  </span>
                </div>
                <p className="text-xs font-medium mt-1" style={{ color: 'var(--color-luxury-ink)' }}>{product.title}</p>
                <p className="text-[10px]" style={{ color: 'var(--color-luxury-ink-muted)' }}>by {product.sellerName} · {product.sellerSchool}</p>
              </div>
              <span className="text-sm font-bold whitespace-nowrap" style={{ color: 'var(--color-brand-teal)' }}>₹{product.price}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TradeIllustration({ products }: { products: RealProduct[] }) {
  const seller = products[0]?.sellerName || 'Alex';
  const buyer = products[1]?.sellerName || 'Jordan';
  const price = products[0]?.price || 45;
  const school = products[0]?.sellerSchool || 'your campus';

  return (
    <div className="rounded-2xl border p-8" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface-soft)' }}>
      <div className="max-w-sm mx-auto">
        <div className="flex items-center justify-center gap-6 mb-6">
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-sm" style={{ backgroundColor: '#FF6B6B' }}>
              {seller.charAt(0)}
            </div>
            <p className="text-[10px] font-medium mt-1" style={{ color: 'var(--color-luxury-ink)' }}>{seller.split(' ')[0]}</p>
            <Check size={12} style={{ color: 'var(--color-brand-mint)' }} />
          </div>
          <motion.div
            animate={{ x: [0, 4, 0] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          >
            <ArrowRight size={20} style={{ color: 'var(--color-brand-teal)' }} />
          </motion.div>
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-sm" style={{ backgroundColor: '#4ECDC4' }}>
              {buyer.charAt(0)}
            </div>
            <p className="text-[10px] font-medium mt-1" style={{ color: 'var(--color-luxury-ink)' }}>{buyer.split(' ')[0]}</p>
            <Check size={12} style={{ color: 'var(--color-brand-mint)' }} />
          </div>
        </div>
        <p className="text-center text-xs font-semibold" style={{ color: 'var(--color-luxury-ink)' }}>Meet at the school gate · {school}</p>
        <p className="text-center text-[10px] mt-1" style={{ color: 'var(--color-luxury-ink-muted)' }}>Both verified · In-app chat active</p>
        <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: 'var(--color-luxury-ink-muted)' }}>Payment held securely</span>
            <span className="font-semibold" style={{ color: 'var(--color-brand-mint)' }}>₹{price} ✓ Protected</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Graduation Legacy Section ───────────────────── */

function GraduationLegacy() {
  return (
    <section className="py-24 md:py-32">
      <div className="max-w-5xl mx-auto px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={STAGGER}
          className="relative rounded-3xl overflow-hidden p-12 md:p-20"
          style={{ backgroundColor: 'var(--color-surface-soft)', border: '1px solid var(--color-border)' }}
        >
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-[0.03] pointer-events-none" style={{ backgroundColor: 'var(--color-brand-pink)', transform: 'translate(30%, -30%)' }} />
          <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-[0.02] pointer-events-none" style={{ backgroundColor: 'var(--color-brand-teal)', transform: 'translate(-20%, 20%)' }} />

          <div className="relative z-10 max-w-2xl">
            <motion.div variants={item} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8 border"
              style={{ borderColor: 'rgba(255,55,95,0.15)', backgroundColor: 'rgba(255,55,95,0.05)' }}
            >
              <GraduationCap size={14} style={{ color: 'var(--color-brand-pink)' }} />
              <span className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--color-brand-pink)' }}>
                Graduation Mode
              </span>
            </motion.div>

            <motion.h2 variants={item} className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold leading-[1.05] mb-6" style={{ color: 'var(--color-luxury-ink)' }}>
              Leave a{' '}
              <span className="italic font-normal" style={{ color: 'var(--color-brand-pink-soft)' }}>
                legacy.
              </span>
            </motion.h2>

            <motion.p variants={item} className="text-base md:text-lg leading-relaxed mb-10 max-w-lg" style={{ color: 'var(--color-luxury-ink-muted)' }}>
              Graduating? Don't let your notes, textbooks, and campus gear collect dust.
              Pass them down to the next class and unlock the true value of your academic journey.
            </motion.p>

            <motion.div variants={item} className="flex flex-wrap gap-4">
              <Link
                to="/signup?mode=graduation"
                className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl text-sm font-bold tracking-wide transition-all duration-300 active:scale-[0.97]"
                style={{ backgroundColor: 'var(--color-brand-pink)', color: '#FFFFFF' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-brand-teal)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-brand-pink)'}
              >
                <GraduationCap size={16} />
                Activate Graduation Mode
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-sm font-bold tracking-wide transition-all duration-300 border-2 active:scale-[0.97]"
                style={{ borderColor: 'rgba(0,113,227,0.25)', color: 'var(--color-brand-teal)' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-brand-teal)'; e.currentTarget.style.color = '#FFFFFF'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--color-brand-teal)'; }}
              >
                Sign In
              </Link>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ── Feature Cards Grid ──────────────────────────── */

const FEATURES = [
  { icon: Shield, title: 'Verified Only', desc: 'Every student is ID-verified. No outsiders, no scams, no fake accounts.' },
  { icon: MessageCircle, title: 'Campus Chat', desc: 'Message buyers and sellers directly. Coordinate meetups safely.' },
  { icon: Heart, title: 'Wishlist & Save', desc: 'Save items you love and get notified when prices drop.' },
  { icon: Star, title: 'Reputation System', desc: 'Build trust with verified reviews from your schoolmates.' },
  { icon: BookOpen, title: 'Notes & Resources', desc: 'Buy and sell premium study materials from top students.' },
  { icon: Store, title: 'Graduation Mode', desc: 'Seniors pass down their gear. Underclassmen find deals.' },
];

function FeatureCards() {
  return (
    <section className="py-20 md:py-28" style={{ backgroundColor: 'var(--color-surface-soft)' }}>
      <div className="max-w-5xl mx-auto px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={STAGGER}
          className="text-center mb-16"
        >
          <motion.span variants={item} className="text-[11px] font-bold uppercase tracking-[0.2em] mb-5 block" style={{ color: 'var(--color-brand-teal)' }}>
            Why Nextbench
          </motion.span>
          <motion.h2 variants={item} className="text-3xl md:text-4xl lg:text-5xl font-serif font-bold leading-[1.1]" style={{ color: 'var(--color-luxury-ink)' }}>
            Everything you need.{' '}
            <span className="italic font-normal" style={{ color: 'var(--color-brand-pink-soft)' }}>
              Nothing you don't.
            </span>
          </motion.h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((feature, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ ...TRANSITION, delay: idx * 0.05 }}
              className="group p-6 md:p-8 rounded-2xl transition-all duration-300 cursor-default"
              style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-border)' }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(0,113,227,0.15)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--color-border)'}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110"
                style={{ backgroundColor: 'rgba(0,113,227,0.06)' }}
              >
                <feature.icon size={20} style={{ color: 'var(--color-brand-teal)' }} />
              </div>
              <h3 className="text-base font-bold mb-2" style={{ color: 'var(--color-luxury-ink)' }}>{feature.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-luxury-ink-muted)' }}>{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Final CTA ───────────────────────────────────── */

function FinalCTA({ stats, verifiedCount }: { stats: LandingStats; verifiedCount: number }) {
  return (
    <section className="py-24 md:py-32 text-center">
      <div className="max-w-3xl mx-auto px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={STAGGER}
        >
          <motion.h2
            variants={item}
            className="text-3xl md:text-5xl font-serif font-bold leading-tight mb-6"
            style={{ color: 'var(--color-luxury-ink)' }}
          >
            Your campus.{' '}
            <span className="italic font-normal" style={{ color: 'var(--color-brand-teal)' }}>
              Your marketplace.
            </span>
          </motion.h2>
          <motion.p
            variants={item}
            className="text-base md:text-lg mb-10 max-w-lg mx-auto"
            style={{ color: 'var(--color-luxury-ink-muted)' }}
          >
            Join <strong>{verifiedCount}</strong> verified students across <strong>{stats.totalSchools}</strong> schools already buying and selling on Nextbench. No spam. No scams. Just your school.
          </motion.p>
          <motion.div variants={item} className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2.5 px-10 py-5 rounded-xl text-sm font-bold tracking-wide transition-all duration-300 active:scale-[0.97]"
              style={{ backgroundColor: 'var(--color-brand-pink)', color: '#FFFFFF' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-brand-teal)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-brand-pink)'}
            >
              Join Nextbench
              <ArrowRight size={16} />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 px-10 py-5 rounded-xl text-sm font-bold tracking-wide transition-all duration-300 border-2 active:scale-[0.97]"
              style={{ borderColor: 'rgba(0,113,227,0.2)', color: 'var(--color-brand-teal)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-brand-teal)'; e.currentTarget.style.color = '#FFFFFF'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--color-brand-teal)'; }}
            >
              See how it works
            </a>
          </motion.div>
          <motion.p variants={item} className="mt-8 text-xs font-medium flex items-center justify-center gap-1.5" style={{ color: 'var(--color-luxury-ink-muted)' }}>
            <Shield size={12} /> Verified students only · Free to join · No hidden fees
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}

/* ── Featured Students Bar ────────────────────────── */

function FeaturedStudents({ users }: { users: RealUser[] }) {
  const display = [...users, ...users, ...users];
  const halfWidth = display.length * 60;

  const [scrollX, setScrollX] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const animate = () => {
      if (!isPaused) {
        setScrollX(prev => {
          const next = prev - 0.4;
          return next <= -halfWidth ? 0 : next;
        });
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPaused, halfWidth]);

  return (
    <div
      className="relative overflow-hidden py-6"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="flex items-center gap-3" style={{ transform: `translateX(${scrollX}px)`, willChange: 'transform' }}>
        {display.map((u, i) => {
          const color = getAvatarColor(u.name);
          return (
            <div
              key={`${u.id}-${i}`}
              className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface-soft)' }}
              title={`${u.name} · ${u.school}`}
            >
              <div className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                style={{ backgroundColor: color }}
              >
                {u.profilePicture ? (
                  <img src={u.profilePicture} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  u.name.charAt(0).toUpperCase()
                )}
              </div>
              <span style={{ color: 'var(--color-luxury-ink)' }}>{u.name.split(' ')[0]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main Landing Page ───────────────────────────── */

export default function LandingPage() {
  const [schools, setSchools] = useState<string[]>([]);
  const [products, setProducts] = useState<RealProduct[]>([]);
  const [users, setUsers] = useState<RealUser[]>([]);
  const [stats, setStats] = useState<LandingStats>({ totalUsers: 0, totalProducts: 0, totalSchools: 0 });
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    warmLandingCache();

    async function loadData() {
      try {
        const [schoolsData, productsData, statsData, usersData, verifiedCountData] = await Promise.all([
          fetchSchools(),
          fetchRecentProducts(),
          fetchLandingStats(),
          fetchLandingUsers(),
          fetchVerifiedUserCount(),
        ]);
        setSchools(schoolsData.map(s => s.name));
        setProducts(productsData);
        setStats(statsData);
        setUsers(usersData);
        setVerifiedCount(verifiedCountData);
      } catch (err) {
        console.error('Failed to load landing data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const heroAvatars = users.slice(0, 6);

  return (
    <div style={{ backgroundColor: 'var(--color-surface-base)' }}>
      <SEO
        title="Nextbench — The Verified Student Marketplace"
        description="Buy and sell with verified peers from your own school. Safe. Simple. Student-only."
      />

      {/* ── Hero ─────────────────────────────────────── */}
      <section className="relative pt-24 md:pt-32 pb-8 md:pb-16 overflow-hidden">
        <FloatingOrbs />

        <div className="max-w-5xl mx-auto px-6 text-center">
          {/* Avatars */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={STAGGER}
            className="flex items-center justify-center mb-8"
          >
            <div className="flex items-center">
              {heroAvatars.length > 0 ? (
                heroAvatars.map((u, i) => (
                  <AvatarCircle key={u.id} user={u} index={i} total={heroAvatars.length} />
                ))
              ) : (
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-luxury-ink-muted)' }}>
                  <Loader2 size={14} className="animate-spin" />
                  Loading...
                </div>
              )}
            </div>
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...TRANSITION, delay: 0.5 }}
              className="ml-4 text-left"
            >
              <div className="flex items-center gap-1 mb-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star key={star} size={12} fill="#FFD93D" style={{ color: '#FFD93D' }} />
                ))}
              </div>
              <p className="text-xs font-medium" style={{ color: 'var(--color-luxury-ink-muted)' }}>
                {loading ? 'Loading...' : `Loved by ${verifiedCount}+ students`}
              </p>
            </motion.div>
          </motion.div>

          {/* Animated word pill */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...TRANSITION, delay: 0.15 }}
            className="mb-8 md:mb-10"
          >
            <AnimatedWord />
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...TRANSITION, delay: 0.25 }}
            className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-[7rem] font-bold leading-[1.05] tracking-tight mb-6 max-w-4xl mx-auto"
            style={{ color: 'var(--color-luxury-ink)' }}
          >
            Your campus.{' '}
            <span className="block font-serif italic font-normal" style={{ color: 'var(--color-brand-teal)' }}>
              Your marketplace.
            </span>
          </motion.h1>

          {/* Subtext */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...TRANSITION, delay: 0.35 }}
            className="text-base md:text-lg leading-relaxed mx-auto mb-10"
            style={{ color: 'var(--color-luxury-ink-muted)', maxWidth: '550px' }}
          >
            The verified student marketplace. Buy and sell textbooks, notes, electronics, and more —
            safely within your own campus community.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...TRANSITION, delay: 0.45 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              to="/signup"
              className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl text-sm font-bold tracking-wide transition-all duration-300 active:scale-[0.97]"
              style={{ backgroundColor: 'var(--color-brand-pink)', color: '#FFFFFF' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-brand-teal)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-brand-pink)'}
            >
              Join Your School
              <ArrowRight size={16} />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-sm font-bold tracking-wide transition-all duration-300 border-2 active:scale-[0.97]"
              style={{ borderColor: 'rgba(0,113,227,0.2)', color: 'var(--color-brand-teal)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-brand-teal)'; e.currentTarget.style.color = '#FFFFFF'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--color-brand-teal)'; }}
            >
              See how it works
            </a>
          </motion.div>

          {/* Featured Students Bar */}
          {!loading && users.length > 0 && (
            <div className="mt-8">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-3" style={{ color: 'var(--color-luxury-ink-muted)' }}>
                {verifiedCount} verified students on Nextbench
              </p>
              <FeaturedStudents users={users} />
            </div>
          )}

          {/* Product Mockup */}
          {loading ? (
            <div className="mx-auto max-w-4xl mt-16 md:mt-20 rounded-xl border p-12" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface-soft)' }}>
              <div className="flex items-center justify-center gap-2 text-sm" style={{ color: 'var(--color-luxury-ink-muted)' }}>
                <Loader2 size={16} className="animate-spin" />
                Loading marketplace data...
              </div>
            </div>
          ) : (
            <ProductMockup products={products} />
          )}
        </div>
      </section>

      {/* ── Social Proof ─────────────────────────────── */}
      {!loading && <SocialProofStrip schools={schools} />}

      {/* ── Feature: Verify ──────────────────────────── */}
      <div id="features" />
      <FeatureBlock
        label="Verify Once"
        title={
          <>
            One student ID.{' '}
            <span className="font-serif italic font-normal" style={{ color: 'var(--color-brand-teal)' }}>
              That's all it takes.
            </span>
          </>
        }
        image={<VerifyIllustration />}
      >
        <p className="mb-4">
          Upload your school ID and snap a quick selfie. Our AI verification system confirms you're a real student in minutes — not hours.
        </p>
        <div className="space-y-2">
          {['AI-powered identity verification', 'No personal data shared with other users', 'One verification, full marketplace access'].map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <Check size={14} style={{ color: 'var(--color-brand-mint)' }} />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </FeatureBlock>

      {/* ── Feature: Browse ──────────────────────────── */}
      {!loading && (
        <FeatureBlock
          label="Browse & Connect"
          title={
            <>
              Your campus,{' '}
              <span className="font-serif italic font-normal" style={{ color: 'var(--color-brand-pink-soft)' }}>
                curated.
              </span>
            </>
          }
          image={<BrowseIllustration products={products} />}
          reversed
        >
          <p className="mb-4">
            Browse {stats.totalProducts} listings from verified students across {stats.totalSchools} schools. Search by category or price — and find exactly what you need.
          </p>
          <div className="space-y-2">
            {['Search by course, category & price', 'Real-time chat with verified buyers/sellers', 'Listings from your school and nearby'].map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Check size={14} style={{ color: 'var(--color-brand-mint)' }} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </FeatureBlock>
      )}

      {/* ── Feature: Trade ───────────────────────────── */}
      {!loading && (
        <FeatureBlock
          label="Trade Safely"
          title={
            <>
              Meet on campus.{' '}
              <span className="font-serif italic font-normal" style={{ color: 'var(--color-brand-teal)' }}>
                Pay with confidence.
              </span>
            </>
          }
          image={<TradeIllustration products={products} />}
        >
          <p className="mb-4">
            Arrange meetups at your school. Payments are held securely until both parties confirm — no cash, no risk.
          </p>
          <div className="space-y-2">
            {['Secure in-app payment hold', 'Designated school meetup zones', 'Both parties confirm before funds release'].map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Check size={14} style={{ color: 'var(--color-brand-mint)' }} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </FeatureBlock>
      )}

      {/* ── Feature Cards Grid ───────────────────────── */}
      <FeatureCards />

      {/* ── Graduation Legacy ────────────────────────── */}
      <GraduationLegacy />

      {/* ── Final CTA ────────────────────────────────── */}
      <FinalCTA stats={stats} verifiedCount={verifiedCount} />
    </div>
  );
}
