import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const { userData } = useAuth();

  return (
    <footer className="bg-white border-t border-brand-teal/10 pt-24 pb-12">
      <div className="max-w-7xl mx-auto px-12">
        <div className="flex flex-col md:flex-row items-center gap-12 bg-white/50 backdrop-blur-sm p-4 mb-20">
          <div className="flex-1">
            <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-brand-teal mb-4">Featured Selection</div>
            <div className="flex flex-wrap gap-6">
              <Link to="/marketplace?cat=books" className="text-xs font-bold hover:text-brand-pink tracking-wide">Textbooks</Link>
              <Link to="/marketplace?cat=electronics" className="text-xs font-bold hover:text-brand-pink tracking-wide">Electronics</Link>
              <Link to="/marketplace?cat=notes" className="text-xs font-bold hover:text-brand-pink tracking-wide">Premium Notes</Link>
              <Link to="/marketplace?cat=uniforms" className="text-xs font-bold hover:text-brand-pink tracking-wide">Uniforms</Link>
            </div>
          </div>
          
          <div className="hidden md:block w-px h-12 bg-brand-teal/10"></div>
          
          <div className="flex-1 flex flex-col">
            <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-brand-pink-soft mb-2">Graduation Mode</div>
            <p className="text-[11px] text-brand-teal/70 max-w-sm">Seniors: pass down your knowledge and resources to the next generation of students.</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full border border-brand-teal/20 flex items-center justify-center opacity-50 text-[10px] font-bold uppercase">ig</div>
            <div className="w-8 h-8 rounded-full border border-brand-teal/20 flex items-center justify-center opacity-50 text-[10px] font-bold uppercase">ln</div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between pt-10 border-t border-brand-teal/5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/30 mb-4 md:mb-0">
            © {currentYear} NextBench. Where Student Generations Connect.
          </div>
          <div className="flex items-center gap-8">
            {userData?.isAdmin && (
              <Link to="/admin" className="text-[10px] font-bold uppercase tracking-widest text-brand-teal hover:text-brand-pink">Admin Portal</Link>
            )}
            <Link to="/privacy" className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 hover:text-brand-pink">Privacy</Link>
            <Link to="/terms" className="text-[10px] font-bold uppercase tracking-widest text-brand-teal/40 hover:text-brand-pink">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
