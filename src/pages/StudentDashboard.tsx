import { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, doc, getDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  GraduationCap, 
  Clock, 
  ShieldCheck, 
  ArrowRight, 
  LogOut,
  History,
  LayoutDashboard,
  Loader2,
  BrainCircuit,
  Target,
  CheckCircle2,
  XCircle,
  Eye,
  FileText,
  X,
  TrendingUp,
  Award
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import MathRenderer from '../components/MathRenderer';

import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

export default function StudentDashboard() {
  const [tests, setTests] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [questions, setQuestions] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'live' | 'history'>('live');
  const [viewingResult, setViewingResult] = useState<any>(null);
  const [progress, setProgress] = useState<Record<string, any>>({});
  const [growthData, setGrowthData] = useState<any[]>([]);
  const [officialName, setOfficialName] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser?.uid || ''));
      const userData = userDoc.data();
      setOfficialName(userData?.officialName || userData?.displayName || auth.currentUser?.displayName || "");
      const collegeId = userData?.collegeId;

      if (!collegeId) return;

      // 1 & 2 Parallelized for speed
      const [testSnap, subSnap] = await Promise.all([
        getDocs(query(
          collection(db, 'tests'), 
          where('status', '==', 'active'),
          where('collegeId', '==', collegeId),
          orderBy('createdAt', 'desc')
        )),
        getDocs(query(
          collection(db, 'submissions'),
          where('studentId', '==', auth.currentUser?.uid),
          orderBy('submittedAt', 'desc')
        ))
      ]);

      const testList = testSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      setTests(testList);

      const subList = subSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      setSubmissions(subList);

      // 4. Fetch Progress for Practice Tests
      if (auth.currentUser) {
        const progSnap = await getDocs(query(collection(db, 'practice_progress'), where('studentId', '==', auth.currentUser.uid)));
        const progMap: Record<string, any> = {};
        progSnap.docs.forEach(d => { progMap[d.data().testId] = d.data(); });
        setProgress(progMap);
      }

      // 3. Performance Trend
      const trend = [...subList].reverse().map((s, i) => ({
        iteration: i + 1,
        score: Math.round(s.percentage || (s.score/s.total*100)),
        title: testList.find(t => t.id === (s as any).testId)?.title || 'Test'
      }));
      setGrowthData(trend);

      // 4. Questions are now fetched on-demand in handleFullSheet to avoid bulk download

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const [loadingSheet, setLoadingSheet] = useState(false);

  const handleFullSheet = async (sub: any) => {
    setLoadingSheet(true);
    try {
      const qIds = Object.keys(sub.answers);
      const missingQIds = qIds.filter(id => !questions[id]);
      
      if (missingQIds.length > 0) {
        // Fetch only specific questions needed for this result
        const qDocs = await Promise.all(missingQIds.map(id => getDoc(doc(db, 'questions', id))));
        const newQs: Record<string, any> = { ...questions };
        qDocs.forEach(d => { if(d.exists()) newQs[d.id] = d.data(); });
        setQuestions(newQs);
      }
      setViewingResult(sub);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSheet(false);
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
            <span className="text-[10px] text-[var(--text-sub)] font-bold uppercase tracking-widest leading-none">ID: {auth.currentUser?.uid.slice(0, 8)}</span>
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
            <div className="badge mb-3">{activeTab === 'live' ? 'Live Portal' : 'Academic Archive'}</div>
            <p className="text-[10px] font-black text-[var(--primary)] uppercase tracking-widest mb-1">{officialName}</p>
            <h1 className="text-4xl font-black text-[var(--text-main)] tracking-tight mb-2 uppercase">
              {activeTab === 'live' ? 'Assessment Hub' : 'Result Ledger'}
            </h1>
            <p className="text-[var(--text-sub)] font-bold uppercase tracking-wider text-xs italic">
              {activeTab === 'live' ? `${tests.length} active sessions available.` : `${submissions.length} attempts recorded in the database.`}
            </p>
          </div>
          <div className="flex bg-white p-1.5 rounded-2xl border border-[var(--border)] shadow-sm">
            <button 
              onClick={() => setActiveTab('live')}
              className={cn("px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all", activeTab === 'live' ? 'bg-[var(--primary)] text-white shadow-lg shadow-indigo-100' : 'text-[var(--text-sub)] hover:bg-slate-50')}
            >
              Live
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={cn("px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all", activeTab === 'history' ? 'bg-[var(--primary)] text-white shadow-lg shadow-indigo-100' : 'text-[var(--text-sub)] hover:bg-slate-50')}
            >
              History
            </button>
          </div>
        </header>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
            {[1,2,3].map(i => <div key={i} className="h-64 bg-white rounded-3xl border border-[var(--border)]" />)}
          </div>
        ) : activeTab === 'live' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tests.filter(t => t.visible !== false).map((test) => (
              <motion.div
                key={test.id}
                whileHover={{ y: -4, scale: 1.01 }}
                className="bento-card group flex flex-col min-h-[320px] bg-white p-8 relative overflow-hidden transition-all duration-300"
              >
                <div className="absolute -top-12 -right-12 w-32 h-32 bg-indigo-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity blur-3xl" />
                
                <div className="flex justify-between items-start mb-6 z-10">
                  <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-[var(--primary)] border border-indigo-100 shadow-inner group-hover:bg-[var(--primary)] group-hover:text-white transition-colors">
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
                  <div className="card-title text-[var(--text-sub)]">Institutional Assessment</div>
                  <h3 className="text-2xl font-black text-[var(--text-main)] mb-6 leading-tight group-hover:text-[var(--primary)] transition-colors line-clamp-2">
                    {test.title}
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-3 mb-8">
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 group-hover:bg-indigo-50 group-hover:border-indigo-100 transition-colors text-center">
                      <p className="text-[10px] font-black text-[var(--text-sub)] uppercase tracking-widest mb-1">Duration</p>
                      <p className="text-lg font-black text-[var(--text-main)]">{test.duration}m</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 group-hover:bg-emerald-50 group-hover:border-emerald-100 transition-colors text-center">
                      <p className="text-[10px] font-black text-[var(--text-sub)] uppercase tracking-widest mb-1">Passing</p>
                      <p className="text-lg font-black text-[var(--text-main)]">{test.passingMarks}%</p>
                    </div>
                  </div>
                </div>

                <Link 
                  to={`/quiz/${test.id}`}
                  className="z-10 w-full py-4 bg-[var(--text-main)] hover:bg-[var(--primary)] text-white font-black rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-slate-200 active:scale-[0.98] uppercase text-xs tracking-widest relative overflow-hidden"
                >
                  {progress[test.id] ? 'Resume Attempt' : 'Enter Session'}
                  <ArrowRight size={18} />
                  {progress[test.id] && <div className="absolute top-0 right-0 h-full w-2 bg-emerald-500" />}
                </Link>
              </motion.div>
            ))}
            
            {tests.length === 0 && (
              <div className="col-span-full py-32 text-center bg-white rounded-[3rem] border border-dashed border-[var(--border)]">
                 <ShieldCheck className="mx-auto mb-6 text-slate-200" size={60} />
                 <h3 className="text-xl font-black text-slate-400 uppercase tracking-widest">No Active Sessions</h3>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-12">
            {/* Learning Curve Chart */}
            {growthData.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white p-12 rounded-[3.5rem] border border-[var(--border)] shadow-xl shadow-indigo-100/50"
              >
                <div className="flex justify-between items-center mb-10">
                  <div>
                    <h3 className="text-xl font-black uppercase tracking-tight text-[var(--text-main)]">Your Learning Curve</h3>
                    <p className="text-[10px] font-black text-[var(--text-sub)] uppercase tracking-widest mt-1">Longitudinal performance analysis</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-[var(--primary)]">{Math.round(growthData.reduce((acc, v) => acc + v.score, 0) / growthData.length)}%</p>
                    <p className="text-[9px] font-black text-[var(--text-sub)] uppercase tracking-widest">Aggregate Score</p>
                  </div>
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={growthData}>
                      <defs>
                        <linearGradient id="colorGrowth" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="iteration" hide />
                      <YAxis domain={[0, 100]} hide />
                      <Tooltip 
                        contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontWeight: 'bold', fontSize: '10px' }}
                        formatter={(val: any) => [`${val}%`, 'Score']}
                      />
                      <Area type="monotone" dataKey="score" stroke="var(--primary)" strokeWidth={4} fillOpacity={1} fill="url(#colorGrowth)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>
            )}

            <div className="space-y-6">
              {submissions.map((sub) => {
                 const testData = tests.find(t => t.id === sub.testId);
                 return (
                   <motion.div 
                      layout
                      key={sub.id} 
                      className="bg-white p-8 rounded-[2.5rem] border border-[var(--border)] flex flex-wrap items-center justify-between gap-8 group hover:border-[var(--primary)] transition-all shadow-sm"
                   >
                      <div className="flex items-center gap-6">
                         <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-xl", sub.status === 'PASS' ? 'bg-emerald-500 shadow-emerald-100' : 'bg-rose-500 shadow-rose-100')}>
                            {sub.status === 'PASS' ? <Award size={28} /> : <Target size={28} />}
                         </div>
                         <div>
                            <p className="text-[10px] font-black text-[var(--text-sub)] uppercase tracking-[0.2em] mb-1">
                               {sub.submittedAt?.toDate().toLocaleDateString()} • {sub.studentRollNo}
                            </p>
                            <h4 className="text-xl font-black text-[var(--text-main)] italic">
                              {(testData?.title || 'External Assessment').slice(0, 40)}
                            </h4>
                         </div>
                      </div>

                      <div className="flex items-center gap-12">
                         <div className="text-center">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Percentile</p>
                            <p className="text-2xl font-black text-[var(--text-main)] tracking-tighter">{Math.round(sub.percentage || (sub.score/sub.total*100))}%</p>
                         </div>
                         
                         <div className="flex flex-col items-end gap-2">
                            <span className={cn(
                               "px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border",
                               sub.released ? "bg-indigo-50 text-indigo-600 border-indigo-100" : "bg-slate-50 text-slate-400 border-slate-100"
                            )}>
                               {sub.released ? 'Report Released' : 'Pending Review'}
                            </span>
                            {sub.released ? (
                              <button 
                                onClick={() => handleFullSheet(sub)}
                                disabled={loadingSheet}
                                className="px-6 py-2.5 bg-[var(--text-main)] text-white hover:bg-[var(--primary)] rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-50"
                              >
                                {loadingSheet ? <Loader2 className="animate-spin" size={14} /> : <Eye size={14} />} Full Sheet
                              </button>
                            ) : (
                              <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                 <Clock size={12} /> Contact Teacher
                              </div>
                            )}
                         </div>
                      </div>
                   </motion.div>
                 );
              })}
            </div>
          </div>
        )}
      </main>

      <AnimatePresence>
        {viewingResult && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-12">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setViewingResult(null)}
               className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
             />
             <motion.div
               initial={{ scale: 0.9, opacity: 0, y: 30 }}
               animate={{ scale: 1, opacity: 1, y: 0 }}
               exit={{ scale: 0.9, opacity: 0, y: 30 }}
               className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl sm:rounded-[3.5rem] shadow-2xl relative overflow-hidden flex flex-col"
             >
                <div className="bg-slate-900 p-10 text-white relative">
                   <button onClick={() => setViewingResult(null)} className="absolute top-8 right-8 text-white/40 hover:text-white transition-colors">
                      <X size={28} />
                   </button>
                   <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Candidate Evaluation Report</p>
                   <h3 className="text-3xl font-black italic tracking-tight uppercase border-b border-white/10 pb-6 mb-6">
                      Academic Response Sheet
                   </h3>
                   <div className="grid grid-cols-3 gap-6">
                      <div>
                         <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">Score Matrix</p>
                         <p className="text-xl font-black">{viewingResult.score} / {viewingResult.total}</p>
                      </div>
                      <div>
                         <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">Attainment</p>
                         <p className="text-xl font-black">{Math.round(viewingResult.percentage || (viewingResult.score/viewingResult.total*100))}%</p>
                      </div>
                      <div>
                         <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">Status</p>
                         <p className={cn("text-xl font-black", viewingResult.status === 'PASS' ? 'text-emerald-400' : 'text-rose-400')}>{viewingResult.status}</p>
                      </div>
                   </div>
                </div>

                <div className="flex-1 overflow-y-auto p-10 space-y-6 custom-scrollbar bg-slate-50">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4">Detailed Question Audit</h4>
                  {Object.entries(viewingResult.answers).map(([qId, answer]: [any, any], idx) => {
                    const qData = questions[qId];
                    const isCorrect = answer === qData?.answer;
                    return (
                      <div key={qId} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group">
                        {isCorrect ? (
                          <div className="absolute top-0 right-0 p-4 text-emerald-100">
                             <CheckCircle2 size={40} strokeWidth={1} />
                          </div>
                        ) : (
                          <div className="absolute top-0 right-0 p-4 text-rose-100">
                             <XCircle size={40} strokeWidth={1} />
                          </div>
                        )}
                        <div className="relative z-10">
                          <p className="text-[9px] font-black text-slate-300 uppercase mb-2">Item #{idx + 1}</p>
                          <MathRenderer content={qData?.text || 'Historical data point unavailable'} className="font-black text-slate-900 leading-tight mb-4 pr-12 text-lg" />
                          <div className="flex gap-8">
                             <div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Input</p>
                                <span className={cn("px-3 py-1 rounded-lg text-xs font-black", isCorrect ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600')}>{answer}</span>
                                {qData?.options?.[answer] && <MathRenderer content={qData.options[answer]} className="mt-2 text-[10px] font-medium opacity-70" />}
                             </div>
                             <div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Validation Key</p>
                                <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-black">{qData?.answer}</span>
                                {qData?.options?.[qData.answer] && <MathRenderer content={qData.options[qData.answer]} className="mt-2 text-[10px] font-medium opacity-70" />}
                             </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="p-10 border-t border-slate-100 flex items-center justify-center">
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">EndOfReport - Strictly Confidential Academic Data</p>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
