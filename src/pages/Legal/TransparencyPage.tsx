import React from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Heart, Zap, Award, Search, HelpCircle, Lock } from 'lucide-react';

const LAST_UPDATED = 'July 12, 2026';

interface CardSection {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  colorClass: string;
  bgLightClass: string;
  paragraphs: string[];
}

const SECTIONS: CardSection[] = [
  {
    title: 'Student Identity Verification',
    subtitle: 'Keeping our campus space exclusive and secure',
    icon: <ShieldCheck className="h-6 w-6" />,
    colorClass: 'text-brand-teal border-brand-teal/20',
    bgLightClass: 'bg-brand-teal/5',
    paragraphs: [
      'NextBench is built strictly for verified students. We do not allow external buyers, sellers, or third-party advertisers on the platform. To achieve this, every user undergoes identity verification before gaining access to features like direct messaging, posting items, or joining clubs.',
      'How it works: Users submit a photo of their student ID card alongside a live camera selfie. Our systems and human moderators cross-reference the ID structure, names, and selfie attributes to verify enrollment. ID photos are encrypted and used solely for this security check, never displayed publicly.',
    ],
  },
  {
    title: 'Feed & Search Algorithms',
    subtitle: 'How content and listings are shown to you',
    icon: <Search className="h-6 w-6" />,
    colorClass: 'text-brand-pink border-brand-pink/20',
    bgLightClass: 'bg-brand-pink/5',
    paragraphs: [
      'We believe in organic, student-driven discovery rather than attention-grabbing clickbait. The community "For You" feed ranks posts based on engagement weight (upvotes, reactions, replies, and shares) coupled with a time-decay factor so newer discussions get visibility.',
      'Our search engine tokenizes titles and descriptions into prefixes (e.g., "physics" matches "phy", "phys", "physics"). It then scores results based on title relevance, price filters, school affiliation, and seller trust score, ensuring you find what you need nearby instantly.',
    ],
  },
  {
    title: 'Bayesian Reputation & Ratings',
    subtitle: 'Transparent trust metrics that prevent manipulation',
    icon: <Award className="h-6 w-6" />,
    colorClass: 'text-amber-500 border-amber-500/20',
    bgLightClass: 'bg-amber-500/5',
    paragraphs: [
      'A simple average is easy to game (for example, getting a single 5-star rating from a friend makes a seller look perfect). To solve this, NextBench uses a Bayesian average formula to calculate seller ratings. This baseline weights a seller\'s reviews against the platform\'s global average.',
      'A seller needs at least 5 reviews before their individual score heavily shifts their displayed rating. Additionally, we enforce anti-abuse rules: you can only leave a review if you have active chat history relating to a specific listing with the seller, preventing fake testimonials.',
    ],
  },
  {
    title: 'Offline Caching & Speed',
    subtitle: 'Fast loading times while keeping costs low',
    icon: <Zap className="h-6 w-6" />,
    colorClass: 'text-emerald-500 border-emerald-500/20',
    bgLightClass: 'bg-emerald-500/5',
    paragraphs: [
      'Waiting for pages to load ruins the experience. NextBench stores frequently accessed data locally on your device using browser databases (IndexedDB). When you open the app, it renders instantly from the local cache while checking for database updates in the background.',
      'Images and media are optimized on the fly and distributed via Cloudinary Content Delivery Networks (CDNs) so you load compressed, viewport-sized images instead of raw heavy files.',
    ],
  },
  {
    title: 'No Transaction Fees',
    subtitle: 'Direct peer-to-peer exchanges on campus',
    icon: <Heart className="h-6 w-6" />,
    colorClass: 'text-red-500 border-red-500/20',
    bgLightClass: 'bg-red-50/5',
    paragraphs: [
      'NextBench is 100% free to use. We do not process payments, act as an escrow, or take commissions from sales. All transactions are settled directly between buyers and sellers, which means no platform fees cut into your margins.',
      'Sellers and buyers connect inside direct messages to agree on a price, and coordinate a time to meet up in-person on campus to hand over the items and complete the transaction.',
    ],
  },
  {
    title: 'Safe Campus Trade Guidelines',
    subtitle: 'Best practices for safe direct transactions',
    icon: <Lock className="h-6 w-6" />,
    colorClass: 'text-indigo-500 border-indigo-500/20',
    bgLightClass: 'bg-indigo-50/5',
    paragraphs: [
      'Because transactions occur in-person, we strongly advocate for safety. Always coordinate your meetups at populated, well-lit campus spots (such as library gates, department common rooms, or school cafeterias) during daylight hours.',
      'Inspect the condition of textbooks, electronics, or other items fully before exchanging payment (via cash or instant bank transfers). Never share personal phone numbers, addresses, or private details outside the chat system.',
    ],
  },
];

export default function TransparencyPage() {
  return (
    <div className="pt-32 pb-20 px-6 min-h-screen bg-surface-base">
      <div className="max-w-4xl mx-auto">
        {/* Back navigation */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
          <Link to="/" className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-brand-teal/50 hover:text-brand-teal transition-colors">
            <ArrowLeft size={14} /> Back to Home
          </Link>
        </motion.div>

        {/* Title */}
        <div className="border-b border-luxury-ink/5 pb-8 mb-12">
          <h1 className="text-3xl sm:text-4xl font-serif font-bold italic text-luxury-ink mb-3">
            Transparency <span className="not-italic">at NextBench</span>
          </h1>
          <p className="text-xs font-bold uppercase tracking-wider text-luxury-ink/40">
            Last Updated: {LAST_UPDATED}
          </p>
        </div>

        {/* Intro */}
        <div className="mb-12 text-sm leading-relaxed text-luxury-ink/70 max-w-2xl">
          <p className="mb-4">
            NextBench is designed to be an open, honest, and reliable hub for verified students. We believe you should know exactly how your data is handled, how items are ranked, and what happens behind the scenes when you buy, sell, or communicate.
          </p>
          <p>
            Here is a layman's breakdown of the systems, algorithms, and guidelines that keep NextBench safe, fast, and free.
          </p>
        </div>

        {/* Sections Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {SECTIONS.map((section, idx) => (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="p-6 rounded-2xl border border-luxury-ink/5 bg-surface-card shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 border ${section.colorClass} ${section.bgLightClass}`}>
                  {section.icon}
                </div>
                <h3 className="text-base font-bold text-luxury-ink mb-1">{section.title}</h3>
                <p className="text-[10px] font-bold text-luxury-ink/40 uppercase tracking-wider mb-4">{section.subtitle}</p>
                <div className="space-y-3 text-xs leading-relaxed text-luxury-ink/65">
                  {section.paragraphs.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Questions section */}
        <div className="mt-16 p-8 rounded-2xl border border-luxury-ink/5 bg-surface-card text-center">
          <div className="w-12 h-12 rounded-full bg-brand-teal/5 flex items-center justify-center mx-auto mb-4 border border-brand-teal/10">
            <HelpCircle className="h-6 w-6 text-brand-teal" />
          </div>
          <h2 className="text-lg font-serif font-bold italic text-luxury-ink mb-2">Have Questions?</h2>
          <p className="text-xs text-luxury-ink/50 leading-relaxed max-w-md mx-auto mb-6">
            If you have questions about how our identity checks work, have encountered issues with a user, or want to understand our platform details further, reach out to us.
          </p>
          <a
            href="mailto:nextbench@loreto.edu"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-luxury-ink text-surface-base hover:bg-brand-teal transition-colors rounded-full text-xs font-bold uppercase tracking-wider"
          >
            Contact Team
          </a>
        </div>
      </div>
    </div>
  );
}
