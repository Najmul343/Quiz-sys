import { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { motion } from 'framer-motion';
import { 
  GraduationCap, 
  Clock, 
  ShieldCheck, 
  ArrowRight, 
  LogOut,
  History,
  LayoutDashboard,
  Loader2,
  BrainCircuit
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function StudentDashboard() {
  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTests();
  }, []);

  const fetchTests = async () => {
    try {
      const q = query(collection(db, 'tests'), where('status', '==', 'active'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setTests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-main)] font-sans">
      <nav className="h-20 bg-white border-b border-[var(--border)] px-8 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-3 text-[var(--primary)] font-black text-2xl tracking-tighter uppercase">
          <div className="w-10 h-10 bg-[var(--primary)] rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">M</div>
          MAGIC <span className="text-[var(--text-main)]">MCQ</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden md:flex flex-col text-right">
            <span className="text-sm font-black text-[var(--text-main)]">{auth.currentUser?.displayName}</span>
            <span className="text-[10px] text-[var(--text-sub)] font-bold uppercase tracking-widest leading-none">{auth.currentUser?.email}</span>
          </div>
          <div style={{ height: '28px', width: '1px', backgroundColor: 'var(--border)' }}></div>
          <button 
            onClick={() => auth.signOut()}
            className="p-2.5 rounded-xl border border-[var(--border)] text-[var(--text-sub)] hover:text-red-500 hover:border-red-100 transition-all bg-white shadow-sm"
          >
            <LogOut size={20} />
          </button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-8 pt-10">
        <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="badge mb-3">Live Portal</div>
            <h1 className="text-4xl font-black text-[var(--text-main)] tracking-tight mb-2">
              Assessment Hub
            </h1>
            <p className="text-[var(--text-sub)] font-bold uppercase tracking-wider text-xs italic">
              {tests.length} examinations currently available for your profile.
            </p>
          </div>
          <div className="flex gap-3">
            <button className="flex items-center gap-2 px-5 py-2.5 bg-white border border-[var(--border)] rounded-xl text-sm font-bold text-[var(--text-sub)] shadow-sm hover:bg-slate-50 transition-all">
              <History size={16} />
              Archives
            </button>
            <div className="w-10 h-10 rounded-xl bg-[var(--primary)] text-white flex items-center justify-center shadow-lg shadow-indigo-100">
              <LayoutDashboard size={20} />
            </div>
          </div>
        </header>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
            {[1,2,3].map(i => <div key={i} className="h-64 bg-white rounded-3xl border border-[var(--border)]" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tests.map((test) => (
              <motion.div
                key={test.id}
                whileHover={{ y: -4, scale: 1.01 }}
                className="bento-card group flex flex-col min-h-[320px] bg-white p-8 relative overflow-hidden"
              >
                {/* Decorative background accent */}
                <div className="absolute -top-12 -right-12 w-32 h-32 bg-indigo-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity blur-3xl" />
                
                <div className="flex justify-between items-start mb-6 z-10">
                  <div className="w-12 h-12 bg-[var(--bg)] rounded-2xl flex items-center justify-center text-[var(--primary)] border border-[var(--border)] shadow-inner group-hover:bg-[var(--primary)] group-hover:text-white transition-colors">
                    {test.settings?.forceFullscreen ? <ShieldCheck size={28} /> : <GraduationCap size={28} />}
                  </div>
                  {test.settings?.forceFullscreen && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 rounded-full border border-red-100">
                      <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Strict Mode</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 z-10">
                  <div className="card-title text-[var(--text-sub)]">Chapter Resource</div>
                  <h3 className="text-2xl font-black text-[var(--text-main)] mb-6 leading-tight group-hover:text-[var(--primary)] transition-colors">
                    {test.title}
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-3 mb-8">
                    <div className="p-3 bg-[var(--bg)] rounded-2xl border border-[var(--border)] group-hover:bg-indigo-50 group-hover:border-indigo-100 transition-colors">
                      <p className="text-[10px] font-black text-[var(--text-sub)] uppercase tracking-widest mb-1">Time Grant</p>
                      <p className="text-lg font-black text-[var(--text-main)]">{test.duration}m</p>
                    </div>
                    <div className="p-3 bg-[var(--bg)] rounded-2xl border border border-[var(--border)] group-hover:bg-emerald-50 group-hover:border-emerald-100 transition-colors">
                      <p className="text-[10px] font-black text-[var(--text-sub)] uppercase tracking-widest mb-1">Pass Mark</p>
                      <p className="text-lg font-black text-[var(--text-main)]">{test.passingMarks}%</p>
                    </div>
                  </div>
                </div>

                <Link 
                  to={`/quiz/${test.id}`}
                  className="z-10 w-full py-4 bg-[var(--text-main)] hover:bg-[var(--primary)] text-white font-black rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-slate-200 active:scale-[0.98]"
                >
                  INITIALIZE SESSION
                  <ArrowRight size={20} />
                </Link>
              </motion.div>
            ))}
            
            {/* Additional informational cards for Bento Feel */}
            <div className="bento-card bg-indigo-600 border-none relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-20 text-white pointer-events-none">
                <BrainCircuit size={120} strokeWidth={1} />
              </div>
              <div className="card-title text-indigo-200">AI Assistance</div>
              <div>
                <p className="text-white text-xl font-bold leading-tight">Prepare with smart practice sessions.</p>
                <div className="mt-4 flex gap-2">
                  <span className="text-[10px] font-black text-indigo-900 bg-indigo-300 px-2 py-1 rounded-md uppercase tracking-widest">Available</span>
                </div>
              </div>
            </div>

            {tests.length === 0 && (
              <div className="col-span-full py-32 text-center">
                <div className="w-20 h-20 bg-slate-100 rounded-3xl mx-auto flex items-center justify-center text-slate-300 mb-6 border-2 border-dashed border-slate-200">
                  <ShieldCheck size={40} />
                </div>
                <h3 className="text-2xl font-bold text-slate-800">No Tests Scheduled</h3>
                <p className="text-slate-500 font-medium">Contact your department for test schedules.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
