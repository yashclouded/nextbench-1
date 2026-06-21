import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Lock, ArrowLeft } from 'lucide-react';

const LAST_UPDATED = 'May 12, 2026';

interface Section {
  title: string;
  content: (string | { subtitle: string; items: string[] })[];
}

const SECTIONS: Section[] = [
  {
    title: '1. Information We Collect',
    content: [
      'We collect the following categories of personal data when you use Nextbench:',
      {
        subtitle: 'Account Information',
        items: [
          'Full name (from your Google account)',
          'Email address (from your Google account)',
          'Profile photo (from your Google account, or uploaded by you)',
          'School / institution name (provided by you during signup)',
        ],
      },
      {
        subtitle: 'Verification Documents',
        items: [
          'A photo of your student ID card (uploaded during verification)',
          'A selfie holding your student ID card (captured during verification)',
        ],
      },
      {
        subtitle: 'Listing & Activity Data',
        items: [
          'Product listings you create, including photos, descriptions, and pricing',
          'Messaging data (text and images exchanged in chat rooms)',
          'Wishlist items and notification preferences',
          'Timestamps of account creation, updates, and activity',
        ],
      },
      {
        subtitle: 'Technical Data',
        items: [
          'Browser type and operating system (via standard web logs)',
          'IP address (for security and abuse prevention)',
          'Cookies and local storage data (for session management)',
        ],
      },
    ],
  },
  {
    title: '2. How We Use Your Information',
    content: [
      'We use your data strictly for the following purposes:',
      {
        subtitle: 'Core Service Delivery',
        items: [
          'Verifying your identity and school enrollment status',
          'Displaying your profile and listings to other verified users',
          'Facilitating communications between buyers and sellers',
          'Sending in-app notifications about your listings and account status',
        ],
      },
      {
        subtitle: 'Safety & Security',
        items: [
          'Detecting and preventing fraud, abuse, and prohibited activity',
          'Reviewing identification documents to maintain marketplace trust',
          'Investigating reported violations of our Terms of Service',
        ],
      },
      {
        subtitle: 'Platform Improvement',
        items: [
          'Analysing aggregate, anonymised usage patterns to improve features',
          'Diagnosing technical errors and performance issues',
        ],
      },
      'We do NOT sell, rent, or trade your personal data to third parties for marketing purposes. We do not use your data for advertising.',
    ],
  },
  {
    title: '3. Data Storage & Third-Party Services',
    content: [
      'Your data is processed and stored using the following trusted third-party infrastructure providers. Each provider is bound by its own privacy commitments and data processing agreements.',
      {
        subtitle: 'Firebase (Google LLC)',
        items: [
          'Used for user authentication, real-time database (Firestore), and cloud storage',
          'Data is stored on Google Cloud servers, typically in the us-central1 or nam5 region',
          'Governed by Google\'s Privacy Policy and Cloud Data Processing Addendum',
          'Website: firebase.google.com/support/privacy',
        ],
      },
      {
        subtitle: 'Cloudinary',
        items: [
          'Used for secure storage and delivery of product images and verification photos',
          'Images are processed and stored on Cloudinary\'s CDN infrastructure',
          'Governed by Cloudinary\'s Privacy Policy',
          'Website: cloudinary.com/privacy',
        ],
      },
      {
        subtitle: 'Vercel Inc.',
        items: [
          'Used to host and serve the Nextbench web application',
          'Governed by Vercel\'s Privacy Policy',
          'Website: vercel.com/legal/privacy-policy',
        ],
      },
    ],
  },
  {
    title: '4. Verification Document Handling',
    content: [
      'Verification photos (student ID cards and selfies) are treated with the highest level of sensitivity. They are:',
      {
        subtitle: 'Access & Use',
        items: [
          'Visible only to Nextbench administrators for the sole purpose of identity verification',
          'Never shared with other users, schools, or any third party',
          'Stored in secure, access-controlled cloud storage on Cloudinary',
          'Reviewed manually by authorised admin personnel only',
        ],
      },
      {
        subtitle: 'Retention',
        items: [
          'Retained for the lifetime of your account to enable re-verification if needed',
          'Deleted within 30 days of a verified account deletion request',
          'Not used for any purpose beyond initial identity verification',
        ],
      },
    ],
  },
  {
    title: '5. Data Retention',
    content: [
      'We retain your personal data for as long as your account is active or as needed to provide you with our services.',
      'Account data: Retained until you request account deletion.',
      'Verification documents: Retained for the lifetime of your account, deleted within 30 days of an account deletion request.',
      'Listing data: Active listings are removed upon account deletion. Completed transaction records may be retained for up to 1 year for dispute resolution and legal compliance.',
      'Chat messages: Retained for the lifetime of the chat room, which persists until deleted by an admin or until all participants delete their accounts.',
    ],
  },
  {
    title: '6. Your Rights',
    content: [
      'Under the Digital Personal Data Protection Act, 2023 (India) and applicable privacy laws, you have the following rights:',
      {
        subtitle: 'Rights You Can Exercise',
        items: [
          'Right to Access: Request a copy of the personal data we hold about you',
          'Right to Correction: Request correction of inaccurate or incomplete personal data',
          'Right to Erasure: Request deletion of your account and associated personal data',
          'Right to Withdraw Consent: Withdraw consent for data processing at any time (by deleting your account)',
          'Right to Grievance Redressal: Raise any privacy concern with our designated contact',
        ],
      },
      'To exercise any of these rights, please contact us at the email address listed below. We will respond to all verified requests within 30 days.',
    ],
  },
  {
    title: '7. Cookies & Local Storage',
    content: [
      'Nextbench uses browser cookies and local storage for the following essential purposes:',
      {
        subtitle: 'Essential Only',
        items: [
          'Maintaining your login session (Firebase Auth session token)',
          'Storing temporary form data (e.g., selected school during signup)',
          'In-app preference settings (e.g., filter states)',
        ],
      },
      'We do not use tracking cookies, advertising cookies, or any third-party analytics cookies. You may clear your browser cookies at any time; however, this will log you out of the platform.',
    ],
  },
  {
    title: '8. Children\'s Privacy',
    content: [
      'Nextbench is not directed at children under the age of 13. We do not knowingly collect personal data from children under 13. If you are under 13, please do not use the platform or provide any personal information.',
      'Users aged 13–18 are minors and must have implicit parental consent to use the platform. By using the platform, users aged 13–18 confirm that they have obtained such consent.',
      'If we become aware that a child under 13 has provided personal data, we will delete that information promptly.',
    ],
  },
  {
    title: '9. Security',
    content: [
      'We implement industry-standard technical and organisational measures to protect your personal data, including:',
      {
        subtitle: 'Security Measures',
        items: [
          'All data in transit is encrypted using TLS/HTTPS',
          'Firebase Security Rules restrict data access to authorised users only',
          'Admin access to verification documents is limited and logged',
          'Cloudinary storage uses access-controlled upload presets',
          'We do not store passwords (Google OAuth only — no passwords on our servers)',
        ],
      },
      'Despite our best efforts, no system is completely secure. We cannot guarantee the absolute security of your data. In the event of a data breach that affects your rights, we will notify you as required by applicable law.',
    ],
  },
  {
    title: '10. Contact Us',
    content: [
      'If you have any questions, concerns, or requests regarding this Privacy Policy or your personal data, please contact us:',
      'Email: nextbench@loreto.edu',
      'We aim to respond to all privacy-related enquiries within 30 days.',
    ],
  },
  {
    title: '11. Your Consent',
    content: [
      'By creating an account and using Nextbench, you explicitly acknowledge and consent to the following data processing activities:',
      {
        subtitle: 'What You Consent To',
        items: [
          'Collection and processing of your personal data (name, email, school, profile photo, ID card photo, selfie) as described in this Privacy Policy',
          'AI-based analysis of your student ID card and selfie for automated identity verification purposes',
          'Secure storage of your verification documents with our trusted partners (Cloudinary, Firebase) as described in Section 3',
          'Retention of your data for the duration of your account, as described in Section 5',
          'In-app communications and notifications related to your account, listings, and transactions',
        ],
      },
      {
        subtitle: 'Your Rights Regarding Consent',
        items: [
          'You may withdraw your consent at any time by deleting your account via our contact email',
          'Withdrawal of consent does not affect the lawfulness of processing based on consent before its withdrawal',
          'If you do not agree with these data processing activities, please do not create an account or use the platform',
          'You may request a copy of your data or correction of inaccurate data at any time (see Section 6)',
        ],
      },
    ],
  },
];

export default function PrivacyPage() {
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
            <Lock size={14} className="text-brand-teal" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-teal">Privacy Policy</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-serif font-bold text-luxury-ink mb-6 leading-tight">
            Your <span className="italic text-brand-teal">Privacy</span> Matters.
          </h1>
          <p className="text-luxury-ink/40 text-sm font-medium">Last updated: {LAST_UPDATED}</p>
          <p className="mt-6 text-luxury-ink/60 leading-relaxed">
            Nextbench is built on trust. This Privacy Policy explains exactly what data we collect, why we collect it, and how we protect it. We use plain language — not legalese — because you deserve to understand what happens with your information.
          </p>
        </motion.div>

        {/* TL;DR Box */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-12 p-8 bg-brand-teal rounded-2xl text-white"
        >
          <h2 className="text-xs font-bold uppercase tracking-widest mb-4 opacity-70">TL;DR — The Short Version</h2>
          <ul className="space-y-2 text-sm font-medium leading-relaxed opacity-90">
            <li>✓ We only collect what we need to run the platform</li>
            <li>✓ We never sell your data or use it for ads</li>
            <li>✓ Your ID photos are only seen by admins for verification</li>
            <li>✓ You can request deletion of your account anytime</li>
            <li>✓ We use Google Firebase & Cloudinary — both industry-leading</li>
          </ul>
        </motion.div>

        {/* Sections */}
        <div className="space-y-12">
          {SECTIONS.map((section, i) => (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 * i }}
              className="bg-surface-card rounded-2xl p-8 border border-luxury-ink/5 shadow-sm"
            >
              <h2 className="text-lg font-bold text-luxury-ink mb-5 pb-4 border-b border-luxury-ink/5">
                {section.title}
              </h2>
              <div className="space-y-5">
                {section.content.map((block, j) =>
                  typeof block === 'string' ? (
                    <p key={j} className="text-luxury-ink/60 leading-relaxed text-sm">{block}</p>
                  ) : (
                    <div key={j}>
                      <p className="text-xs font-bold uppercase tracking-widest text-brand-teal/70 mb-2">{block.subtitle}</p>
                      <ul className="space-y-1.5">
                        {block.items.map((item, k) => (
                          <li key={k} className="flex items-start gap-2 text-sm text-luxury-ink/60 leading-relaxed">
                            <span className="text-brand-teal mt-0.5 shrink-0">—</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                )}
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
            Have a privacy concern or want to request your data?
          </p>
          <a
            href="mailto:nextbench@loreto.edu"
            className="inline-flex items-center gap-2 bg-luxury-ink text-surface-base px-8 py-3 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-brand-teal transition-colors"
          >
            Contact Privacy Team
          </a>
          <div className="mt-6 pt-6 border-t border-brand-teal/10">
            <Link to="/terms" className="text-[11px] font-bold uppercase tracking-widest text-brand-teal/50 hover:text-brand-teal transition-colors">
              View Terms of Service →
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
