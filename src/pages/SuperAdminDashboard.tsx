import { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, getDocs, addDoc, serverTimestamp, doc, getDoc, updateDoc, deleteDoc, setDoc, orderBy, where } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Building2, 
  UserPlus, 
  Trash2, 
  Search, 
  Plus, 
  Loader2, 
  ShieldCheck,
  School,
  LogOut,
  Mail,
  User as UserIcon,
  LayoutDashboard,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import QuestionBank from './teacher/QuestionBank';
import TestCreator from './teacher/TestCreator';
import TeacherReports from './teacher/Reports';

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [colleges, setColleges] = useState<any[]>([]);
  const [selectedCollegeId, setSelectedCollegeId] = useState('');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [selectedCollegeFocus, setSelectedCollegeFocus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'bank' | 'tests' | 'reports'>('overview');
  const [newCollege, setNewCollege] = useState({ name: '', location: '', principalEmail: '', principalName: '' });
  const [editingCollege, setEditingCollege] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{type: 'success' | 'error', message: string} | null>(null);

  useEffect(() => {
    if (status) {
      const timer = setTimeout(() => setStatus(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  useEffect(() => {
    fetchColleges();
  }, []);

  useEffect(() => {
    if (!selectedCollegeId && colleges.length) {
      setSelectedCollegeId(colleges[0].id);
    }
  }, [colleges, selectedCollegeId]);

  useEffect(() => {
    if (selectedCollegeId) {
      fetchCollegeFocus(selectedCollegeId);
    } else {
      setSelectedCollegeFocus(null);
      setSelectedTeacherId('');
    }
  }, [selectedCollegeId]);

  useEffect(() => {
    setActiveTab('overview');
  }, [selectedCollegeId]);

  const fetchColleges = async () => {
    try {
      const q = query(collection(db, 'colleges'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setColleges(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', message: "Global registry access failure." });
    } finally {
      setLoading(false);
    }
  };

  const fetchCollegeFocus = async (collegeId: string) => {
    try {
      const queries = [
        getDoc(doc(db, 'colleges', collegeId)),
        getDocs(query(collection(db, 'users'), where('collegeId', '==', collegeId), where('role', '==', 'teacher'))),
        getDocs(query(collection(db, 'users'), where('collegeId', '==', collegeId), where('role', '==', 'student'))),
        getDocs(query(collection(db, 'tests'), where('collegeId', '==', collegeId))),
        getDocs(query(collection(db, 'attendance'), where('collegeId', '==', collegeId))),
        getDocs(query(collection(db, 'submissions'), where('collegeId', '==', collegeId))),
      ];

      const [collegeRes, teachersRes, studentsRes, testsRes, attendanceRes, submissionsRes] = await Promise.allSettled(queries);
      if (collegeRes.status !== 'fulfilled') throw collegeRes.reason;

      const collegeSnap = collegeRes.value as any;
      const teachersSnap = (teachersRes.status === 'fulfilled' ? teachersRes.value : { docs: [] }) as any;
      const studentsSnap = (studentsRes.status === 'fulfilled' ? studentsRes.value : { docs: [] }) as any;
      const testsSnap = (testsRes.status === 'fulfilled' ? testsRes.value : { docs: [] }) as any;
      const attendanceSnap = (attendanceRes.status === 'fulfilled' ? attendanceRes.value : { docs: [] }) as any;
      const submissionsSnap = (submissionsRes.status === 'fulfilled' ? submissionsRes.value : { docs: [] }) as any;

      if (attendanceRes.status === 'rejected') {
        console.warn('SuperAdmin focus: attendance read failed', attendanceRes.reason);
      }

      const teachers = teachersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const tests = testsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const submissions = submissionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const attendance = attendanceSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const principalEmail = collegeSnap.data()?.principalEmail;
      const principalSnap = principalEmail
        ? await getDocs(query(collection(db, 'users'), where('email', '==', principalEmail)))
        : null;

      const teacherList = teachers.map((teacher: any) => {
        const teacherTests = tests.filter((test: any) => test.teacherId === teacher.id);
        const teacherSubs = submissions.filter((sub: any) => teacherTests.some((test: any) => test.id === sub.testId));
        return {
          ...teacher,
          testCount: teacherTests.length,
          submissionCount: teacherSubs.length,
          passRate: teacherSubs.length ? Math.round((teacherSubs.filter((sub: any) => sub.status === 'PASS').length / teacherSubs.length) * 100) : 0,
        };
      });

      const attendanceSummary = {
        present: attendance.filter((record: any) => record.status === 'present').length,
        late: attendance.filter((record: any) => record.status === 'late').length,
        absent: attendance.filter((record: any) => record.status === 'absent').length,
      };

      setSelectedCollegeFocus({
        college: { id: collegeSnap.id, ...collegeSnap.data() },
        principal: principalSnap && !principalSnap.empty ? { id: principalSnap.docs[0].id, ...principalSnap.docs[0].data() } : null,
        teachers: teacherList,
        students: studentsSnap.size,
        tests: tests.length,
        submissions: submissions.length,
        attendance: attendanceSummary,
      });

      setSelectedTeacherId((prev) => prev && teacherList.some((teacher: any) => teacher.id === prev) ? prev : (teacherList[0]?.id || ''));
    } catch (error) {
      console.error(error);
      setSelectedCollegeFocus(null);
    }
  };

  const handleSaveCollege = async () => {
    if (!newCollege.name || !newCollege.principalEmail) {
      setStatus({ type: 'error', message: "Incomplete institutional metadata." });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const cleanEmail = newCollege.principalEmail.toLowerCase().trim();
      const principalId = cleanEmail.replace(/[^a-zA-Z0-9]/g, '_');
      
      if (editingCollege) {
        // Check collision if email changed
        if (cleanEmail !== editingCollege.principalEmail) {
           const exQ = query(collection(db, 'users'), where('email', '==', cleanEmail));
           const exSnap = await getDocs(exQ);
           if (!exSnap.empty) throw new Error("Principal email is already registered in the ecosystem.");
        }

        // Fetch existing principal record to check migration
        let existingUser: any = null;
        const oldPrincipalQ = query(collection(db, 'users'), where('email', '==', editingCollege.principalEmail));
        const oldSnap = await getDocs(oldPrincipalQ);
        if (!oldSnap.empty) {
          existingUser = { id: oldSnap.docs[0].id, ...oldSnap.docs[0].data() };
        }

        // Update College
        await updateDoc(doc(db, 'colleges', editingCollege.id), {
          name: newCollege.name,
          location: newCollege.location,
          principalEmail: cleanEmail,
          principalName: newCollege.principalName,
          updatedAt: serverTimestamp()
        });

        const principalPayload = {
          displayName: newCollege.principalName,
          officialName: newCollege.principalName,
          email: cleanEmail,
          role: 'principal',
          collegeId: editingCollege.id,
          updatedAt: serverTimestamp()
        };

        // Keep all known principal aliases synchronized so login and dashboard views stay aligned.
        await setDoc(doc(db, 'users', principalId), {
          ...principalPayload,
          createdAt: (existingUser && existingUser.createdAt) || serverTimestamp(),
        }, { merge: true });

        if (existingUser?.id && existingUser.id !== principalId) {
          await setDoc(doc(db, 'users', existingUser.id), {
            ...principalPayload,
            createdAt: existingUser.createdAt || serverTimestamp(),
          }, { merge: true });
        }

        if (existingUser?.uid && existingUser.uid !== principalId && existingUser.uid !== existingUser.id) {
          await setDoc(doc(db, 'users', existingUser.uid), {
            ...principalPayload,
            createdAt: existingUser.createdAt || serverTimestamp(),
            uid: existingUser.uid
          }, { merge: true });
        }
        
        setStatus({ type: 'success', message: "Institutional parameters synchronized." });
      } else {
        // Check collision
        const exQ = query(collection(db, 'users'), where('email', '==', cleanEmail));
        const exSnap = await getDocs(exQ);
        if (!exSnap.empty) throw new Error("Principal email is already registered in the ecosystem.");

        // Create College
        const collegeRef = await addDoc(collection(db, 'colleges'), {
          name: newCollege.name,
          location: newCollege.location,
          principalEmail: cleanEmail,
          principalName: newCollege.principalName,
          createdAt: serverTimestamp()
        });

        // Create Principal user record stub
        await setDoc(doc(db, 'users', principalId), {
          displayName: newCollege.principalName,
          officialName: newCollege.principalName,
          email: cleanEmail,
          role: 'principal',
          collegeId: collegeRef.id,
          createdAt: serverTimestamp()
        });
        setStatus({ type: 'success', message: "New institution activated globally." });
      }
      
      setShowModal(false);
      setEditingCollege(null);
      setNewCollege({ name: '', location: '', principalEmail: '', principalName: '' });
      fetchColleges();
    } catch (e: any) {
      console.error(e);
      setStatus({ type: 'error', message: e.message || "Activation sequence failed." });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (college: any) => {
    setEditingCollege(college);
    setNewCollege({
      name: college.name,
      location: college.location,
      principalEmail: college.principalEmail,
      principalName: college.principalName
    });
    setShowModal(true);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteDoc(doc(db, 'colleges', confirmDelete));
      setConfirmDelete(null);
      fetchColleges();
    } catch (e) {
      console.error(e);
      alert("Removal failed. Verify administrative permissions.");
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Top Bar */}
      <nav className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-purple-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-purple-100">
            <ShieldCheck size={28} />
          </div>
          <div>
            <h1 className="font-black text-xl uppercase tracking-tighter text-slate-800">EliteAdmin Control</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Global Infrastructure Oversight</p>
          </div>
        </div>

        <button 
          onClick={() => signOut(auth)}
          className="flex items-center gap-2 px-6 py-3 bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-600 font-black rounded-2xl transition-all uppercase tracking-widest text-[10px]"
        >
          <LogOut size={16} />
          Terminate Session
        </button>
      </nav>

      <main className="p-12 max-w-7xl mx-auto space-y-12">
        {/* Header Section */}
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase mb-2">College Registry</h2>
            <p className="text-slate-500 font-bold max-w-lg leading-relaxed">
              Manage institutions, assign principals, and monitor global academic distribution across the network.
            </p>
          </div>
          <button 
            onClick={() => setShowModal(true)}
            className="px-8 py-5 bg-purple-600 hover:bg-slate-900 text-white font-black rounded-[2rem] flex items-center gap-4 transition-all shadow-2xl shadow-purple-100 hover:scale-[1.02] active:scale-95"
          >
            <Plus size={24} />
            REGISTER NEW COLLEGE
          </button>
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

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Total Institutions</p>
            <div className="flex items-end gap-4">
              <span className="text-5xl font-black text-slate-900">{colleges.length}</span>
              <Building2 className="mb-2 text-purple-500" size={32} />
            </div>
          </div>
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Active Principals</p>
            <div className="flex items-end gap-4">
              <span className="text-5xl font-black text-slate-900">{colleges.filter(c => c.principalEmail).length}</span>
              <UserIcon className="mb-2 text-emerald-500" size={32} />
            </div>
          </div>
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Global Status</p>
            <div className="flex items-center gap-2 mt-4 text-emerald-600 font-black uppercase tracking-widest text-sm">
              <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
              All Systems Nominal
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">College Selector</p>
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter italic mt-1">Inspect any college</h3>
            </div>
            <select
              value={selectedCollegeId}
              onChange={(e) => setSelectedCollegeId(e.target.value)}
              className="w-full lg:w-96 px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 font-bold text-slate-700 outline-none"
            >
              <option value="">Choose a college</option>
              {colleges.map(college => (
                <option key={college.id} value={college.id}>
                  {college.name} {college.location ? `- ${college.location}` : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedCollegeFocus && (
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'overview' as const, label: 'College Overview' },
                { id: 'bank' as const, label: 'Question Bank' },
                { id: 'tests' as const, label: 'Test Registry' },
                { id: 'reports' as const, label: 'Report Sheets' },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all",
                    activeTab === tab.id
                      ? "bg-purple-600 text-white border-purple-600 shadow-lg shadow-purple-100"
                      : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-white"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {selectedCollegeFocus && activeTab === 'overview' && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-1 space-y-4">
                <div className="p-5 rounded-[2rem] bg-slate-50 border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Principal View</p>
                  <h4 className="text-xl font-black text-slate-900 mt-2">{selectedCollegeFocus.principal?.displayName || selectedCollegeFocus.college?.principalName || 'Not Assigned'}</h4>
                  <p className="text-sm font-bold text-slate-500 mt-1">{selectedCollegeFocus.principal?.email || selectedCollegeFocus.college?.principalEmail || 'No email registered'}</p>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-4">{selectedCollegeFocus.college?.name}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTeacherId('');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 text-white font-black uppercase tracking-widest text-[10px]"
                  >
                    Open Principal Tab
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Teachers</p>
                    <p className="text-3xl font-black text-slate-900">{selectedCollegeFocus.teachers.length}</p>
                  </div>
                  <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Students</p>
                    <p className="text-3xl font-black text-slate-900">{selectedCollegeFocus.students}</p>
                  </div>
                  <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tests</p>
                    <p className="text-3xl font-black text-slate-900">{selectedCollegeFocus.tests}</p>
                  </div>
                  <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Submissions</p>
                    <p className="text-3xl font-black text-slate-900">{selectedCollegeFocus.submissions}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Present</p>
                    <p className="text-2xl font-black text-emerald-700">{selectedCollegeFocus.attendance.present}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100">
                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Late</p>
                    <p className="text-2xl font-black text-amber-700">{selectedCollegeFocus.attendance.late}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100">
                    <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Absent</p>
                    <p className="text-2xl font-black text-rose-700">{selectedCollegeFocus.attendance.absent}</p>
                  </div>
                </div>
              </div>

              <div className="xl:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Teacher Roster</p>
                    <h4 className="text-xl font-black text-slate-900 uppercase tracking-tighter italic">Tap a teacher to inspect activity</h4>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                    {selectedCollegeFocus.teachers.length} loaded
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedCollegeFocus.teachers.map((teacher: any) => (
                    <button
                      key={teacher.id}
                      onClick={() => setSelectedTeacherId(teacher.id)}
                      className={cn(
                        "text-left p-5 rounded-[1.5rem] border transition-all shadow-sm",
                        selectedTeacherId === teacher.id
                          ? "bg-indigo-50 border-indigo-400 shadow-indigo-100"
                          : "bg-slate-50 border-slate-100 hover:bg-white hover:border-slate-200"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h5 className="font-black text-slate-900">{teacher.displayName || teacher.officialName}</h5>
                          <p className="text-xs font-bold text-slate-500">{teacher.email}</p>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center font-black text-indigo-600">
                          {teacher.displayName?.charAt(0) || 'T'}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-4 text-[10px] font-black uppercase tracking-widest">
                        <div className="p-3 rounded-xl bg-white border border-slate-100">
                          <p className="text-slate-400">Tests</p>
                          <p className="text-slate-900 mt-1">{teacher.testCount}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-white border border-slate-100">
                          <p className="text-slate-400">Subs</p>
                          <p className="text-slate-900 mt-1">{teacher.submissionCount}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-white border border-slate-100">
                          <p className="text-slate-400">Pass</p>
                          <p className="text-slate-900 mt-1">{teacher.passRate}%</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {selectedTeacherId && (
                  <div className="p-6 rounded-[2rem] bg-slate-900 text-white">
                    {(() => {
                      const teacher = selectedCollegeFocus.teachers.find((item: any) => item.id === selectedTeacherId);
                      if (!teacher) return null;
                      return (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Teacher Activity</p>
                              <h5 className="text-2xl font-black uppercase tracking-tighter italic">{teacher.displayName || teacher.officialName}</h5>
                            </div>
                            <button
                              onClick={() => setSelectedTeacherId(teacher.id)}
                              className="px-4 py-2 rounded-xl bg-white text-slate-900 font-black uppercase tracking-widest text-[10px]"
                            >
                              Focus Teacher
                            </button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="p-4 rounded-2xl bg-white/10 border border-white/10">
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">Tests Created</p>
                              <p className="text-3xl font-black mt-2">{teacher.testCount}</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-white/10 border border-white/10">
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">Submissions</p>
                              <p className="text-3xl font-black mt-2">{teacher.submissionCount}</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-white/10 border border-white/10">
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">Pass Rate</p>
                              <p className="text-3xl font-black mt-2">{teacher.passRate}%</p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedCollegeFocus && activeTab === 'bank' && (
            <QuestionBank collegeIdOverride={selectedCollegeId} mode="superadmin" />
          )}

          {selectedCollegeFocus && activeTab === 'tests' && (
            <TestCreator
              collegeIdOverride={selectedCollegeId}
              viewerMode="college"
              teacherIdsOverride={selectedCollegeFocus.teachers.flatMap((teacher: any) => [
                teacher.id,
                teacher.uid,
                teacher.email?.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_'),
              ]).filter(Boolean)}
            />
          )}

          {selectedCollegeFocus && activeTab === 'reports' && (
            <TeacherReports
              collegeIdOverride={selectedCollegeId}
              scopeMode="college"
              teacherIdsOverride={selectedCollegeFocus.teachers.flatMap((teacher: any) => [
                teacher.id,
                teacher.uid,
                teacher.email?.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_'),
              ]).filter(Boolean)}
            />
          )}
        </div>

        {/* College Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {colleges.map((college) => (
              <motion.div 
                layout
                key={college.id}
                className="bg-white group overflow-hidden rounded-[3rem] border border-slate-200 hover:border-purple-400 transition-all shadow-xl shadow-slate-200/40 relative"
              >
                <div className="p-10">
                  <div className="flex justify-between items-start mb-8">
                    <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-400 group-hover:bg-purple-50 group-hover:text-purple-600 transition-all border border-slate-100">
                      <School size={32} />
                    </div>
                    <div className="flex gap-2">
                       <button 
                         onClick={() => handleEdit(college)}
                         className="p-3 text-slate-300 hover:text-purple-600 hover:bg-purple-50 rounded-2xl transition-all"
                       >
                         <Plus size={20} className="rotate-45" />
                       </button>
                       <button 
                         onClick={() => setConfirmDelete(college.id)}
                         className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"
                       >
                         <Trash2 size={20} />
                       </button>
                    </div>
                 </div>

                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-2">{college.name}</h3>
                <p className="text-slate-500 font-bold mb-8 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-slate-300" />
                  {college.location}
                </p>

                <div className="space-y-4 pt-6 border-t border-slate-100">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                      <UserIcon size={18} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Principal</p>
                      <p className="font-bold text-slate-700">{college.principalName || 'Not Assigned'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                      <Mail size={18} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Administrator Email</p>
                      <p className="font-bold text-slate-700">{college.principalEmail}</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {confirmDelete && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmDelete(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl relative overflow-hidden p-10 text-center"
            >
              <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center text-red-600 mx-auto mb-6">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter mb-2">Confirm Removal?</h3>
              <p className="text-slate-500 font-bold text-xs leading-relaxed mb-8">
                This will permanently delete the institution and revoke all associated access privileges.
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 py-4 bg-slate-100 text-slate-600 font-black rounded-2xl uppercase tracking-widest text-[10px]"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDelete}
                  className="flex-1 py-4 bg-red-600 text-white font-black rounded-2xl uppercase tracking-widest text-[10px] shadow-lg shadow-red-100"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Register Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-12">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-xl rounded-[3rem] shadow-2xl relative overflow-hidden p-12"
            >
              <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-8 italic">
                {editingCollege ? "Update Institution" : "Register Institution"}
              </h2>
              
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Institution Name</label>
                  <input 
                    type="text" 
                    value={newCollege.name}
                    onChange={e => setNewCollege({...newCollege, name: e.target.value})}
                    placeholder="e.g. Royal College of Engineering"
                    className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl outline-none font-bold transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Global Location</label>
                  <input 
                    type="text" 
                    value={newCollege.location}
                    onChange={e => setNewCollege({...newCollege, location: e.target.value})}
                    placeholder="City, Country"
                    className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl outline-none font-bold transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Principal Name</label>
                    <input 
                      type="text" 
                      value={newCollege.principalName}
                      onChange={e => setNewCollege({...newCollege, principalName: e.target.value})}
                      placeholder="Full Name"
                      className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl outline-none font-bold transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Admin Email</label>
                    <input 
                      type="email" 
                      value={newCollege.principalEmail}
                      onChange={e => setNewCollege({...newCollege, principalEmail: e.target.value})}
                      placeholder="principal@college.edu"
                      className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl outline-none font-bold transition-all"
                    />
                  </div>
                </div>

                <div className="pt-6 flex gap-4">
                  <button 
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-5 text-slate-400 font-black uppercase tracking-widest text-xs hover:text-slate-600 transition-all border-2 border-slate-100 rounded-3xl"
                  >
                    Abort
                  </button>
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSaveCollege}
                    disabled={saving}
                    className="flex-[2] py-5 bg-purple-600 text-white font-black rounded-3xl flex items-center justify-center gap-4 transition-all hover:bg-slate-900 disabled:opacity-50 shadow-xl shadow-purple-100"
                  >
                    {saving ? <Loader2 className="animate-spin" /> : <ShieldCheck size={20} />}
                    {editingCollege ? "SAVE CHANGES" : "ACTIVATE INSTITUTION"}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
