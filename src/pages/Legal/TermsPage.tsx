import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowLeft } from 'lucide-react';

const LAST_UPDATED = 'May 12, 2026';

interface Section {
  title: string;
  content: string[];
}

const SECTIONS: Section[] = [
  {
    title: '1. Eligibility',
    content: [
      'Nextbench is exclusively available to currently enrolled students of participating schools. By creating an account, you confirm that you are a genuine student of one of the listed institutions and that you are at least 13 years of age.',
      'All accounts must be verified via a valid, unaltered student ID card and a live selfie. Accounts found to be created with forged, expired, or borrowed identification will be permanently banned and reported to the relevant school administration.',
      'Nextbench reserves the right to refuse or revoke access to any user at its sole discretion, particularly in cases of suspected fraud, abuse, or violation of these Terms.',
      'By creating an account, you expressly consent to AI-based identity verification (including analysis of your student ID card and selfie) and to the collection, processing, and storage of your personal data as described in our Privacy Policy. If you do not consent to these practices, you may not use the platform.',
    ],
  },
  {
    title: '2. Account Responsibility',
    content: [
      'You are solely responsible for all activity that occurs under your account. You must not share your login credentials or allow others to access your account.',
      'You agree to keep your profile information accurate and up to date. Misrepresentation of your identity, school, or listing details is grounds for immediate account termination.',
      'You are responsible for all transactions, messages, and conduct associated with your account, whether initiated by you or not.',
    ],
  },
  {
    title: '3. Prohibited Items & Conduct',
    content: [
      'The following items are strictly prohibited on Nextbench: weapons (including replicas), controlled substances, alcohol, tobacco, adult content, counterfeit goods, stolen property, prescription medications, and any items illegal under applicable Indian law.',
      'You may not use Nextbench for spam, phishing, harassment, hate speech, threats, or any form of deceptive conduct. Soliciting personal information from minors is strictly prohibited.',
      'Price gouging, artificial scarcity, and predatory pricing practices are prohibited. Nextbench reserves the right to remove listings that are deemed unreasonably priced or exploitative.',
      'You may not scrape, crawl, or extract data from the platform using automated tools or bots.',
    ],
  },
  {
    title: '4. Listings & Transactions',
    content: [
      'All listings are submitted for admin review and must be approved before appearing publicly. Nextbench reserves the right to reject any listing without explanation.',
      'Nextbench acts solely as a platform to connect buyers and sellers. We are not a party to any transaction and bear no responsibility for the quality, safety, legality, or delivery of listed items.',
      'All payments, if any, are arranged directly between buyers and sellers. Nextbench does not currently process payments and offers no escrow, payment protection, or refund service.',
      'We strongly recommend conducting all meetups at designated, safe, public locations — preferably school gates or other well-lit, populated areas during daylight hours.',
    ],
  },
  {
    title: '5. Intellectual Property',
    content: [
      'All content, branding, design, and code on the Nextbench platform is the intellectual property of Nextbench and its creators. You may not copy, reproduce, or distribute any part of the platform without express written permission.',
      'By uploading images or text to Nextbench, you grant us a non-exclusive, royalty-free, worldwide licence to display and use that content solely for the purpose of operating the platform.',
      'You retain ownership of the content you upload. However, content that violates these Terms may be removed without notice.',
    ],
  },
  {
    title: '6. Limitation of Liability',
    content: [
      'Nextbench is provided "as is" without warranties of any kind, expressed or implied. We do not guarantee uninterrupted, error-free, or secure access to the platform.',
      'To the fullest extent permitted by law, Nextbench and its creators shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the platform, including but not limited to loss of property, financial loss, or personal injury resulting from meetups.',
      'Your use of the platform is entirely at your own risk. You are solely responsible for taking appropriate safety precautions during any in-person transaction.',
    ],
  },
  {
    title: '7. Account Termination',
    content: [
      'We reserve the right to suspend or permanently terminate your account at any time, with or without notice, for any violation of these Terms.',
      'You may request deletion of your account by contacting us at the email address provided in the Privacy Policy. Upon deletion, your personal data will be removed from active databases within 30 days, subject to legal retention requirements.',
      'Upon termination, your active listings will be removed from the marketplace. Completed transaction records may be retained as required by law.',
    ],
  },
  {
    title: '8. Governing Law',
    content: [
      'These Terms are governed by the laws of the Republic of India, specifically the laws of the state of Uttar Pradesh, without regard to its conflict of law provisions.',
      'Any disputes arising from these Terms or your use of the platform shall be subject to the exclusive jurisdiction of the courts of Lucknow, Uttar Pradesh, India.',
      'If any provision of these Terms is found to be unenforceable, the remaining provisions shall remain in full force and effect.',
    ],
  },
  {
    title: '9. Changes to Terms',
    content: [
      'We reserve the right to modify these Terms at any time. Changes will be effective immediately upon posting to the platform. Continued use of Nextbench after any changes constitutes your acceptance of the new Terms.',
      'We will make reasonable efforts to notify users of material changes via in-app notification or email.',
    ],
  },
];

export default function TermsPage() {
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
            <ShieldCheck size={14} className="text-brand-teal" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-teal">Legal Agreement</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-serif font-bold text-luxury-ink mb-6 leading-tight">
            Terms of <span className="italic text-brand-pink-soft">Service.</span>
          </h1>
          <p className="text-luxury-ink/40 text-sm font-medium">Last updated: {LAST_UPDATED}</p>
          <p className="mt-6 text-luxury-ink/60 leading-relaxed">
            Please read these Terms of Service carefully before using the Nextbench platform. By creating an account or using any part of our service, you agree to be bound by these terms in their entirety.
          </p>
        </motion.div>

        {/* Sections */}
        <div className="space-y-12">
          {SECTIONS.map((section, i) => (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 * i }}
              className="bg-surface-card rounded-2xl p-8 border border-luxury-ink/5 shadow-sm"
            >
              <h2 className="text-lg font-bold text-luxury-ink mb-5 pb-4 border-b border-luxury-ink/5">
                {section.title}
              </h2>
              <div className="space-y-4">
                {section.content.map((para, j) => (
                  <p key={j} className="text-luxury-ink/60 leading-relaxed text-sm">
                    {para}
                  </p>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Footer CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-16 p-8 bg-brand-teal/5 rounded-2xl border border-brand-teal/10 text-center"
        >
          <p className="text-luxury-ink/60 text-sm mb-4">
            Questions about these Terms? We're here to help.
          </p>
          <a
            href="mailto:nextbench@loreto.edu"
            className="inline-flex items-center gap-2 bg-luxury-ink text-surface-base px-8 py-3 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-brand-teal transition-colors"
          >
            Contact Us
          </a>
          <div className="mt-6 pt-6 border-t border-brand-teal/10">
            <Link to="/privacy" className="text-[11px] font-bold uppercase tracking-widest text-brand-teal/50 hover:text-brand-teal transition-colors">
              View Privacy Policy →
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
