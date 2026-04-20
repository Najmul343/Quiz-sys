import { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, getDocs, where, addDoc, serverTimestamp, doc, getDoc, setDoc, limit, deleteDoc, getCountFromServer, updateDoc } from 'firebase/firestore';
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
  ShieldCheck,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  UserCheck,
  CalendarDays,
  Clock3
} from 'lucide-react';
import { cn } from '../lib/utils';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

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

import QuestionBank from './teacher/QuestionBank';
import TestCreator from './teacher/TestCreator';
import TeacherReports from './teacher/Reports';

export default function PrincipalDashboard() {
  const navigate = useNavigate();
  const { profile } = useAuth();
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
  const [students, setStudents] = useState<any[]>([]);
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);
  const [newTeacher, setNewTeacher] = useState({ name: '', email: '' });
  const [editingTeacher, setEditingTeacher] = useState<any>(null);
  const [newClass, setNewClass] = useState({ name: '', teacherId: '' });
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'bank' | 'tests' | 'reports'>('dashboard');
  const [saving, setSaving] = useState(false);
  const [performanceData, setPerformanceData] = useState<any[]>([]);
  const [teacherMetrics, setTeacherMetrics] = useState<Record<string, any>>({});
  const [attendanceOverview, setAttendanceOverview] = useState({ date: '', present: 0, late: 0, absent: 0, pending: 0 });
  const [attendanceDate, setAttendanceDate] = useState(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10));
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, 'present' | 'absent' | 'late'>>({});
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceSavingStudentId, setAttendanceSavingStudentId] = useState<string | null>(null);
  const [testOverview, setTestOverview] = useState<any[]>([]);
  const [settings, setSettings] = useState({ collegeName: '', location: '' });
  const [status, setStatus] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [confirmDeleteTeacher, setConfirmDeleteTeacher] = useState<string | null>(null);

  const getAttendanceDocId = (collegeId: string, date: string, studentId: string) => `${collegeId}_${date}_${studentId}`;
  const sanitizeLegacyDocId = (value?: string | null) => (value || '').toLowerCase().trim().replace(/[^a-zA-Z0-9]/g, '_');
  const dedupeById = <T extends { id: string }>(items: T[]) => Array.from(new Map(items.map((item) => [item.id, item])).values());
  const teacherScopeIds = Array.from(
    new Set(
      teachers.flatMap((teacher: any) => [teacher.id, teacher.uid, sanitizeLegacyDocId(teacher.email)]).filter(
        (value): value is string => !!value
      )
    )
  );

  const getAttendanceErrorMessage = (error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('missing or insufficient permissions')) {
      return "Attendance permissions are blocked in Firestore for this account.";
    }
    return fallback;
  };

  useEffect(() => {
    if (status) {
      const timer = setTimeout(() => setStatus(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  useEffect(() => {
    if (profile?.collegeId) {
      fetchDashboardData(profile.collegeId);
    }
  }, [profile]);

  useEffect(() => {
    if (profile?.collegeId && students.length) {
      fetchAttendanceRegister(profile.collegeId, attendanceDate, students);
    } else {
      setAttendanceRecords({});
    }
  }, [profile?.collegeId, attendanceDate, students]);

  const fetchAttendanceRegister = async (collegeId: string, targetDate: string, studentList: any[]) => {
    setAttendanceLoading(true);
    try {
      const attendanceDocs = await Promise.all(
        studentList.map((student) =>
          getDoc(doc(db, 'attendance', getAttendanceDocId(collegeId, targetDate, student.id)))
        )
      );

      const records: Record<string, 'present' | 'absent' | 'late'> = {};
      attendanceDocs.forEach((attendanceDoc) => {
        if (attendanceDoc.exists()) {
          const data = attendanceDoc.data() as any;
          if (data.studentId && data.status) {
            records[data.studentId] = data.status;
          }
        }
      });

      setAttendanceRecords(records);
      setAttendanceOverview({
        date: targetDate,
        present: Object.values(records).filter((status) => status === 'present').length,
        late: Object.values(records).filter((status) => status === 'late').length,
        absent: Object.values(records).filter((status) => status === 'absent').length,
        pending: Math.max(studentList.length - Object.keys(records).length, 0),
      });
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', message: getAttendanceErrorMessage(error, "Attendance analytics could not be synchronized.") });
    } finally {
      setAttendanceLoading(false);
    }
  };

  const markAttendance = async (student: any, statusValue: 'present' | 'absent' | 'late') => {
    if (!profile?.collegeId) return;
    try {
      setAttendanceSavingStudentId(student.id);
      await setDoc(doc(db, 'attendance', getAttendanceDocId(profile.collegeId, attendanceDate, student.id)), {
        collegeId: profile.collegeId,
        date: attendanceDate,
        studentId: student.id,
        studentName: student.officialName || student.displayName,
        studentRollNo: student.rollNo || '',
        status: statusValue,
        teacherId: auth.currentUser?.uid,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      const nextRecords = { ...attendanceRecords, [student.id]: statusValue };
      setAttendanceRecords(nextRecords);
      setAttendanceOverview({
        date: attendanceDate,
        present: Object.values(nextRecords).filter((status) => status === 'present').length,
        late: Object.values(nextRecords).filter((status) => status === 'late').length,
        absent: Object.values(nextRecords).filter((status) => status === 'absent').length,
        pending: Math.max(students.length - Object.keys(nextRecords).length, 0),
      });
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', message: getAttendanceErrorMessage(error, "Attendance update failed.") });
    } finally {
      setAttendanceSavingStudentId(null);
    }
  };

  const fetchDashboardData = async (collegeIdArg?: string) => {
    try {
      setLoading(true);
      const collegeId = collegeIdArg || profile?.collegeId;
      
      if (collegeId) {
        // Parallelize independent queries
        const queries = [
          getDoc(doc(db, 'colleges', collegeId)),
          getDocs(query(collection(db, 'users'), where('collegeId', '==', collegeId), where('role', '==', 'teacher'))),
          getDocs(query(collection(db, 'users'), where('collegeId', '==', collegeId), where('role', '==', 'student'))),
          getDocs(query(collection(db, 'tests'), where('collegeId', '==', collegeId))),
          getDocs(query(collection(db, 'submissions'), where('collegeId', '==', collegeId)))
        ];

        const [cRes, teachersRes, studentsRes, testsRes, subRes] = await Promise.allSettled(queries);
        if (cRes.status !== 'fulfilled') throw cRes.reason;

        const cSnap = cRes.value as any;
        const teachersSnap = (teachersRes.status === 'fulfilled' ? teachersRes.value : { docs: [] }) as any;
        const studentsSnap = (studentsRes.status === 'fulfilled' ? studentsRes.value : { docs: [] }) as any;
        const testsSnap = (testsRes.status === 'fulfilled' ? testsRes.value : { docs: [] }) as any;
        const allSubSnap = (subRes.status === 'fulfilled' ? subRes.value : { docs: [] }) as any;
        
        const cData = cSnap.data();
        setCollegeData({ id: cSnap.id, ...cData });
        setSettings({ collegeName: cData?.name || '', location: cData?.location || '' });

        // 1. Teachers
        const teacherList = teachersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
        setTeachers(teacherList);
        
        // 2. Students
        const studentList = studentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
        studentList.sort((a: any, b: any) => String(a.rollNo || '').localeCompare(String(b.rollNo || ''), undefined, { numeric: true, sensitivity: 'base' }));
        setStudents(studentList);

        // 3. Tests
        const teacherIdentityMap = new Map<string, string[]>();
        teacherList.forEach((teacher: any) => {
          const teacherIds = Array.from(
            new Set(
              [teacher.id, teacher.uid, sanitizeLegacyDocId(teacher.email)].filter(
                (value): value is string => typeof value === 'string' && value.length > 0
              )
            )
          );
          teacherIdentityMap.set(teacher.id, teacherIds);
        });

        const teacherScopedTestQueries = Array.from(
          new Set(Array.from(teacherIdentityMap.values()).flat())
        ).map((teacherId) => getDocs(query(collection(db, 'tests'), where('teacherId', '==', teacherId))));

        const teacherScopedResults = teacherScopedTestQueries.length
          ? await Promise.allSettled(teacherScopedTestQueries)
          : [];

        const collegeTests = testsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
        const teacherScopedTests = teacherScopedResults.flatMap((result) =>
          result.status === 'fulfilled'
            ? result.value.docs.map((testDoc) => ({ id: testDoc.id, ...testDoc.data() }))
            : []
        ) as any[];

        const testList = dedupeById(
          [...collegeTests, ...teacherScopedTests].filter((test: any) => {
            if (test.collegeId === collegeId) return true;
            if (test.collegeId) return false;
            return Array.from(teacherIdentityMap.values()).some((ids) => ids.includes(test.teacherId));
          })
        );

        // 4. Submissions (Recent)
        const allSubs = allSubSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
        const sortedSubs = [...allSubs].sort((a: any, b: any) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));
        setRecentSubmissions(sortedSubs.slice(0, 10)); // Top 10 for display

        // Insights Logic
        const passCount = allSubs.filter((d: any) => d.status === 'PASS').length;
        
        const metrics: Record<string, any> = {};
        teacherList.forEach(t => {
          const teacherIds = teacherIdentityMap.get(t.id) || [t.id];
          const tTests = testList.filter((test: any) => teacherIds.includes(test.teacherId));
          const tSubs = allSubs.filter((s: any) => tTests.some(test => test.id === s.testId));
          metrics[t.id] = {
            testCount: tTests.length,
            subCount: tSubs.length,
            passRate: tSubs.length ? Math.round((tSubs.filter((s: any) => s.status === 'PASS').length / tSubs.length) * 100) : 0
          };
        });
        setTeacherMetrics(metrics);

        await fetchAttendanceRegister(collegeId, attendanceDate, studentList);

        const testRows = testList.map((test: any) => {
          const relatedSubs = allSubs.filter((submission: any) => submission.testId === test.id);
          const avgScore = relatedSubs.length
            ? Math.round(relatedSubs.reduce((acc: number, submission: any) => acc + (submission.percentage || (submission.score / submission.total) * 100), 0) / relatedSubs.length)
            : 0;
          const passRate = relatedSubs.length
            ? Math.round((relatedSubs.filter((submission: any) => submission.status === 'PASS').length / relatedSubs.length) * 100)
            : 0;

          return {
            id: test.id,
            title: test.title,
            visible: test.visible !== false,
            submissions: relatedSubs.length,
            avgScore,
            passRate,
            isPractice: !!test.isPractice,
          };
        });
        setTestOverview(testRows.sort((a, b) => b.submissions - a.submissions).slice(0, 6));

        // Performance Trend (last 6 months or similar, simplified for now)
        const trend = sortedSubs.slice(0, 50).reverse().map((s: any, i: number) => ({
          name: i,
          score: s.percentage || 0
        }));
        setPerformanceData(trend);

        setStats({
          totalTeachers: teachersSnap.size,
          totalStudents: studentsSnap.size,
          totalTests: testList.length,
          overallPassRate: allSubs.length ? Math.round((passCount / allSubs.length) * 100) : 0,
          totalSubmissions: allSubs.length
        });
      }
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', message: e instanceof Error ? e.message : "System core failing to fetch analytic metadata." });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSettings = async () => {
    if (!collegeData || !settings.collegeName) return;
    setSaving(true);
    setStatus(null);
    try {
      await setDoc(doc(db, 'colleges', collegeData.id), {
        name: settings.collegeName,
        location: settings.location
      }, { merge: true });
      setCollegeData({ ...collegeData, name: settings.collegeName });
      setShowSettings(false);
      setStatus({ type: 'success', message: "Institutional credentials updated successfully." });
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', message: "Credential update failed. Administrative override rejected." });
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    try {
      const headers = ["Student Name", "Roll No", "Test ID", "Score", "Total", "Percentage", "Status", "Date"];
      const rows = recentSubmissions.map(s => [
        s.studentName,
        s.studentRollNo,
        s.testId,
        s.score,
        s.total,
        s.percentage + "%",
        s.status,
        new Date(s.submittedAt?.seconds * 1000).toLocaleDateString()
      ]);
      
      const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `Institutional_Report_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setStatus({ type: 'success', message: "Academic audit exported to local storage." });
    } catch (e) {
      setStatus({ type: 'error', message: "Export interface failure." });
    }
  };

  const handleSaveTeacher = async () => {
    if (!newTeacher.name || !newTeacher.email || !collegeData) return;
    setSaving(true);
    setStatus(null);
    try {
       const cleanEmail = newTeacher.email.toLowerCase().trim();
       const teacherId = cleanEmail.replace(/[^a-zA-Z0-9]/g, '_');
       
       if (editingTeacher) {
         // Check collision if email changed
         if (cleanEmail !== editingTeacher.email) {
            const exQ = query(collection(db, 'users'), where('email', '==', cleanEmail));
            const exSnap = await getDocs(exQ);
            if (!exSnap.empty) throw new Error("Email already registered in the faculty network.");
         }

         const isMigrated = !!editingTeacher.uid;
         
         if (isMigrated) {
            await updateDoc(doc(db, 'users', editingTeacher.id), {
              displayName: newTeacher.name,
              officialName: newTeacher.name,
              email: cleanEmail,
              updatedAt: serverTimestamp()
            });
            setStatus({ type: 'success', message: "Faculty profile updated. Google Login sync maintained." });
         } else {
            await setDoc(doc(db, 'users', teacherId), {
              displayName: newTeacher.name,
              officialName: newTeacher.name,
              email: cleanEmail,
              role: 'teacher',
              collegeId: collegeData.id,
              createdAt: editingTeacher.createdAt || serverTimestamp(),
              updatedAt: serverTimestamp()
            }, { merge: true });

            if (editingTeacher.id !== teacherId) {
               await deleteDoc(doc(db, 'users', editingTeacher.id));
            }
            setStatus({ type: 'success', message: "Faculty identity synchronized." });
         }
       } else {
         // Check collision
         const exQ = query(collection(db, 'users'), where('email', '==', cleanEmail));
         const exSnap = await getDocs(exQ);
         if (!exSnap.empty) throw new Error("Email already registered in the faculty network.");

         await setDoc(doc(db, 'users', teacherId), {
           displayName: newTeacher.name,
           officialName: newTeacher.name,
           email: cleanEmail,
           role: 'teacher',
           collegeId: collegeData.id,
           createdAt: serverTimestamp()
         });
         setStatus({ type: 'success', message: "Faculty member registered successfully." });
       }

       setShowTeacherModal(false);
       setEditingTeacher(null);
       setNewTeacher({ name: '', email: '' });
       fetchDashboardData();
    } catch (e: any) {
       console.error(e);
       setStatus({ type: 'error', message: e.message || "Credentialing failed. Integrity check rejected." });
    } finally {
       setSaving(false);
    }
  };

  const handleDeleteTeacher = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'users', id));
      setStatus({ type: 'success', message: "Faculty record purged from system." });
      setConfirmDeleteTeacher(null);
      fetchDashboardData();
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', message: "Purge failed. Administrative override rejected." });
    }
  };

  const handleEditTeacher = (teacher: any) => {
    setEditingTeacher(teacher);
    setNewTeacher({ name: teacher.displayName || '', email: teacher.email || '' });
    setShowTeacherModal(true);
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

  if (loading) return (
    <div className="min-h-screen bg-[#F8FAFC] p-8 space-y-8">
      <div className="h-20 rounded-[2rem] bg-white border border-slate-100 shadow-xl shadow-slate-100 animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-32 rounded-[2.5rem] bg-white border border-slate-100 shadow-xl shadow-slate-100 animate-pulse" />)}
      </div>
      <div className="h-[22rem] rounded-[3rem] bg-white border border-slate-100 shadow-xl shadow-slate-100 animate-pulse" />
      <div className="h-[24rem] rounded-[3rem] bg-white border border-slate-100 shadow-xl shadow-slate-100 animate-pulse" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FDFDFD]">
      {/* Navigation */}
      <nav className="h-20 bg-white border-b border-slate-100 px-8 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-12">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-100">
              <School size={28} />
            </div>
            <div>
              <h1 className="font-black text-xl uppercase tracking-tighter text-slate-800">{collegeData?.name || 'Principal Dashboard'}</h1>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Institutional Oversight Panel</p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2">
            {[
              { id: 'dashboard' as const, label: 'Analytics', icon: BarChart3 },
              { id: 'bank' as const, label: 'Question Bank', icon: BookOpen },
              { id: 'tests' as const, label: 'Test Management', icon: ShieldCheck },
              { id: 'reports' as const, label: 'Report Sheets', icon: TrendingUp },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all",
                  activeTab === tab.id ? "bg-emerald-600 text-white shadow-lg shadow-emerald-100" : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                )}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
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
        {activeTab === 'dashboard' && (
          <>
            {/* Dynamic Greeting */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">Academic Health Monitor</h2>
            <p className="text-slate-500 font-bold mt-1">Institutional summary for the current term</p>
          </div>
          <div className="flex gap-4">
             <button 
               onClick={handleExport}
               className="px-6 py-3 bg-white border-2 border-slate-100 hover:border-rose-600 text-slate-700 font-black rounded-2xl transition-all uppercase tracking-widest text-[10px] flex items-center gap-2"
             >
                <BarChart3 size={16} /> Export Reports
             </button>
             <button 
               onClick={() => setShowSettings(true)}
               className="px-6 py-3 bg-rose-600 text-white font-black rounded-2xl transition-all uppercase tracking-widest text-[10px] flex items-center gap-2"
             >
                <Settings size={16} /> Settings
             </button>
          </div>
        </div>

        <AnimatePresence>
          {status && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={cn(
                "p-6 rounded-[2rem] border font-black uppercase tracking-widest text-[10px] flex items-center gap-4 shadow-xl shadow-slate-100",
                status.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-rose-50 border-rose-100 text-rose-600"
              )}
            >
              {status.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              {status.message}
            </motion.div>
          )}
        </AnimatePresence>

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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/40">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Today Attendance Pulse</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Principal can audit or change any student's status for {attendanceOverview.date || attendanceDate}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <CalendarDays size={16} className="text-indigo-600" />
                  <input
                    type="date"
                    value={attendanceDate}
                    onChange={(e) => setAttendanceDate(e.target.value)}
                    className="bg-transparent text-[11px] font-black uppercase tracking-widest text-slate-600 outline-none"
                  />
                </div>
                <div className="px-4 py-2 rounded-2xl bg-slate-50 border border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {stats.totalStudents} students
                </div>
                {attendanceLoading && <Loader2 className="animate-spin text-indigo-600" size={18} />}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Present', value: attendanceOverview.present, tone: 'emerald' },
                { label: 'Late', value: attendanceOverview.late, tone: 'amber' },
                { label: 'Absent', value: attendanceOverview.absent, tone: 'rose' },
                { label: 'Pending', value: attendanceOverview.pending, tone: 'slate' },
              ].map(item => (
                <div key={item.label} className="p-5 rounded-[2rem] border border-slate-100 bg-slate-50/70">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.label}</p>
                  <p className="text-3xl font-black text-slate-900 mt-2">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 max-h-[360px] overflow-y-auto pr-1 space-y-3">
              {students.slice(0, 16).map((student) => (
                <div key={student.id} className="p-4 rounded-[1.6rem] border border-slate-100 bg-slate-50/60">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-black text-slate-800 uppercase tracking-tight truncate">{student.officialName || student.displayName}</p>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1 truncate">
                        {student.rollNo || 'No Roll'} {student.trade ? `• ${student.trade}` : ''}
                      </p>
                    </div>
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border shrink-0",
                      attendanceRecords[student.id] === 'present' && "bg-emerald-50 text-emerald-600 border-emerald-100",
                      attendanceRecords[student.id] === 'late' && "bg-amber-50 text-amber-600 border-amber-100",
                      attendanceRecords[student.id] === 'absent' && "bg-rose-50 text-rose-600 border-rose-100",
                      !attendanceRecords[student.id] && "bg-white text-slate-500 border-slate-100"
                    )}>
                      {attendanceRecords[student.id] || 'pending'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-4">
                    {[
                      { key: 'present' as const, label: 'Present', icon: UserCheck },
                      { key: 'late' as const, label: 'Late', icon: Clock3 },
                      { key: 'absent' as const, label: 'Absent', icon: AlertTriangle },
                    ].map((option) => (
                      <button
                        key={`${student.id}-${option.key}`}
                        type="button"
                        onClick={() => markAttendance(student, option.key)}
                        disabled={attendanceSavingStudentId === student.id}
                        className={cn(
                          "py-3 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                          attendanceRecords[student.id] === option.key
                            ? option.key === 'present'
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : option.key === 'late'
                                ? "bg-amber-500 text-white border-amber-500"
                                : "bg-rose-600 text-white border-rose-600"
                            : "bg-white text-slate-500 border-slate-200 hover:border-slate-300",
                          attendanceSavingStudentId === student.id && "opacity-60 cursor-wait"
                        )}
                      >
                        {attendanceSavingStudentId === student.id ? <Loader2 size={12} className="animate-spin" /> : <option.icon size={12} />}
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {students.length === 0 && (
                <div className="py-10 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px] border border-dashed border-slate-200 rounded-[2rem] bg-slate-50/50">
                  No students found for attendance editing
                </div>
              )}
            </div>
          </div>

          <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/40">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Test Control Snapshot</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">High-level performance and visibility across the latest tests</p>
              </div>
            </div>

            <div className="space-y-4">
              {testOverview.map(test => (
                <div key={test.id} className="p-4 rounded-[2rem] border border-slate-100 bg-slate-50/60">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-black text-slate-800 uppercase tracking-tight truncate">{test.title}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className={cn(
                          "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border",
                          test.visible ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-rose-50 text-rose-600 border-rose-100"
                        )}>
                          {test.visible ? 'Visible' : 'Hidden'}
                        </span>
                        {test.isPractice && (
                          <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border bg-amber-50 text-amber-600 border-amber-100">
                            Practice
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Subs</p>
                        <p className="text-lg font-black text-slate-900">{test.submissions}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Avg</p>
                        <p className="text-lg font-black text-indigo-600">{test.avgScore}%</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pass</p>
                        <p className="text-lg font-black text-rose-600">{test.passRate}%</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {testOverview.length === 0 && (
                <div className="py-10 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px] border border-dashed border-slate-200 rounded-[2rem] bg-slate-50/50">
                  No test analytics yet
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Growth Trend for Principal */}
        <div className="bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-xl shadow-slate-200/50">
           <div className="flex justify-between items-center mb-10">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Institutional Efficiency Trend</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Snapshot of recent academic submissions & delta scores</p>
              </div>
              <div className="text-right">
                 <p className="text-2xl font-black text-rose-600">{stats.totalSubmissions}</p>
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Active Audit Trail</p>
              </div>
           </div>
           <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                 <AreaChart data={performanceData}>
                    <defs>
                      <linearGradient id="colorPrincipal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#be123c" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#be123c" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" hide />
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip 
                      contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontWeight: 'bold', fontSize: '10px' }}
                      formatter={(val: any) => [`${val}%`, 'Institutional Score']}
                    />
                    <Area type="monotone" dataKey="score" stroke="#be123c" strokeWidth={4} fillOpacity={1} fill="url(#colorPrincipal)" />
                 </AreaChart>
              </ResponsiveContainer>
           </div>
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
                        <div className="flex items-center gap-2">
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{teacher.email}</p>
                           {teacher.uid ? (
                             <UserCheck size={10} className="text-emerald-500" />
                           ) : (
                             <Loader2 size={10} className="text-amber-500 animate-spin" />
                           )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-8">
                       <div className="text-center">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Exams</p>
                          <p className="font-black text-slate-800 uppercase text-xs">{teacherMetrics[teacher.id]?.testCount || 0}</p>
                       </div>
                       <div className="text-center">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Subs</p>
                          <p className="font-black text-slate-800 uppercase text-xs">{teacherMetrics[teacher.id]?.subCount || 0}</p>
                       </div>
                       <div className="text-right border-l border-slate-100 pl-8 flex items-center gap-2">
                          <div className="text-right mr-4">
                             <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Efficiency</p>
                             <p className="font-black text-rose-600 uppercase text-xs">{teacherMetrics[teacher.id]?.passRate || 0}% Pass</p>
                          </div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleEditTeacher(teacher); }}
                            className="p-2 text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 rounded-xl transition-all"
                          >
                             <Edit3 size={16} />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteTeacher(teacher.id); }}
                            className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                          >
                             <Trash2 size={16} />
                          </button>
                       </div>
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
      </>
    )}

        {activeTab === 'bank' && <QuestionBank collegeIdOverride={profile?.collegeId} mode="principal" />}
        {activeTab === 'tests' && (
          <TestCreator
            collegeIdOverride={profile?.collegeId}
            viewerMode="college"
            teacherIdsOverride={teacherScopeIds}
          />
        )}
        {activeTab === 'reports' && (
          <TeacherReports
            collegeIdOverride={profile?.collegeId}
            scopeMode="college"
            teacherIdsOverride={teacherScopeIds}
          />
        )}
      </main>

      {/* Modals */}
      <AnimatePresence>
        {showTeacherModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowTeacherModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-lg rounded-[3.5rem] p-12 relative shadow-2xl">
              <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-8 italic text-center">
                {editingTeacher ? "Account Synchronization" : "Faculty Credentialing"}
              </h3>
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Teacher Full Name</label>
                  <input type="text" value={newTeacher.name} onChange={e => setNewTeacher({...newTeacher, name: e.target.value})} className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-rose-600 rounded-2xl outline-none font-bold" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Enterprise Email (Transfer ID)</label>
                  <input type="email" value={newTeacher.email} onChange={e => setNewTeacher({...newTeacher, email: e.target.value})} className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-rose-600 rounded-2xl outline-none font-bold" />
                </div>
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSaveTeacher} 
                  disabled={saving} 
                  className="w-full py-6 bg-rose-600 text-white font-black rounded-3xl hover:bg-rose-700 transition-all flex items-center justify-center gap-3 shadow-xl shadow-rose-100"
                >
                  {saving ? <Loader2 className="animate-spin" /> : <ShieldCheck size={20} />} 
                  {editingTeacher ? "SYNCHRONIZE & TRANSFER" : "AUTHENTICATE & REGISTER"}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}

        {showSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSettings(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-lg rounded-[3.5rem] p-12 relative shadow-2xl">
              <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-8 italic text-center">Institutional Config</h3>
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">College / School Name</label>
                  <input type="text" value={settings.collegeName} onChange={e => setSettings({...settings, collegeName: e.target.value})} className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-rose-600 rounded-2xl outline-none font-bold" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Location / City</label>
                  <input type="text" value={settings.location} onChange={e => setSettings({...settings, location: e.target.value})} className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-rose-600 rounded-2xl outline-none font-bold" />
                </div>
                <button onClick={handleUpdateSettings} disabled={saving} className="w-full py-6 bg-rose-600 text-white font-black rounded-3xl hover:bg-rose-700 transition-all flex items-center justify-center gap-3">
                  {saving ? <Loader2 className="animate-spin" /> : <Settings size={20} />} UPDATE CREDENTIALS
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

        {confirmDeleteTeacher && (
           <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setConfirmDeleteTeacher(null)}
               className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
             />
             <motion.div 
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.9, opacity: 0 }}
               className="bg-white w-full max-w-sm rounded-[3rem] p-10 relative shadow-2xl text-center"
             >
               <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                 <Trash2 size={40} />
               </div>
               <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">Faculty Removal</h3>
               <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed mb-8">
                 You are about to terminate this faculty member's access to the institutional network. This will orphan their deployed tests.
               </p>
               <div className="grid grid-cols-2 gap-4">
                 <button 
                   onClick={() => setConfirmDeleteTeacher(null)}
                   className="py-4 px-6 bg-slate-50 text-slate-400 font-black rounded-2xl text-[10px] uppercase tracking-widest hover:bg-slate-100 transition-all border border-slate-100"
                 >
                   Abstain
                 </button>
                 <button 
                   onClick={() => handleDeleteTeacher(confirmDeleteTeacher)}
                   className="py-4 px-6 bg-rose-600 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest hover:bg-rose-700 transition-all shadow-lg shadow-rose-100"
                 >
                   Verify Purge
                 </button>
               </div>
             </motion.div>
           </div>
        )}
      </AnimatePresence>
    </div>
  );
}
