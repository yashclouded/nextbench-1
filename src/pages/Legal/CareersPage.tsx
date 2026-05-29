import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Briefcase, Terminal, Megaphone, Smartphone } from 'lucide-react';

export default function CareersPage() {
  return (
    <div className="pt-32 pb-20 px-6 min-h-screen">
      <div className="max-w-3xl mx-auto">
        {/* Back */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
          <Link to="/" className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-brand-teal/50 hover:text-brand-teal transition-colors">
            <ArrowLeft size={14} /> Back to Home
          </Link>
        </motion.div>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-teal/10 rounded-full mb-8">
            <Briefcase size={14} className="text-brand-teal" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-teal">Careers</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-serif font-bold text-luxury-ink mb-6 leading-tight">
            Build something <span className="italic text-brand-teal">real</span>.
          </h1>
          <div className="space-y-4 mt-6 text-luxury-ink/60 leading-relaxed text-lg">
            <p>We're opening internships at Nextbench.</p>
            <p>If you've ever wanted to build something from the ground up instead of just watching from the sidelines, this is for you.</p>
            <p>Nextbench is building a private community for school students. Think of it as a place where students can connect with people from their own schools, buy and sell old books and items safely, share posts, and be part of a verified student network.</p>
            <p>The platform is already live at nextbench.in, and we're looking for a few people who want to help build it further.</p>
          </div>
        </motion.div>

        {/* Positions Box */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-12 p-8 bg-brand-teal rounded-2xl text-white"
        >
          <h2 className="text-sm font-bold uppercase tracking-widest mb-6 opacity-90">Open Positions</h2>
          
          <div className="space-y-6">
            <div>
              <h3 className="flex items-center gap-2 text-lg font-bold mb-2">
                <Terminal size={18} className="text-brand-pink" /> Tech Intern
              </h3>
              <ul className="space-y-1 text-sm font-medium leading-relaxed opacity-90 list-disc list-inside ml-2">
                <li>Work on real features and improvements</li>
                <li>Help solve actual product problems</li>
                <li>Learn how products are built outside tutorials and courses</li>
              </ul>
            </div>
            
            <div>
              <h3 className="flex items-center gap-2 text-lg font-bold mb-2">
                <Megaphone size={18} className="text-brand-pink" /> Outreach Intern
              </h3>
              <ul className="space-y-1 text-sm font-medium leading-relaxed opacity-90 list-disc list-inside ml-2">
                <li>Connect with students and school communities</li>
                <li>Help us grow across schools</li>
                <li>Build partnerships and bring users onto the platform</li>
              </ul>
            </div>
            
            <div>
              <h3 className="flex items-center gap-2 text-lg font-bold mb-2">
                <Smartphone size={18} className="text-brand-pink" /> Social Media Intern
              </h3>
              <ul className="space-y-1 text-sm font-medium leading-relaxed opacity-90 list-disc list-inside ml-2">
                <li>Create content and ideas</li>
                <li>Manage social presence</li>
                <li>Help tell the story of what we're building</li>
              </ul>
            </div>
          </div>
        </motion.div>

        {/* Sections */}
        <div className="space-y-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              className="bg-surface-card rounded-2xl p-8 border border-luxury-ink/5 shadow-sm"
            >
              <h2 className="text-lg font-bold text-luxury-ink mb-5 pb-4 border-b border-luxury-ink/5">
                Important
              </h2>
              <ul className="space-y-3 text-sm text-luxury-ink/60 leading-relaxed">
                <li className="flex items-start gap-2"><span className="text-brand-teal mt-0.5 shrink-0">—</span>This is an unpaid internship for the first 2 months.</li>
                <li className="flex items-start gap-2"><span className="text-brand-teal mt-0.5 shrink-0">—</span>We're still in the early stages and are focused on building.</li>
                <li className="flex items-start gap-2"><span className="text-brand-teal mt-0.5 shrink-0">—</span>At the end of the internship, we'll review performance and discuss long-term roles.</li>
              </ul>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 }}
              className="bg-surface-card rounded-2xl p-8 border border-luxury-ink/5 shadow-sm"
            >
              <h2 className="text-lg font-bold text-luxury-ink mb-5 pb-4 border-b border-luxury-ink/5">
                What you'll get
              </h2>
              <ul className="space-y-3 text-sm text-luxury-ink/60 leading-relaxed">
                <li className="flex items-start gap-2"><span className="text-brand-teal mt-0.5 shrink-0">—</span>Experience working on a real startup</li>
                <li className="flex items-start gap-2"><span className="text-brand-teal mt-0.5 shrink-0">—</span>Direct access to the founding team</li>
                <li className="flex items-start gap-2"><span className="text-brand-teal mt-0.5 shrink-0">—</span>Certificate of internship</li>
                <li className="flex items-start gap-2"><span className="text-brand-teal mt-0.5 shrink-0">—</span>Letter of Recommendation for outstanding performers</li>
                <li className="flex items-start gap-2"><span className="text-brand-teal mt-0.5 shrink-0">—</span>Opportunity to continue as a core team member</li>
              </ul>
              
              <p className="mt-6 text-sm text-luxury-ink/60 leading-relaxed">
                For people who make a significant impact, there may be opportunities to become founding members in the future. Exceptional contributors can also be considered for equity, with allocations based entirely on long-term contribution and performance.
              </p>
            </motion.div>
        </div>

        {/* Footer CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-16 p-8 bg-brand-teal/5 rounded-2xl border border-brand-teal/10 text-center"
        >
          <h3 className="text-xl font-serif font-bold text-luxury-ink mb-4">We're not looking for people who want a fancy title.</h3>
          <p className="text-luxury-ink/60 text-sm mb-8 max-w-lg mx-auto">
            We're looking for people who see something interesting being built and want to help make it real.
          </p>
          <a
            href="https://tally.so/r/68plXo"
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-luxury-ink text-surface-base px-8 py-3 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-brand-teal transition-colors"
          >
            Apply Now
          </a>
        </motion.div>
      </div>
    </div>
  );
}
