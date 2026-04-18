import { useState } from 'react';
import { auth, db } from '../lib/firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { motion } from 'framer-motion';
import { LogIn, ShieldCheck, GraduationCap, School, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user exists in Firestore
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        // Register as student by default if new
        await setDoc(userRef, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          role: 'student',
          createdAt: serverTimestamp(),
        });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] p-6 font-sans">
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-600 rounded-full blur-[120px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-[2rem] shadow-2xl border border-[var(--border)] overflow-hidden relative z-10"
      >
        <div className="p-10">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-50 border border-indigo-100 rounded-3xl mb-6 text-[var(--primary)] shadow-inner">
              <GraduationCap size={48} strokeWidth={1.5} />
            </div>
            <h1 className="text-3xl font-black text-[var(--text-main)] tracking-tighter uppercase">Magic <span className="text-[var(--text-sub)]">MCQ</span></h1>
            <div className="mt-2 flex items-center justify-center gap-2">
              <div className="h-0.5 w-4 bg-[var(--primary)]" />
              <p className="text-[10px] font-black text-[var(--text-sub)] uppercase tracking-[0.2em]">Institutional Access</p>
              <div className="h-0.5 w-4 bg-[var(--primary)]" />
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-50 border border-[var(--border)] rounded-2xl p-5 flex gap-4 transition-all hover:bg-white group cursor-default">
              <ShieldCheck className="text-indigo-600 shrink-0 group-hover:scale-110 transition-transform" />
              <div>
                <p className="text-xs font-black text-slate-800 uppercase tracking-widest leading-tight mb-1">Encrypted Portal</p>
                <p className="text-[10px] text-slate-500 font-bold leading-relaxed">Secure SSO authentication required for all active examiners and participants.</p>
              </div>
            </div>

            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-4 bg-[var(--text-main)] hover:bg-[var(--primary)] text-white font-black py-4.5 px-6 rounded-2xl transition-all shadow-xl shadow-slate-200 active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? (
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                  <Loader2 size={24} />
                </motion.div>
              ) : (
                <img src="https://www.google.com/favicon.ico" className="w-5 h-5 grayscale brightness-200" alt="Google" />
              )}
              AUTHENTICATE WITH GOOGLE
            </button>

            {error && (
              <p className="text-red-600 text-[10px] font-black uppercase text-center bg-red-50 py-3 rounded-xl border border-red-100">{error}</p>
            )}

            <div className="pt-8 border-t border-slate-100 text-center">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                Protected by Enterprise-grade Security Architecture
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
