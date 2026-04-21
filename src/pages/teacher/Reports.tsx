import { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../../lib/firebase';
import { collection, query, where, getDocs, orderBy, doc, getDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Target, 
  ArrowUpRight, 
  ArrowDownRight,
  Loader2,
  Calendar,
  Search,
  Filter,
  ShieldCheck,
  AlertTriangle,
  LineChart as LineChartIcon,
  CheckCircle2,
  XCircle,
  Eye,
  Share2,
  ChevronRight,
  User as UserIcon,
  X,
  FileText,
  Printer
} from 'lucide-react';
import { cn, getDirectImageUrl } from '../../lib/utils';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import MathRenderer from '../../components/MathRenderer';

export default function TeacherReports() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [questions, setQuestions] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [selectedTestId, setSelectedTestId] = useState('all');
  const [viewingSubmission, setViewingSubmission] = useState<any>(null);
  const [selectedSubs, setSelectedSubs] = useState<string[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentDirectory, setStudentDirectory] = useState<Record<string, any>>({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser?.uid || ''));
      const userData = userDoc.data();
      const collegeId = userData?.collegeId;

      if (!collegeId) return;

      // Parallelize queries
      const [testSnap, subSnap, studentSnap] = await Promise.all([
        getDocs(query(collection(db, 'tests'), where('teacherId', '==', auth.currentUser?.uid), where('collegeId', '==', collegeId))),
        getDocs(query(
          collection(db, 'submissions'), 
          where('collegeId', '==', collegeId),
          orderBy('submittedAt', 'desc')
        )),
        getDocs(query(collection(db, 'users'), where('role', '==', 'student'), where('collegeId', '==', collegeId)))
      ]);

      const testList = testSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTests(testList);

      const allSubs = subSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const teacherSubs = allSubs.filter((s: any) => testList.some((t: any) => t.id === s.testId));
      setSubmissions(teacherSubs);

      const studentMap: Record<string, any> = {};
      studentSnap.docs.forEach((studentDoc) => {
        studentMap[studentDoc.id] = { id: studentDoc.id, ...studentDoc.data() };
      });
      setStudentDirectory(studentMap);
      
      // Questions are now fetched on-demand in handleViewSubmission
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const [loadingSheet, setLoadingSheet] = useState(false);

  const handleViewSubmission = async (sub: any) => {
    setLoadingSheet(true);
    try {
      const qIds = Object.keys(sub.answers);
      const missingQIds = qIds.filter(id => !questions[id]);
      
      if (missingQIds.length > 0) {
        // Fetch only specific questions needed
        const qDocs = await Promise.all(missingQIds.map(id => getDoc(doc(db, 'questions', id))));
        const newQs: Record<string, any> = { ...questions };
        qDocs.forEach(d => { if(d.exists()) newQs[d.id] = d.data(); });
        setQuestions(newQs);
      }
      setViewingSubmission(sub);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSheet(false);
    }
  };

  const handleReleaseResults = async (ids: string[], released: boolean) => {
    try {
      const batch = writeBatch(db);
      ids.forEach(id => {
        batch.update(doc(db, 'submissions', id), { released });
      });
      await batch.commit();
      setSubmissions(prev => prev.map(s => ids.includes(s.id) ? { ...s, released } : s));
      setSelectedSubs([]);
    } catch (e) {
      console.error(e);
      alert("Failed to update status.");
    }
  };

  const getStudentDisplayName = (studentId: string, fallback?: string) => {
    const student = studentDirectory[studentId];
    return student?.officialName || student?.displayName || fallback || 'Student';
  };

  const filteredSubs = useMemo(() => (selectedTestId === 'all'
    ? (selectedStudentId ? submissions.filter(s => s.studentId === selectedStudentId) : submissions)
    : submissions.filter(s => s.testId === selectedTestId))
    .sort((a, b) => (a.studentRollNo || '').localeCompare(b.studentRollNo || '', undefined, { numeric: true })), [selectedStudentId, selectedTestId, submissions]);

  const studentList = useMemo(() => Array.from(new Set(submissions.map(s => JSON.stringify({id: s.studentId, name: getStudentDisplayName(s.studentId, s.studentName), roll: s.studentRollNo}))))
    .map(s => JSON.parse(s as string))
    .filter(s => s.name.toLowerCase().includes(studentSearch.toLowerCase()) || s.roll?.toLowerCase().includes(studentSearch.toLowerCase()))
    .sort((a, b) => (a.roll || '').localeCompare(b.roll || '', undefined, { numeric: true })), [studentSearch, submissions, studentDirectory]);

  const getGrowthData = (studentId: string) => {
    return submissions
      .filter(s => s.studentId === studentId)
      .sort((a, b) => (a.submittedAt?.seconds || 0) - (b.submittedAt?.seconds || 0))
      .map((s, i) => ({
        iteration: i + 1,
        score: Math.round(s.percentage || (s.score/s.total*100)),
        test: tests.find(t => t.id === s.testId)?.title || 'Test'
      }));
  };

  const getPracticeStats = (studentId: string) => {
    const practiceSubs = submissions.filter(s => s.studentId === studentId && s.isPractice);
    return {
      count: practiceSubs.length,
      avgAttempted: practiceSubs.length ? (practiceSubs.reduce((acc, s) => acc + (s.attempted || 0), 0) / practiceSubs.length).toFixed(0) : 0
    };
  };

  const stats = useMemo(() => ({
    avgScore: filteredSubs.length ? (filteredSubs.reduce((acc, s) => acc + (s.percentage || (s.score/s.total*100)), 0) / filteredSubs.length).toFixed(1) : 0,
    totalStudents: new Set(filteredSubs.map(s => s.studentId)).size,
    passRate: filteredSubs.length ? ((filteredSubs.filter(s => s.status === 'PASS').length / filteredSubs.length) * 100).toFixed(1) : 0
  }), [filteredSubs]);

  if (loading) return <div className="h-64 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>;

  return (
    <div className="space-y-10 pb-20">
      {/* Header & Filter */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/40">
        <div className="flex-1">
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter italic">Academic Ledger</h2>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1">Cross-verify student assessment metrics & release sheets</p>
        </div>
        
          <div className="flex gap-2">
            <button 
              onClick={() => window.print()}
              className="px-6 py-4 bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl flex items-center gap-2 shadow-lg hover:bg-slate-800 transition-all"
            >
              <Printer size={16} /> Print Class Card
            </button>
            {selectedSubs.length > 0 && (
            <div className="flex gap-2">
              <button 
                onClick={() => handleReleaseResults(selectedSubs, true)}
                className="px-6 py-4 bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl flex items-center gap-2 shadow-lg shadow-emerald-100"
              >
                <Share2 size={16} /> Release ({selectedSubs.length})
              </button>
              <button 
                onClick={() => handleReleaseResults(selectedSubs, false)}
                className="px-6 py-4 bg-slate-100 text-slate-600 font-black text-[10px] uppercase tracking-widest rounded-2xl flex items-center gap-2"
              >
                <XCircle size={16} /> Hide
              </button>
            </div>
          )}
          <div className="relative flex-1 md:w-64">
            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <select 
              value={selectedTestId}
              onChange={e => setSelectedTestId(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-slate-50 rounded-2xl font-black text-[10px] uppercase tracking-widest outline-none border-2 border-transparent focus:border-indigo-600 appearance-none shadow-inner"
            >
              <option value="all">Consolidated View</option>
              {tests.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {[
          { label: 'Avg Performance', value: stats.avgScore + '%', icon: Target, color: 'indigo' },
          { label: 'Enrolled Attempted', value: stats.totalStudents, icon: Users, color: 'emerald' },
          { label: 'Pass Percentage', value: stats.passRate + '%', icon: ShieldCheck, color: 'blue' },
        ].map((kpi, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={kpi.label} 
            className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/50"
          >
             <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center mb-6 shadow-inner bg-slate-50", `text-${kpi.color}-600`)}>
                <kpi.icon size={28} />
             </div>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{kpi.label}</p>
             <h4 className="text-4xl font-black text-slate-900 tracking-tighter italic">{kpi.value}</h4>
          </motion.div>
        ))}
      </div>

      {/* Growth Tracking & Selection */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1 bg-white p-5 sm:p-8 rounded-[2rem] sm:rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/40 space-y-4 sm:space-y-6">
           <div>
              <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Growth Monitor</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Select student to analyze delta</p>
           </div>
           <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input 
                type="text" 
                placeholder="Find Student..." 
                value={studentSearch}
                onChange={e => setStudentSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 rounded-xl text-[10px] font-black uppercase outline-none focus:bg-white focus:ring-2 focus:ring-indigo-600 transition-all"
              />
           </div>
           <div className="space-y-2 max-h-[320px] sm:max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              <button 
                onClick={() => setSelectedStudentId(null)}
                className={cn(
                  "w-full p-3 sm:p-4 rounded-2xl text-left border transition-all",
                  selectedStudentId === null ? "bg-indigo-600 border-indigo-600 text-white shadow-lg" : "bg-slate-50 border-transparent text-slate-500 hover:bg-slate-100"
                )}
              >
                <div className="text-[9px] font-black uppercase tracking-widest">Global Overview</div>
              </button>
              {studentList.map(s => (
                <button 
                  key={s.id}
                  onClick={() => setSelectedStudentId(s.id)}
                  className={cn(
                    "w-full p-3 sm:p-4 rounded-2xl text-left border transition-all",
                    selectedStudentId === s.id ? "bg-indigo-600 border-indigo-600 text-white shadow-lg" : "bg-white border-slate-100 text-slate-600 hover:border-indigo-600 shadow-sm"
                  )}
                >
                  <p className="font-black text-[10px] sm:text-[11px] uppercase tracking-tight leading-snug">{s.name}</p>
                  <p className={cn("text-[9px] font-bold mt-1", selectedStudentId === s.id ? "text-indigo-200" : "text-slate-400")}>Roll: {s.roll || 'N/A'}</p>
                </button>
              ))}
           </div>
        </div>

        <div className="lg:col-span-3 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/40 relative min-h-[400px]">
           {!selectedStudentId ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-12 space-y-6">
                 <div className="w-20 h-20 bg-indigo-50 rounded-[2rem] flex items-center justify-center text-indigo-600 shadow-inner">
                    <LineChartIcon size={40} />
                 </div>
                 <h4 className="text-2xl font-black uppercase tracking-tighter italic text-slate-800">Performance Intelligence</h4>
                 <p className="text-slate-500 font-bold max-w-sm">Select a specific candidate from the roster to view their historical growth trajectory and academic delta charts.</p>
              </div>
           ) : (
              <div className="h-full">
                 <div className="flex justify-between items-center mb-8">
                    <div>
                      <h4 className="text-2xl font-black uppercase tracking-tighter italic text-slate-800">Growth Analysis</h4>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Longitudinal Performance Delta</p>
                    </div>
                    {/* Practice Summary */}
                    {(() => {
                      const pStats = getPracticeStats(selectedStudentId || '');
                      return (
                        <div className="hidden sm:flex gap-6">
                          <div className="text-right border-r border-slate-100 pr-6">
                             <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest leading-none mb-1">Practice Runs</p>
                             <p className="text-xl font-black text-slate-900 leading-none">{pStats.count}</p>
                          </div>
                          <div className="text-right">
                             <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest leading-none mb-1">Avg Attempted</p>
                             <p className="text-xl font-black text-slate-900 leading-none">{pStats.avgAttempted}</p>
                          </div>
                        </div>
                      );
                    })()}
                    <div className="text-right">
                       <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest leading-none">Status</p>
                       <p className="text-xl font-black text-slate-900 uppercase">Candidate #{(studentSearch || '8').slice(-2)}</p>
                    </div>
                 </div>
                 <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                       <AreaChart data={getGrowthData(selectedStudentId || '')}>
                          <defs>
                            <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                              <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="iteration" hide />
                          <YAxis domain={[0, 100]} hide />
                          <Tooltip 
                            contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontWeight: 'bold', fontSize: '10px' }}
                            formatter={(val: any) => [`${val}%`, 'Score']}
                          />
                          <Area type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={4} fillOpacity={1} fill="url(#colorScore)" />
                       </AreaChart>
                    </ResponsiveContainer>
                 </div>
              </div>
           )}
        </div>
      </div>

      {/* Response Matrix Table */}
      <div className="bg-white rounded-[3.5rem] border border-slate-100 shadow-2xl shadow-slate-300/40 p-12 overflow-hidden">
        <div className="flex justify-between items-center mb-10 px-4">
          <div className="flex items-center gap-4">
            <div className="w-1.5 h-8 bg-indigo-600 rounded-full" />
            <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Candidacy Performance Ledger</h3>
          </div>
          <button 
            onClick={() => setSelectedSubs(selectedSubs.length === filteredSubs.length ? [] : filteredSubs.map(s => s.id))}
            className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-800"
          >
            {selectedSubs.length === filteredSubs.length ? 'Deselect All' : 'Select All Class'}
          </button>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 pb-6 w-10"></th>
                <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Roll No / Student</th>
                <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Stats (R/W/A)</th>
                <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Percentile</th>
                <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Visibility</th>
                <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Verification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredSubs.map((sub) => {
                const isSelected = selectedSubs.includes(sub.id);
                return (
                  <motion.tr layout key={sub.id} className={cn("group transition-all", isSelected ? 'bg-indigo-50/30' : 'hover:bg-slate-50/50')}>
                    <td className="px-4 py-8">
                       <input 
                         type="checkbox" 
                         checked={isSelected}
                         onChange={() => setSelectedSubs(prev => isSelected ? prev.filter(id => id !== sub.id) : [...prev, sub.id])}
                         className="w-5 h-5 rounded-lg accent-indigo-600 cursor-pointer"
                       />
                    </td>
                    <td className="py-8">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center font-black text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                          {sub.studentRollNo || '00'}
                        </div>
                        <div>
                          <p className="font-black text-slate-800 uppercase text-base tracking-tight">{sub.studentName || 'Unvetted Name'}</p>
                          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">{sub.studentRollNo || 'External/Anon'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-8 text-center">
                      <div className="inline-flex gap-2">
                        <span className="text-sm font-black text-emerald-600">{sub.rightAnswers || sub.score}</span>
                        <span className="text-slate-300">/</span>
                        <span className="text-sm font-black text-rose-500">{sub.wrongAnswers || 0}</span>
                        <span className="text-slate-300">/</span>
                        <span className="text-sm font-black text-slate-400">{sub.attempted || sub.total}</span>
                      </div>
                    </td>
                    <td className="py-8 text-center">
                      <div className="radial-progress text-indigo-600 opacity-80" style={{ "--value": sub.percentage || (sub.score/sub.total*100), "--size": "2.5rem", "--thickness": "4px" } as any}>
                        <span className="text-[10px] font-black">{Math.round(sub.percentage || (sub.score/sub.total*100))}%</span>
                      </div>
                    </td>
                    <td className="py-8">
                       <button 
                         onClick={() => handleReleaseResults([sub.id], !sub.released)}
                         className={cn(
                           "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border flex items-center gap-2",
                           sub.released ? "bg-emerald-50 text-emerald-600 border-emerald-100 shadow-inner" : "bg-slate-50 text-slate-400 border-slate-100"
                         )}
                       >
                         {sub.released ? <ShieldCheck size={14} /> : <XCircle size={14} />}
                         {sub.released ? 'Released' : 'Private'}
                       </button>
                    </td>
                    <td className="py-8 text-right">
                       <button 
                         disabled={loadingSheet}
                         onClick={() => handleViewSubmission(sub)}
                         className="p-4 bg-slate-900 text-white rounded-[1.5rem] hover:bg-indigo-600 transition-all shadow-xl shadow-slate-200 active:scale-95 disabled:opacity-50"
                       >
                         {loadingSheet ? <Loader2 className="animate-spin" size={18} /> : <Eye size={18} />}
                       </button>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          
          {filteredSubs.length === 0 && (
            <div className="py-32 text-center opacity-30 italic">
               <FileText className="mx-auto mb-6 text-slate-300" size={60} />
               <p className="font-black text-slate-400 uppercase tracking-[0.4em] text-xs">Awaiting Class Submissions</p>
            </div>
          )}
        </div>
      </div>

      {/* Submission Detail Modal */}
      <AnimatePresence>
        {viewingSubmission && (
          <div className="fixed inset-0 z-[110] flex items-center justify-end">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setViewingSubmission(null)}
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="bg-white w-full max-w-2xl h-full relative z-10 shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="bg-slate-900 p-12 text-white relative">
                 <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Student Identity Verified</p>
                      <h2 className="text-4xl font-black uppercase tracking-tight italic mb-6">
                        {viewingSubmission.studentName}
                      </h2>
                    </div>
                    <div className="flex gap-4">
                      <button 
                        onClick={() => window.print()}
                        className="p-4 bg-emerald-600 text-white rounded-[1.5rem] hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 flex items-center gap-2"
                      >
                         <Printer size={18} />
                         <span className="text-[10px] font-black uppercase">Print Response Sheet</span>
                      </button>
                      <button onClick={() => setViewingSubmission(null)} className="p-4 bg-white/10 text-white/40 hover:text-white rounded-2xl transition-colors">
                        <X size={24} />
                      </button>
                    </div>
                 </div>
                 <div className="flex gap-4">
                    <div className="px-4 py-2 bg-white/10 rounded-xl text-[10px] font-black uppercase">Roll: {viewingSubmission.studentRollNo}</div>
                    <div className={cn("px-4 py-2 rounded-xl text-[10px] font-black uppercase", viewingSubmission.status === 'PASS' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400')}>
                      {viewingSubmission.status}
                    </div>
                 </div>
              </div>

              <div className="flex-1 overflow-y-auto p-12 space-y-12 custom-scrollbar">
                {/* Score Breakdown Area */}
                <div className="grid grid-cols-2 gap-4">
                   <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Correct Identity Match</p>
                      <p className="text-2xl font-black text-emerald-600">{viewingSubmission.rightAnswers} <span className="text-sm text-slate-300">points</span></p>
                   </div>
                   <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Divergent Response</p>
                      <p className="text-2xl font-black text-rose-500">{viewingSubmission.wrongAnswers} <span className="text-sm text-slate-300">deltas</span></p>
                   </div>
                </div>

                {/* Response Matrix Detailed List */}
                <div className="space-y-6">
                  <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400 border-b border-slate-100 pb-4">Evaluation Audit Log</h4>
                  {Object.entries(viewingSubmission.answers).map(([qId, answer]: [any, any]) => {
                    const qData = questions[qId];
                    const isCorrect = answer === qData?.answer;
                    return (
                      <div key={qId} className="group p-6 bg-slate-50 rounded-3xl border border-transparent hover:border-slate-200 transition-all">
                        <div className="flex justify-between items-start gap-4 mb-4">
                          <div className="flex-1">
                            <MathRenderer content={qData?.text || 'Deleted Question Data'} className="font-black text-slate-900 leading-tight text-lg" />
                            {qData?.imageUrl && (
                              <div className="mt-4 w-full h-32 bg-white rounded-xl overflow-hidden border border-slate-100">
                                <img src={getDirectImageUrl(qData.imageUrl)} alt="Question" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                              </div>
                            )}
                          </div>
                          {isCorrect ? <CheckCircle2 className="text-emerald-500 flex-shrink-0" /> : <XCircle className="text-rose-500 flex-shrink-0" />}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                           <div className="text-[10px] uppercase tracking-widest">
                              <span className="text-slate-400 font-bold">Student Res:</span> 
                              <span className={cn("ml-2 font-black", isCorrect ? 'text-emerald-600' : 'text-rose-600')}>{answer}</span>
                              {qData?.options?.[answer] && (
                                <div className="mt-2">
                                  <MathRenderer content={qData.options[answer]} className="text-[9px] lowercase opacity-60" />
                                  {qData.optionImages?.[answer] && (
                                    <div className="mt-2 w-full h-20 bg-white rounded-lg border border-slate-100 overflow-hidden">
                                      <img src={getDirectImageUrl(qData.optionImages[answer])} alt={`Opt ${answer}`} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                                    </div>
                                  )}
                                </div>
                              )}
                           </div>
                           <div className="text-[10px] uppercase tracking-widest">
                              <span className="text-slate-400 font-bold">Key Matrix:</span> 
                              <span className="ml-2 font-black text-indigo-600">{qData?.answer}</span>
                              {qData?.options?.[qData.answer] && (
                                <div className="mt-2">
                                  <MathRenderer content={qData.options[qData.answer]} className="text-[9px] lowercase opacity-60" />
                                  {qData.optionImages?.[qData.answer] && (
                                    <div className="mt-2 w-full h-20 bg-white rounded-lg border border-slate-100 overflow-hidden">
                                      <img src={getDirectImageUrl(qData.optionImages[qData.answer])} alt={`Opt ${qData.answer}`} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                                    </div>
                                  )}
                                </div>
                              )}
                           </div>
                        </div>
                        {qData?.explanation && (
                          <div className="mt-4 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                             <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">Explanation</p>
                             <MathRenderer content={qData.explanation} className="text-xs text-indigo-900" />
                             {qData.explanationImageUrl && (
                               <div className="mt-2 w-full h-32 bg-white rounded-xl border border-indigo-100 overflow-hidden">
                                  <img src={getDirectImageUrl(qData.explanationImageUrl)} alt="Explanation" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                               </div>
                             )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div className="p-12 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                 <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Aggregate Perception</p>
                    <p className="text-xl font-black text-slate-900">{viewingSubmission.percentage}% Success Ratio</p>
                 </div>
                 <button 
                   onClick={() => handleReleaseResults([viewingSubmission.id], !viewingSubmission.released)}
                   className={cn(
                     "px-10 py-5 rounded-[2rem] font-black uppercase tracking-widest text-xs shadow-2xl transition-all",
                     viewingSubmission.released ? "bg-white text-emerald-600 border-2 border-emerald-100" : "bg-indigo-600 text-white shadow-indigo-100"
                   )}
                 >
                   {viewingSubmission.released ? 'Revoke Access' : 'Release to Student'}
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
