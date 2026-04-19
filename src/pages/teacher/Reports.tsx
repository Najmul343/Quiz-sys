import { useState, useEffect } from 'react';
import { db, auth } from '../../lib/firebase';
import { collection, query, where, getDocs, orderBy, doc, getDoc } from 'firebase/firestore';
import { motion } from 'framer-motion';
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
  LineChart as LineChartIcon
} from 'lucide-react';
import { cn } from '../../lib/utils';
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

export default function TeacherReports() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTestId, setSelectedTestId] = useState('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser?.uid || ''));
      const userData = userDoc.data();
      const collegeId = userData?.collegeId;

      if (!collegeId) return;

      // 1. Fetch tests by this teacher
      const testsQ = query(collection(db, 'tests'), where('teacherId', '==', auth.currentUser?.uid), where('collegeId', '==', collegeId));
      const testSnap = await getDocs(testsQ);
      const testList = testSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTests(testList);

      // 2. Fetch all submissions for this college
      const subQ = query(
        collection(db, 'submissions'), 
        where('collegeId', '==', collegeId),
        orderBy('submittedAt', 'desc')
      );
      const subSnap = await getDocs(subQ);
      const allSubs = subSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Filter to only show responses for current teacher's tests
      const teacherSubs = allSubs.filter((s: any) => testList.some((t: any) => t.id === s.testId));
      setSubmissions(teacherSubs);
      
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const filteredSubs = selectedTestId === 'all' 
    ? submissions 
    : submissions.filter(s => s.testId === selectedTestId);

  const stats = {
    avgScore: filteredSubs.length ? (filteredSubs.reduce((acc, s) => acc + (s.score/s.total), 0) / filteredSubs.length * 100).toFixed(1) : 0,
    totalStudents: new Set(filteredSubs.map(s => s.studentId)).size,
    passRate: filteredSubs.length ? ((filteredSubs.filter(s => s.status === 'PASS').length / filteredSubs.length) * 100).toFixed(1) : 0
  };

  const chartData = filteredSubs
    .slice()
    .sort((a, b) => (a.submittedAt?.seconds || 0) - (b.submittedAt?.seconds || 0))
    .reduce((acc: any[], sub) => {
      const date = sub.submittedAt?.toDate().toLocaleDateString() || 'N/A';
      const existing = acc.find(d => d.date === date);
      if (existing) {
        existing.score = Math.round((existing.score + (sub.score / sub.total) * 100) / 2);
      } else {
        acc.push({ date, score: Math.round((sub.score / sub.total) * 100) });
      }
      return acc;
    }, [])
    .slice(-10);

  if (loading) return <div className="h-64 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>;

  return (
    <div className="space-y-10 pb-20">
      {/* Header & Filter */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/40">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter italic">Intelligence Analytics</h2>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1">Cross-referencing student performance metrics</p>
        </div>
        
        <div className="flex gap-4 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <select 
              value={selectedTestId}
              onChange={e => setSelectedTestId(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-slate-50 rounded-2xl font-black text-[10px] uppercase tracking-widest outline-none border-2 border-transparent focus:border-indigo-600 appearance-none"
            >
              <option value="all">Global Aggregate</option>
              {tests.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {[
          { label: 'Avg Performance', value: stats.avgScore + '%', icon: Target, color: 'indigo' },
          { label: 'Network Reach', value: stats.totalStudents, icon: Users, color: 'emerald' },
          { label: 'Success Ratio', value: stats.passRate + '%', icon: TrendingUp, color: 'rose' },
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

      {/* Analysis Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/50">
          <div className="flex justify-between items-center mb-10">
            <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Growth Velocity</h3>
            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
               <TrendingUp size={20} />
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#4F46E5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="date" hide />
                <YAxis hide domain={[0, 100]} />
                <Tooltip 
                  contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  labelStyle={{ fontWeight: '900', textTransform: 'uppercase', fontSize: '10px' }}
                />
                <Area type="monotone" dataKey="score" stroke="#4F46E5" fillOpacity={1} fill="url(#colorScore)" strokeWidth={4} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900 border-none p-10 rounded-[3rem] shadow-2xl relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-12 opacity-10 text-white group-hover:scale-110 transition-transform duration-700">
              <ShieldCheck size={180} strokeWidth={1} />
           </div>
           <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4">Integrity Synopsis</p>
           <h3 className="text-3xl font-black text-white uppercase tracking-tighter mb-8 italic leading-tight">Secured Session<br/>Analysis</h3>
           <div className="space-y-4 relative z-10">
              <div className="flex items-center gap-4 text-white/60">
                 <div className="w-2 h-2 rounded-full bg-emerald-500" />
                 <span className="text-xs font-bold">{Math.round((filteredSubs.filter(s => (s.violations?.tabSwitches || 0) === 0).length / (filteredSubs.length || 1)) * 100)}% Integrity Compliance</span>
              </div>
              <div className="flex items-center gap-4 text-white/60">
                 <div className="w-2 h-2 rounded-full bg-amber-500" />
                 <span className="text-xs font-bold">{filteredSubs.filter(s => (s.violations?.tabSwitches || 0) > 0).length} Suspected Anomalies</span>
              </div>
           </div>
        </div>
      </div>

      {/* Detailed Table */}
      <div className="bg-white rounded-[3.5rem] border border-slate-100 shadow-2xl shadow-slate-300/40 p-12 overflow-hidden">
        <div className="flex justify-between items-center mb-10">
          <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Student Response Matrix</h3>
          <div className="flex gap-2">
             <div className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest">Live Updates Active</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Candidate</th>
                <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Evaluation</th>
                <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Raw Score</th>
                <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Integrity Status</th>
                <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredSubs.map((sub) => {
                const testRef = tests.find(t => t.id === sub.testId);
                const switchViolations = sub.violations?.tabSwitches || 0;

                return (
                  <motion.tr layout key={sub.id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="py-8">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center font-black text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                          {sub.studentName?.charAt(0) || 'S'}
                        </div>
                        <div>
                          <p className="font-black text-slate-800 uppercase text-sm tracking-tight">{sub.studentName || 'Unknown Student'}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">UID: {sub.studentId.slice(0, 8)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-8">
                      <p className="font-bold text-slate-600 text-sm">{testRef?.title || 'Unknown Test'}</p>
                      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400 font-bold uppercase">
                        <Calendar size={10} /> {sub.submittedAt?.toDate().toLocaleDateString()}
                      </div>
                    </td>
                    <td className="py-8">
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-black text-slate-800">{sub.score}</span>
                        <span className="text-slate-300 text-xs font-bold">/ {sub.total}</span>
                      </div>
                    </td>
                    <td className="py-8 text-center">
                      {switchViolations > 0 ? (
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-red-100">
                           <AlertTriangle size={14} /> {switchViolations} Violations
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-emerald-100">
                           <ShieldCheck size={14} /> Secured Access
                        </div>
                      )}
                    </td>
                    <td className="py-8 text-right">
                      <div className={cn(
                        "inline-block px-5 py-2.5 rounded-2xl font-black text-[11px] uppercase tracking-[0.1em] border-2",
                        sub.status === 'PASS' 
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700 shadow-lg shadow-emerald-50" 
                        : "bg-rose-50 border-rose-200 text-rose-700 shadow-lg shadow-rose-50"
                      )}>
                        {sub.status}
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          
          {filteredSubs.length === 0 && (
            <div className="py-32 text-center grayscale opacity-30">
               <Loader2 className="animate-spin text-slate-400 mx-auto mb-6" size={40} />
               <p className="font-black text-slate-400 uppercase tracking-[0.4em] text-xs">No Responses Logged</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
