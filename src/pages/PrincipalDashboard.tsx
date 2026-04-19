import { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, getDocs, where, addDoc, serverTimestamp, doc, getDoc, setDoc, orderBy, limit } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  School, 
  BookOpen, 
  TrendingUp, 
  ArrowRight, 
  Plus, 
  Search, 
  Loader2,
  Filter,
  BarChart3,
  LogOut,
  Settings,
  ShieldCheck
} from 'lucide-react';
import { cn } from '../lib/utils';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';

export default function PrincipalDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalTeachers: 0,
    totalStudents: 0,
    totalTests: 0,
    overallPassRate: 0,
    totalSubmissions: 0
  });
  const [loading, setLoading] = useState(true);
  const [collegeData, setCollegeData] = useState<any>(null);
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [showClassModal, setShowClassModal] = useState(false);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);
  const [newTeacher, setNewTeacher] = useState({ name: '', email: '' });
  const [newClass, setNewClass] = useState({ name: '', teacherId: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser?.uid || ''));
      const userData = userDoc.data();
      
      if (userData?.collegeId) {
        const cSnap = await getDoc(doc(db, 'colleges', userData.collegeId));
        setCollegeData({ id: cSnap.id, ...cSnap.data() });

        // 1. Teachers
        const teachersQ = query(collection(db, 'users'), where('collegeId', '==', userData.collegeId), where('role', '==', 'teacher'));
        const teachersSnap = await getDocs(teachersQ);
        const teacherList = teachersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setTeachers(teacherList);
        
        // 2. Students
        const studentsQ = query(collection(db, 'users'), where('collegeId', '==', userData.collegeId), where('role', '==', 'student'));
        const studentsSnap = await getDocs(studentsQ);

        // 3. Tests
        const testsQ = query(collection(db, 'tests'), where('collegeId', '==', userData.collegeId));
        const testsSnap = await getDocs(testsQ);

        // 4. Submissions (Recent)
        const subQ = query(
          collection(db, 'submissions'), 
          where('collegeId', '==', userData.collegeId),
          orderBy('submittedAt', 'desc'),
          limit(5)
        );
        const subSnap = await getDocs(subQ);
        const subList = subSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setRecentSubmissions(subList);

        // 5. Global Submissions for stats
        const allSubQ = query(collection(db, 'submissions'), where('collegeId', '==', userData.collegeId));
        const allSubSnap = await getDocs(allSubQ);
        const passCount = allSubSnap.docs.filter(d => d.data().status === 'PASS').length;

        setStats({
          totalTeachers: teachersSnap.size,
          totalStudents: studentsSnap.size,
          totalTests: testsSnap.size,
          overallPassRate: allSubSnap.size ? Math.round((passCount / allSubSnap.size) * 100) : 0,
          totalSubmissions: allSubSnap.size
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTeacher = async () => {
    if (!newTeacher.name || !newTeacher.email || !collegeData) return;
    setSaving(true);
    try {
       const teacherId = newTeacher.email.replace(/[^a-zA-Z0-9]/g, '_');
       await setDoc(doc(db, 'users', teacherId), {
         displayName: newTeacher.name,
         email: newTeacher.email,
         role: 'teacher',
         collegeId: collegeData.id,
         createdAt: serverTimestamp()
       });
       setShowTeacherModal(false);
       setNewTeacher({ name: '', email: '' });
       fetchDashboardData();
    } catch (e) {
       console.error(e);
    } finally {
       setSaving(false);
    }
  };

  const handleCreateClass = async () => {
    if (!newClass.name || !newClass.teacherId || !collegeData) return;
    setSaving(true);
    try {
       await addDoc(collection(db, 'classes'), {
         name: newClass.name,
         teacherId: newClass.teacherId,
         collegeId: collegeData.id,
         createdAt: serverTimestamp()
       });
       setShowClassModal(false);
       setNewClass({ name: '', teacherId: '' });
       fetchDashboardData();
    } catch (e) {
       console.error(e);
    } finally {
       setSaving(false);
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-emerald-600" /></div>;

  return (
    <div className="min-h-screen bg-[#FDFDFD]">
      {/* Navigation */}
      <nav className="h-20 bg-white border-b border-slate-100 px-8 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-100">
            <School size={28} />
          </div>
          <div>
            <h1 className="font-black text-xl uppercase tracking-tighter text-slate-800">{collegeData?.name || 'Principal Dashboard'}</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Institutional Oversight Panel</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <button 
            onClick={() => signOut(auth)}
            className="flex items-center gap-2 px-6 py-3 bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-600 font-black rounded-2xl transition-all uppercase tracking-widest text-[10px]"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </nav>

      <main className="p-12 max-w-7xl mx-auto space-y-12">
        {/* Dynamic Greeting */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">Academic Health Monitor</h2>
            <p className="text-slate-500 font-bold mt-1">Institutional summary for the current term</p>
          </div>
          <div className="flex gap-4">
             <button className="px-6 py-3 bg-white border-2 border-slate-100 hover:border-emerald-600 text-slate-700 font-black rounded-2xl transition-all uppercase tracking-widest text-[10px] flex items-center gap-2">
                <BarChart3 size={16} /> Export Reports
             </button>
             <button className="px-6 py-3 bg-emerald-600 text-white font-black rounded-2xl transition-all uppercase tracking-widest text-[10px] flex items-center gap-2">
                <Settings size={16} /> Settings
             </button>
          </div>
        </div>

        {/* Big Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {[
            { label: 'Network Teachers', value: stats.totalTeachers, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50' },
            { label: 'Enrollment', value: stats.totalStudents, icon: School, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Exams Deployed', value: stats.totalTests, icon: BookOpen, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Avg Pass Rate', value: stats.overallPassRate + '%', icon: TrendingUp, color: 'text-rose-600', bg: 'bg-rose-50' },
          ].map((item, i) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              key={item.label} 
              className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40"
            >
              <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-6 shadow-inner", item.bg, item.color)}>
                <item.icon size={24} />
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.label}</p>
              <p className="text-3xl font-black text-slate-800 tracking-tighter">{item.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Main Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Activity */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/50">
              <div className="flex justify-between items-center mb-10">
                <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Faculty Roster</h3>
                <button 
                  onClick={() => setShowTeacherModal(true)}
                  className="text-[10px] font-black text-emerald-600 uppercase tracking-widest hover:underline px-4 py-2 bg-emerald-50 rounded-lg"
                >
                  Register Teacher
                </button>
              </div>
              
              <div className="space-y-6">
                {teachers.map((teacher) => (
                  <div key={teacher.id} className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl group hover:bg-white hover:shadow-xl hover:shadow-slate-100 transition-all cursor-pointer">
                    <div className="flex items-center gap-6">
                      <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm text-slate-400 group-hover:text-emerald-600 transition-all">
                        <Users size={24} />
                      </div>
                      <div>
                        <p className="font-black text-slate-800 uppercase text-sm tracking-tight">{teacher.displayName}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{teacher.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Authorization</p>
                       <p className="font-black text-emerald-600 uppercase text-xs">Vetted Access</p>
                    </div>
                  </div>
                ))}

                {teachers.length === 0 && (
                  <div className="py-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs grayscale">
                    No Faculty Records Found
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/50">
              <div className="flex justify-between items-center mb-10">
                <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Live Response Feed</h3>
              </div>
              
              <div className="space-y-4">
                {recentSubmissions.map((sub) => (
                  <div key={sub.id} className="p-4 bg-slate-50 rounded-2xl flex justify-between items-center">
                    <div>
                      <p className="font-black text-slate-800 uppercase text-[11px] leading-tight">{sub.studentName}</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Score: {sub.score}/{sub.total}</p>
                    </div>
                    <div className={cn(
                      "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest",
                      sub.status === 'PASS' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                    )}>
                      {sub.status}
                    </div>
                  </div>
                ))}
                
                {recentSubmissions.length === 0 && (
                   <div className="py-10 text-center text-slate-400 uppercase tracking-widest text-[10px] font-bold">Waiting for deployment data...</div>
                )}
              </div>
            </div>
          </div>

          {/* Quick Controls */}
          <div className="space-y-8">
            <div className="bg-slate-900 p-10 rounded-[3rem] text-white shadow-2xl shadow-slate-300">
               <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
                    <ShieldCheck className="text-emerald-400" size={24} />
                  </div>
                  <div>
                    <h4 className="font-black text-lg uppercase tracking-tight">Access Control</h4>
                    <p className="text-[10px] text-emerald-400/80 font-black uppercase tracking-widest">Admin Actions</p>
                  </div>
               </div>
               <div className="space-y-4">
                  <button 
                    onClick={() => setShowTeacherModal(true)}
                    className="w-full p-6 bg-white/5 hover:bg-white/10 rounded-3xl border border-white/10 flex items-center justify-between transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <Plus className="text-emerald-400" size={20} />
                      <span className="font-black text-sm uppercase tracking-tight">Register Teacher</span>
                    </div>
                    <ArrowRight size={16} className="text-white/20 group-hover:text-white transition-all transform group-hover:translate-x-1" />
                  </button>
                  <button 
                    onClick={() => setShowClassModal(true)}
                    className="w-full p-6 bg-white/5 hover:bg-white/10 rounded-3xl border border-white/10 flex items-center justify-between transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <School className="text-indigo-400" size={20} />
                      <span className="font-black text-sm uppercase tracking-tight">Initiate Class</span>
                    </div>
                    <ArrowRight size={16} className="text-white/20 group-hover:text-white transition-all transform group-hover:translate-x-1" />
                  </button>
               </div>
            </div>

            <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/50">
               <h4 className="font-black text-slate-800 uppercase tracking-tight mb-6">Integrity Incidents</h4>
               <div className="space-y-4">
                  {[1,2].map(i => (
                    <div key={i} className="flex gap-4 p-4 border border-slate-50 rounded-2xl bg-slate-50/50">
                      <div className="w-2 h-2 rounded-full bg-rose-500 mt-2 shrink-0 animate-pulse" />
                      <div>
                        <p className="text-xs font-bold text-slate-700">Tab Exit detected in Quiz #422</p>
                        <p className="text-[10px] text-slate-400 font-bold mt-1">Student UID: ...af29 | 2m ago</p>
                      </div>
                    </div>
                  ))}
               </div>
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {showTeacherModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowTeacherModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-lg rounded-[3.5rem] p-12 relative shadow-2xl">
              <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-8 italic text-center">Faculty Credentialing</h3>
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Teacher Full Name</label>
                  <input type="text" value={newTeacher.name} onChange={e => setNewTeacher({...newTeacher, name: e.target.value})} className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-emerald-600 rounded-2xl outline-none font-bold" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Enterprise Email</label>
                  <input type="email" value={newTeacher.email} onChange={e => setNewTeacher({...newTeacher, email: e.target.value})} className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-emerald-600 rounded-2xl outline-none font-bold" />
                </div>
                <button onClick={handleAddTeacher} disabled={saving} className="w-full py-6 bg-slate-900 text-white font-black rounded-3xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-3">
                  {saving ? <Loader2 className="animate-spin" /> : <ShieldCheck size={20} />} AUTHENTICATE & REGISTER
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showClassModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowClassModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-lg rounded-[3.5rem] p-12 relative shadow-2xl">
              <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-8 italic text-center">Classroom Initiation</h3>
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Class Assignment Name</label>
                  <input type="text" value={newClass.name} onChange={e => setNewClass({...newClass, name: e.target.value})} className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-emerald-600 rounded-2xl outline-none font-bold" placeholder="e.g. Mechanical 2nd Year" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Assign Faculty Member</label>
                  <select value={newClass.teacherId} onChange={e => setNewClass({...newClass, teacherId: e.target.value})} className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-emerald-600 rounded-2xl outline-none font-bold appearance-none">
                    <option value="">Select Instructor...</option>
                    {teachers.map(t => <option key={t.id} value={t.id}>{t.displayName}</option>)}
                  </select>
                </div>
                <button onClick={handleCreateClass} disabled={saving} className="w-full py-6 bg-slate-900 text-white font-black rounded-3xl hover:bg-indigo-600 transition-all flex items-center justify-center gap-3">
                  {saving ? <Loader2 className="animate-spin" /> : <School size={20} />} DEPLOY CLASSROOM
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
