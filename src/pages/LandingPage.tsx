import { motion } from 'motion/react';
import { ArrowRight, ShieldCheck, Truck, RefreshCcw, GraduationCap, PackageCheck, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

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
              className="text-7xl md:text-9xl font-light leading-[1.05] tracking-tight text-luxury-ink mb-10"
            >
              Built for <span className="italic font-serif text-brand-teal">Students</span>.<br />
              <span className="font-serif italic text-brand-pink-soft">Trusted</span> by Schools.
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
                to="/marketplace" 
                className="px-8 py-4 border-2 border-brand-teal text-brand-teal font-bold uppercase tracking-widest text-xs hover:bg-brand-teal hover:text-white transition-all duration-300"
              >
                Explore Marketplace
              </Link>
              <Link 
                to="/#how-it-works" 
                className="px-8 py-4 flex items-center gap-2 text-brand-pink font-bold uppercase tracking-widest text-xs group"
              >
                Learn How It Works
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </motion.div>

            <motion.div 
              variants={itemVariants}
              className="mt-20 flex items-center gap-12"
            >
              <div className="flex flex-col">
                <span className="text-3xl font-serif font-bold text-luxury-ink">12k+</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/40">Verified Students</span>
              </div>
              <div className="w-px h-10 bg-luxury-ink/10" />
              <div className="flex flex-col">
                <span className="text-3xl font-serif font-bold text-luxury-ink">45+</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-luxury-ink/40">Partner Schools</span>
              </div>
            </motion.div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 50, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
            className="hidden lg:block relative"
          >
            <div className="relative z-10 p-4 bg-white rounded-3xl luxury-shadow border border-luxury-ink/5">
              <img 
                src="https://images.unsplash.com/photo-1543269664-76bc3997d9ea?q=80&w=2070&auto=format&fit=crop" 
                alt="NextBench Platform Preview" 
                className="w-full rounded-2xl grayscale-[0.2] hover:grayscale-0 transition-all duration-700 aspect-[4/5] object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute -bottom-10 -left-10 bg-white p-6 rounded-2xl luxury-shadow max-w-xs border border-luxury-ink/5">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-10 h-10 rounded-full bg-brand-teal-mint/20 flex items-center justify-center">
                    <ShieldCheck className="text-brand-teal" size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-luxury-ink">Aaditya Roy</p>
                    <p className="text-[10px] uppercase font-bold text-brand-teal tracking-wider">Verified Senior</p>
                  </div>
                </div>
                <p className="text-sm text-luxury-ink/70 font-medium">Just listed 4 NEET prep modules at 60% off for my juniors.</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-white py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-20 gap-8">
            <div className="max-w-2xl">
              <h2 className="text-5xl font-serif font-bold text-luxury-ink mb-6">Intentionally Designed for the Modern Student.</h2>
              <p className="text-lg text-luxury-ink/50">NextBench replaces chaotic school groups and shady marketplaces with a premium, trusted ecosystem.</p>
            </div>
            <Link to="/marketplace" className="inline-flex items-center gap-2 text-brand-pink font-bold border-b-2 border-brand-pink/20 hover:border-brand-pink transition-all pb-1">
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
                className="p-10 bg-white border border-brand-teal/5 luxury-shadow flex flex-col items-start transition-all"
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

      {/* Graduation Mode Section */}
      <section className="py-32 px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto bg-luxury-ink rounded-[3rem] p-12 md:p-24 relative overflow-hidden">
          <div className="relative z-10 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full border border-white/20 mb-8">
              <GraduationCap className="text-white" size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">Premium Senior Service</span>
            </div>
            <h2 className="text-5xl md:text-7xl font-serif font-bold text-white mb-8 leading-[0.9]">
              The Graduation <br />
              <span className="text-brand-pink-soft italic font-normal">Legacy.</span>
            </h2>
            <p className="text-xl text-white/60 mb-12 leading-relaxed">
              Leaving school? Don't let your valuable notes and textbooks collect dust. Pass them down to the next generation and unlock the true value of your academic journey.
            </p>
            <Link 
              to="/signup?mode=graduation" 
              className="bg-brand-pink text-white px-10 py-5 rounded-full font-bold hover:bg-white hover:text-luxury-ink transition-all inline-block"
            >
              Activate Graduation Mode
            </Link>
          </div>
          <div className="absolute right-0 top-0 bottom-0 w-1/2 hidden lg:block">
            <img 
              src="https://images.unsplash.com/photo-1523050853064-85a8efda54b3?q=80&w=2070&auto=format&fit=crop" 
              alt="Graduation Tradition" 
              className="w-full h-full object-cover opacity-30 mix-blend-luminosity grayscale shadow-inner"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-32 px-6 text-center">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-5xl md:text-7xl font-serif font-bold text-luxury-ink mb-12 leading-tight">
            Elevate Your Student Economy.
          </h2>
          <div className="flex flex-col md:flex-row items-center justify-center gap-6">
            <Link to="/signup" className="w-full md:w-auto bg-luxury-ink text-white px-12 py-6 rounded-full text-lg font-bold luxury-shadow hover:scale-105 transition-all">
              Join NextBench Today
            </Link>
            <p className="text-luxury-ink/40 text-sm font-medium">No spam. Only verified student deals.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

// Fixed missing import
import { MapPin } from 'lucide-react';
