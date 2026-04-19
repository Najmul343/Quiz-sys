import { useState, useEffect } from 'react';
import { db, auth } from '../../lib/firebase';
import { collection, query, getDocs, where, doc, getDoc } from 'firebase/firestore';
import { motion } from 'framer-motion';
import { BookOpen, FileText, Users, TrendingUp, AlertCircle, BrainCircuit, ArrowRight, ShieldCheck, Target } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';

export default function TeacherOverview() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalQuestions: 0,
    activeTests: 0,
    draftTests: 0,
    totalStudents: 0,
    avgPassingRate: 82
  });
  const [recentTests, setRecentTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser?.uid || ''));
      const userData = userDoc.data();
      const collegeId = userData?.collegeId;

      if (!collegeId) return;

      const qSnap = await getDocs(query(collection(db, 'questions'), where('collegeId', '==', collegeId)));
      const tSnap = await getDocs(query(collection(db, 'tests'), where('collegeId', '==', collegeId)));
      const sSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student'), where('collegeId', '==', collegeId)));

      const tests = tSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      setStats({
        totalQuestions: qSnap.size,
        activeTests: tests.filter((d: any) => d.status === 'active').length,
        draftTests: tests.filter((d: any) => d.status === 'draft').length,
        totalStudents: sSnap.size,
        avgPassingRate: 78
      });
      setRecentTests(tests.sort((a: any, b: any) => b.createdAt?.seconds - a.createdAt?.seconds).slice(0, 3));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 pb-10">
      <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/40 relative overflow-hidden">
         <div className="relative z-10">
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase mb-1 italic">Intelligence Synthesis</h2>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Cross-departmental faculty overview</p>
         </div>
         <div className="absolute top-0 right-0 p-8 opacity-5">
            <Target size={120} />
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 auto-rows-fr">
        {/* Main Stat 1: Total Questions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 md:col-span-2"
        >
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Question Inventory</p>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-5xl font-black text-slate-900 tracking-tighter">{stats.totalQuestions}</div>
              <div className="text-xs text-slate-400 font-bold mt-2 uppercase tracking-tight">Verified knowledge assets</div>
            </div>
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100">
              <BookOpen size={32} />
            </div>
          </div>
        </motion.div>

        {/* Main Stat 2: Active Tests */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50"
        >
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Active Deployments</p>
          <div className="text-4xl font-black text-emerald-600 tracking-tighter">{stats.activeTests}</div>
          <div className="flex items-center gap-2 mt-4 text-[10px] font-black text-emerald-500 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            Synchronized
          </div>
        </motion.div>

        {/* Main Stat 3: Pass Rate */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50"
        >
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Success Metric</p>
          <div className="text-4xl font-black text-amber-500 tracking-tighter">{stats.avgPassingRate}%</div>
          <div className="flex items-center gap-1.5 mt-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <TrendingUp size={14} className="text-emerald-500" />
            Avg Performance
          </div>
        </motion.div>

        {/* Drafts Stat */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50"
        >
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Pending Drafts</p>
          <div className="text-4xl font-black text-slate-400 tracking-tighter italic">{stats.draftTests}</div>
          <div className="flex items-center gap-1.5 mt-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <FileText size={14} />
            Incomplete Logic
          </div>
        </motion.div>

        {/* Quick Actions (Wide) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 md:col-span-2"
        >
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Operations Matrix</p>
          <div className="space-y-4">
            <button 
              onClick={() => navigate('/teacher/questions')}
              className="w-full group flex items-center justify-between p-5 bg-slate-50 border border-slate-100 rounded-[1.5rem] transition-all hover:bg-white hover:border-indigo-400 hover:shadow-xl hover:shadow-indigo-50"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm text-indigo-600 border border-slate-50">
                  <BrainCircuit size={24} />
                </div>
                <div className="text-left">
                  <p className="font-bold text-slate-800 text-sm">Synthetic Intelligence</p>
                  <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-0.5 italic">MCQ Generation Engine</p>
                </div>
              </div>
              <ArrowRight size={20} className="text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
            </button>
            <button 
              onClick={() => navigate('/teacher/create-test')}
              className="w-full group flex items-center justify-between p-5 bg-slate-50 border border-slate-100 rounded-[1.5rem] transition-all hover:bg-white hover:border-emerald-400 hover:shadow-xl hover:shadow-emerald-50"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm text-emerald-600 border border-slate-50">
                  <FileText size={24} />
                </div>
                <div className="text-left">
                  <p className="font-bold text-slate-800 text-sm">Deployment Protocol</p>
                  <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-0.5 italic">Secure Examination Setup</p>
                </div>
              </div>
              <ArrowRight size={20} className="text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" />
            </button>
          </div>
        </motion.div>

        {/* Student Outreach */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 md:col-span-2"
        >
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">User Ecosystem</p>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-5xl font-black text-slate-900 tracking-tighter">{stats.totalStudents}</div>
              <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-2 flex items-center gap-1">
                <TrendingUp size={12} /> Positive growth detected
              </div>
            </div>
            <div className="flex -space-x-4">
              {[1,2,3].map(i => (
                <div key={i} className="w-12 h-12 rounded-full border-4 border-white bg-slate-100 flex items-center justify-center text-xs font-black text-slate-400">
                   U{i}
                </div>
              ))}
              <div className="w-12 h-12 rounded-full border-4 border-white bg-slate-900 flex items-center justify-center text-[10px] font-black text-white">+8K</div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Recent Activity List */}
      <div className="bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-2xl shadow-slate-300/30">
        <h3 className="text-xl font-black uppercase text-slate-800 tracking-tighter italic mb-8">Deployment History</h3>
        <div className="space-y-4">
          {recentTests.map((test) => (
             <div key={test.id} className="flex items-center justify-between p-6 bg-slate-50/50 rounded-3xl border border-slate-50 transition-all hover:bg-white hover:border-slate-100 hover:shadow-xl group">
               <div className="flex items-center gap-6">
                 <div className={cn(
                   "w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg",
                   test.status === 'active' ? 'bg-emerald-600 shadow-emerald-100' : 'bg-slate-400 shadow-slate-100'
                 )}>
                   <FileText size={20} />
                 </div>
                 <div>
                    <h4 className="font-bold text-slate-800">{test.title}</h4>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{test.questionIds.length} Questions • {test.duration}m Limit</p>
                 </div>
               </div>
               <div className="flex items-center gap-6">
                 <div className={cn(
                   "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest",
                   test.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                 )}>
                   {test.status}
                 </div>
                 {test.status === 'draft' && (
                   <button 
                     onClick={() => navigate(`/teacher/create-test?id=${test.id}`)}
                     className="p-3 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-100 opacity-0 group-hover:opacity-100 transition-all"
                   >
                     <ArrowRight size={18} />
                   </button>
                 )}
               </div>
             </div>
          ))}
          {recentTests.length === 0 && (
            <div className="py-10 text-center text-slate-400 font-black uppercase tracking-widest text-xs opacity-50">
               No tests logged in database
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

