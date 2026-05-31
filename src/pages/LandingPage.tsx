import { motion } from 'motion/react';
import { ArrowRight, ShieldCheck, Truck, RefreshCcw, GraduationCap, PackageCheck, MapPin, Building2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import SEO from '../components/seo/SEO';

export default function LandingPage() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.15 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } }
  };

  return (
    <div className="pt-20">
      <SEO 
        title="Nextbench" 
        description="The premiere verified student-to-student marketplace. Buy, sell, and trade within your trusted campus community."
      />
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden px-6 pt-20 pb-32">
        <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={containerVariants}
            className="flex flex-col items-start"
          >
            <motion.div 
              variants={itemVariants}
              className="inline-block px-3 py-1 bg-brand-mint/20 text-brand-teal text-[11px] font-bold uppercase tracking-[0.2em] mb-6 rounded-full w-fit"
            >
              Verified Student Ecosystem
            </motion.div>
            
            <motion.h1 
              variants={itemVariants}
              className="text-6xl md:text-8xl font-light leading-[1.05] tracking-tight text-luxury-ink mb-10"
            >
              One stop solution to all <br />
              <span className="font-serif italic text-brand-teal">school needs.</span>
            </motion.h1>

            <motion.p 
              variants={itemVariants}
              className="text-lg text-brand-teal/80 leading-relaxed max-w-md mb-12"
            >
              The premiere marketplace for verified student-to-student exchange. Connect with peers to buy, sell, and transfer value safely within your community.
            </motion.p>

            <motion.div 
              variants={itemVariants}
              className="flex flex-wrap items-center gap-6"
            >
              <Link 
                to="/dashboard" 
                className="px-8 py-4 border-2 border-brand-teal text-brand-teal font-bold uppercase tracking-widest text-xs hover:bg-brand-teal hover:text-white transition-all duration-300"
              >
                Explore Marketplace
              </Link>
              <a 
                href="#how-it-works" 
                className="px-8 py-4 flex items-center gap-2 text-brand-pink font-bold uppercase tracking-widest text-xs group"
              >
                Learn How It Works
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </a>
            </motion.div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 50, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
            className="hidden lg:block relative"
          >
            <div className="relative z-10 p-4 theme-card rounded-3xl luxury-shadow">
              <img 
                src="https://images.unsplash.com/photo-1543269664-76bc3997d9ea?q=80&w=2070&auto=format&fit=crop" 
                alt="Nextbench Platform Preview" 
                className="w-full rounded-2xl grayscale-[0.2] hover:grayscale-0 transition-all duration-700 aspect-[4/5] object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* How it Works Section */}
      <section id="how-it-works" className="bg-surface-card py-32 px-6 border-y" style={{ borderColor: 'var(--color-border)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-20 gap-8">
            <div className="max-w-2xl">
              <h2 className="text-5xl font-serif font-bold text-luxury-ink mb-6">Intentionally Designed for the Modern Student.</h2>
              <p className="text-lg text-luxury-ink/50">Nextbench replaces chaotic school groups and shady marketplaces with a premium, trusted ecosystem.</p>
            </div>
            <Link to="/dashboard" className="inline-flex items-center gap-2 text-brand-pink font-bold border-b-2 border-brand-pink/20 hover:border-brand-pink transition-all pb-1">
              View All Features <ArrowRight size={18} />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              { icon: ShieldCheck, color: "text-brand-teal", bg: "bg-brand-teal/5", title: "Verified Accounts", desc: "Every user must verify with a valid school ID card and selfie." },
              { icon: MapPin, color: "text-brand-pink", bg: "bg-brand-pink/5", title: "School Meetup", desc: "Safe, public meetup points designated at authorized school gates." },
              { icon: Truck, color: "text-brand-teal", bg: "bg-brand-teal/5", title: "Local Delivery", desc: "Optional instant delivery through partners like Porter and Swiggy." },
              { icon: PackageCheck, color: "text-brand-pink", bg: "bg-brand-pink/5", title: "Secure Escrow", desc: "Payments are held securely until item is verified at meetup." },
              { icon: GraduationCap, color: "text-brand-teal", bg: "bg-brand-teal/5", title: "Graduation Mode", desc: "Special features for seniors to pass on value to their juniors." },
              { icon: RefreshCcw, color: "text-brand-pink", bg: "bg-brand-pink/5", title: "Sustainable Reuse", desc: "Promoting circular economy and reducing campus waste." }
            ].map((feature, idx) => (
              <motion.div 
                key={idx}
                whileHover={{ y: -8 }}
                className="p-10 theme-card rounded-2xl luxury-shadow flex flex-col items-start transition-all"
              >
                <div className={`${feature.bg} p-4 rounded-sm mb-8`}>
                  <feature.icon className={feature.color} size={28} />
                </div>
                <h3 className="text-[13px] font-bold uppercase tracking-widest text-luxury-ink mb-4">{feature.title}</h3>
                <p className="text-brand-teal/60 text-[13px] leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section id="trust" className="py-32 px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto theme-card rounded-[3rem] p-12 md:p-24 relative overflow-hidden">
          <div className="relative z-10 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-teal/10 rounded-full border border-brand-teal/20 mb-8">
              <GraduationCap className="text-brand-teal" size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-brand-teal">Premium Senior Service</span>
            </div>
            <h2 className="text-5xl md:text-7xl font-serif font-bold text-luxury-ink mb-8 leading-[0.9]">
              The Graduation <br />
              <span className="text-brand-pink-soft italic font-normal">Legacy.</span>
            </h2>
            <p className="text-xl text-luxury-ink/60 mb-12 leading-relaxed">
              Leaving school? Don't let your valuable notes and textbooks collect dust. Pass them down to the next generation and unlock the true value of your academic journey.
            </p>
            <Link 
              to="/signup?mode=graduation" 
              className="bg-brand-pink text-white px-10 py-5 rounded-full font-bold hover:bg-luxury-ink transition-all inline-block"
            >
              Activate Graduation Mode
            </Link>
          </div>
          {/* Decorative icon instead of broken bg image */}
          <div className="absolute right-12 md:right-24 top-1/2 -translate-y-1/2 hidden lg:flex items-center justify-center">
            <div className="w-64 h-64 rounded-full bg-brand-teal/5 flex items-center justify-center border border-brand-teal/10">
              <GraduationCap className="text-brand-teal/20" size={120} />
            </div>
          </div>
        </div>
      </section>

      {/* Organizations Section */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto theme-card rounded-[3rem] p-12 md:p-20 relative overflow-hidden">
          <div className="relative z-10 flex flex-col md:flex-row items-center gap-12">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-pink/10 rounded-full border border-brand-pink/20 mb-8">
                <Building2 className="text-brand-pink" size={14} />
                <span className="text-[10px] font-bold uppercase tracking-widest text-brand-pink">For Organizations</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-serif font-bold text-luxury-ink mb-6 leading-tight">
                Schools, Companies &<br />
                <span className="text-brand-pink-soft italic font-normal">Organizations.</span>
              </h2>
              <p className="text-lg text-luxury-ink/60 mb-8 leading-relaxed max-w-lg">
                Sell products in bulk, promote events, and connect directly with the verified student community. Get your organization verified today.
              </p>
              <Link
                to="/org-signup"
                className="inline-flex items-center gap-3 bg-brand-pink text-white px-8 py-4 rounded-full font-bold hover:bg-luxury-ink transition-all text-sm"
              >
                <Building2 size={18} />
                Register Your Organization
              </Link>
            </div>
            <div className="hidden md:grid grid-cols-2 gap-4 max-w-xs">
              {[
                { emoji: '📦', label: 'Bulk Listings', desc: 'Sell to thousands of students at once' },
                { emoji: '📅', label: 'Events', desc: 'Promote workshops, fests & competitions' },
                { emoji: '🎓', label: 'Hiring', desc: 'Reach students for internships & jobs' },
                { emoji: '🤝', label: 'Trust', desc: 'Verified badge builds credibility' },
              ].map((item, idx) => (
                <div key={idx} className="p-5 rounded-2xl bg-surface-soft border border-luxury-ink/5">
                  <p className="text-2xl mb-2">{item.emoji}</p>
                  <p className="text-xs font-bold text-luxury-ink mb-1">{item.label}</p>
                  <p className="text-[10px] text-luxury-ink/40">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-32 px-6 text-center">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-5xl md:text-7xl font-serif font-bold text-luxury-ink mb-12 leading-tight">
            Elevate Your Student Economy.
          </h2>
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 mb-16">
            <Link to="/signup" className="w-full md:w-auto bg-luxury-ink text-surface-base px-12 py-6 rounded-full text-lg font-bold luxury-shadow hover:scale-105 transition-all">
              Join Nextbench Today
            </Link>
            <p className="text-luxury-ink/40 text-sm font-medium">No spam. Only verified student deals.</p>
          </div>


        </div>
      </section>
    </div>
  );
}
