import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'motion/react';
import { ArrowLeft, Home } from 'lucide-react';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-surface-base text-luxury-ink relative overflow-hidden selection:bg-brand-teal/20">
      <Helmet>
        <title>404 Page Not Found | Nextbench</title>
        <meta name="description" content="The page you are looking for does not exist on Nextbench." />
      </Helmet>

      {/* Decorative Glow Elements */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-teal/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-brand-pink/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-lg w-full text-center flex flex-col items-center">
        {/* 404 Number with premium typography and scale transition */}
        <motion.h1
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.6 }}
          className="text-8xl sm:text-9xl font-serif font-bold bg-linear-to-r from-luxury-ink via-brand-teal to-luxury-ink bg-clip-text text-transparent tracking-tighter select-none mb-4"
        >
          404
        </motion.h1>

        {/* Error message headers */}
        <motion.h2
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="text-xl sm:text-2xl font-sans font-bold text-luxury-ink tracking-tight mb-3"
        >
          Lost in Space?
        </motion.h2>

        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="text-sm sm:text-base text-luxury-ink-muted leading-relaxed mb-10 max-w-md"
        >
          The page you are looking for has been moved, deleted, or never existed in the first place. Let's get you back on track.
        </motion.p>

        {/* Action Buttons */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto"
        >
          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center gap-2 px-6 py-3 border border-border-strong hover:border-luxury-ink/40 bg-surface-card hover:bg-surface-soft text-sm font-bold text-luxury-ink rounded-2xl shadow-sm transition-all duration-200 cursor-pointer active:scale-98"
          >
            <ArrowLeft size={16} />
            Go Back
          </button>
          
          <Link
            to="/"
            className="flex items-center justify-center gap-2 px-6 py-3 bg-brand-teal hover:bg-brand-teal/90 text-sm font-bold text-white rounded-2xl shadow-md shadow-brand-teal/20 transition-all duration-200 cursor-pointer hover:shadow-lg active:scale-98"
          >
            <Home size={16} />
            Go Home
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
