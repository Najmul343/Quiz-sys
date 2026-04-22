import { useState, useEffect } from 'react';
import { db, auth } from '../../lib/firebase';
import { collection, query, where, getDocs, serverTimestamp, setDoc, doc, getDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  UserPlus, 
  Users, 
  Trash2, 
  Search, 
  Loader2, 
  ShieldCheck,
  Mail,
  Fingerprint,
  LogOut,
  User as UserIcon,
  Plus,
  Edit2,
  CheckCircle2,
  X,
  AlertTriangle,
  UserCheck,
  CalendarDays,
  Clock3
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { resolveTeacherAssignedClass } from '../../lib/classAccess';

export default function StudentManagement() {
  const { profile } = useAuth();
  const todayLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [newStudent, setNewStudent] = useState({ name: '', email: '', rollNo: '', trade: '' });
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [currentCollegeId, setCurrentCollegeId] = useState('');
  const [assignedClassId, setAssignedClassId] = useState('');
  const [attendanceDate, setAttendanceDate] = useState(todayLocal);
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, 'present' | 'absent' | 'late'>>({});
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceSavingStudentId, setAttendanceSavingStudentId] = useState<string | null>(null);

  const getAttendanceDocId = (collegeId: string, date: string, studentId: string) => `${collegeId}_${date}_${studentId}`;

  const getAttendanceErrorMessage = (error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('missing or insufficient permissions')) {
      return "Attendance permissions are blocked in Firestore for this account.";
    }
    return fallback;
  };

  const commitBatchChunks = async (updates: Array<(batch: ReturnType<typeof writeBatch>) => void>, chunkSize = 350) => {
    for (let i = 0; i < updates.length; i += chunkSize) {
      const batch = writeBatch(db);
      updates.slice(i, i + chunkSize).forEach((apply) => apply(batch));
      await batch.commit();
    }
  };

  const syncStudentReferences = async (oldStudentId: string, nextStudent: any, oldStudentName: string) => {
    const nextStudentName = nextStudent.officialName || nextStudent.displayName || oldStudentName;

    const [attendanceSnap, submissionsSnap, progressSnap] = await Promise.all([
      getDocs(query(collection(db, 'attendance'), where('studentId', '==', oldStudentId))),
      getDocs(query(collection(db, 'submissions'), where('studentId', '==', oldStudentId))),
      getDocs(query(collection(db, 'practice_progress'), where('studentId', '==', oldStudentId))),
    ]);

    const attendanceUpdates = attendanceSnap.docs.map((item) => (batch: ReturnType<typeof writeBatch>) => {
      batch.update(doc(db, 'attendance', item.id), {
        studentId: nextStudent.id,
        studentName: nextStudentName,
        studentRollNo: nextStudent.rollNo || '',
        classId: nextStudent.classId || '',
        updatedAt: serverTimestamp(),
      });
    });

    const submissionUpdates = submissionsSnap.docs.map((item) => (batch: ReturnType<typeof writeBatch>) => {
      batch.update(doc(db, 'submissions', item.id), {
        studentId: nextStudent.id,
        studentName: nextStudentName,
        studentRollNo: nextStudent.rollNo || '',
        classId: nextStudent.classId || '',
        updatedAt: serverTimestamp(),
      });
    });

    const progressUpdates = progressSnap.docs.map((item) => (batch: ReturnType<typeof writeBatch>) => {
      batch.update(doc(db, 'practice_progress', item.id), {
        studentId: nextStudent.id,
        studentName: nextStudentName,
        studentRollNo: nextStudent.rollNo || '',
        classId: nextStudent.classId || '',
        updatedAt: serverTimestamp(),
      });
    });

    await commitBatchChunks([...attendanceUpdates, ...submissionUpdates, ...progressUpdates]);
  };

  useEffect(() => {
    if (status) {
      const timer = setTimeout(() => setStatus(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  useEffect(() => {
    if (profile?.collegeId) {
      setCurrentCollegeId(profile.collegeId);
      fetchStudents(profile.collegeId);
    }
  }, [profile]);

  useEffect(() => {
    if (currentCollegeId && students.length) {
      fetchAttendanceForDate(currentCollegeId, attendanceDate, students);
    } else {
      setAttendanceRecords({});
    }
  }, [currentCollegeId, attendanceDate, students]);

  const fetchAttendanceForDate = async (collegeId: string, targetDate: string, studentList: any[]) => {
    setAttendanceLoading(true);
    try {
      const records: Record<string, 'present' | 'absent' | 'late'> = {};

      const attendanceDocs = await Promise.all(
        studentList.map((student) =>
          getDoc(doc(db, 'attendance', getAttendanceDocId(collegeId, targetDate, student.id)))
        )
      );

      attendanceDocs.forEach((attendanceDoc) => {
        if (attendanceDoc.exists()) {
          const data = attendanceDoc.data() as any;
          if (data.studentId && data.status) {
            records[data.studentId] = data.status;
          }
        }
      });

      setAttendanceRecords(records);
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', message: getAttendanceErrorMessage(error, "Attendance register could not be synchronized.") });
    } finally {
      setAttendanceLoading(false);
    }
  };

  const fetchStudents = async (collegeIdArg?: string) => {
    try {
      const collegeId = collegeIdArg || profile?.collegeId;

      if (!collegeId) return;
      setCurrentCollegeId(collegeId);

      const assignedClass = await resolveTeacherAssignedClass(db, {
        collegeId,
        user: auth.currentUser,
        profile,
      });
      const activeClassId = assignedClass?.id || '';
      setAssignedClassId(activeClassId);

      const q = query(
        collection(db, 'users'), 
        where('role', '==', 'student'),
        where('collegeId', '==', collegeId)
      );
      const snap = await getDocs(q);
      const list = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((student: any) => !activeClassId || student.classId === activeClassId);
      
      // Sort students roll no wise
      list.sort((a: any, b: any) => {
        const rollA = String(a.rollNo || '');
        const rollB = String(b.rollNo || '');
        return rollA.localeCompare(rollB, undefined, { numeric: true, sensitivity: 'base' });
      });

      setStudents(list);
    } catch (e: any) {
      console.error(e);
      setStatus({ type: 'error', message: "Failed to fetch student database." });
    } finally {
      setLoading(false);
    }
  };

  const markAttendance = async (student: any, statusValue: 'present' | 'absent' | 'late') => {
    if (!currentCollegeId) return;
    try {
      setAttendanceSavingStudentId(student.id);
      await setDoc(doc(db, 'attendance', getAttendanceDocId(currentCollegeId, attendanceDate, student.id)), {
        collegeId: currentCollegeId,
        classId: assignedClassId,
        date: attendanceDate,
        studentId: student.id,
        studentName: student.officialName || student.displayName,
        studentRollNo: student.rollNo || '',
        status: statusValue,
        teacherId: auth.currentUser?.uid,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      setAttendanceRecords(prev => ({ ...prev, [student.id]: statusValue }));
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', message: getAttendanceErrorMessage(error, "Attendance update failed.") });
    } finally {
      setAttendanceSavingStudentId(null);
    }
  };

  const handleAddStudent = async () => {
    if (!newStudent.name || !newStudent.email) {
      setStatus({ type: 'error', message: "Identity credentials incomplete." });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const collegeId = currentCollegeId || profile?.collegeId;
      if (!collegeId) throw new Error("College context missing. Please reload the session.");

      const cleanEmail = newStudent.email.toLowerCase().trim();

      // Check if email already exists
      const existingQ = query(collection(db, 'users'), where('email', '==', cleanEmail));
      const existingSnap = await getDocs(existingQ);
      if (!existingSnap.empty) {
        throw new Error("Student with this email is already registered in the system.");
      }

      // Create a user record stub
      const studentId = cleanEmail.replace(/[^a-zA-Z0-9]/g, '_');
      await setDoc(doc(db, 'users', studentId), {
        displayName: newStudent.name,
        officialName: newStudent.name,
        email: cleanEmail,
        rollNo: newStudent.rollNo,
        trade: newStudent.trade,
        role: 'student',
        collegeId,
        classId: assignedClassId,
        addedBy: auth.currentUser?.uid,
        createdAt: serverTimestamp()
      });

      setShowModal(false);
      setNewStudent({ name: '', email: '', rollNo: '', trade: '' });
      setStatus({ type: 'success', message: `Student ${newStudent.name} enrolled successfully.` });
      fetchStudents();
    } catch (e: any) {
      console.error(e);
      setStatus({ type: 'error', message: e.message || "Enrollment failed." });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStudent = async () => {
    if (!editingStudent || !editingStudent.officialName) {
      setStatus({ type: 'error', message: "Update parameters invalid." });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const collegeId = currentCollegeId || profile?.collegeId;
      if (!collegeId) throw new Error("College context missing. Please reload the session.");
      const oldStudentId = editingStudent.id;
      const oldStudentName = editingStudent.officialName || editingStudent.displayName || '';
      const cleanEmail = editingStudent.email.toLowerCase().trim();
      const newId = cleanEmail.replace(/[^a-zA-Z0-9]/g, '_');
      const isMigrated = !!editingStudent.uid;

      // Check for email collision if email changed
      if (cleanEmail !== students.find(s => s.id === editingStudent.id)?.email) {
        const collisionQ = query(collection(db, 'users'), where('email', '==', cleanEmail));
        const collisionSnap = await getDocs(collisionQ);
        if (!collisionSnap.empty) {
          throw new Error("Student with this email already exists in the registry.");
        }
      }

      if (isMigrated) {
        // Just update existing UID document
        await updateDoc(doc(db, 'users', editingStudent.id), {
          officialName: editingStudent.officialName,
          displayName: editingStudent.officialName,
          email: cleanEmail,
          rollNo: editingStudent.rollNo,
          trade: editingStudent.trade,
          classId: assignedClassId,
          updatedAt: serverTimestamp()
        });
      } else {
        // Stub phase - handle ID re-mapping if email changed
        const studentData = {
          officialName: editingStudent.officialName,
          displayName: editingStudent.officialName,
          email: cleanEmail,
          rollNo: editingStudent.rollNo,
          trade: editingStudent.trade,
          role: 'student',
          collegeId,
          classId: assignedClassId,
          addedBy: editingStudent.addedBy || auth.currentUser?.uid,
          createdAt: editingStudent.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        await setDoc(doc(db, 'users', newId), studentData, { merge: true });

        if (editingStudent.id !== newId) {
          await deleteDoc(doc(db, 'users', editingStudent.id));
        }
      }

      if (oldStudentId !== (isMigrated ? editingStudent.id : newId) || oldStudentName !== editingStudent.officialName) {
        await syncStudentReferences(oldStudentId, {
          id: isMigrated ? editingStudent.id : newId,
          officialName: editingStudent.officialName,
          displayName: editingStudent.officialName,
          rollNo: editingStudent.rollNo,
          classId: assignedClassId,
        }, oldStudentName);
      }

      setEditingStudent(null);
      setStatus({ type: 'success', message: "Student record synchronized successfully." });
      fetchStudents();
    } catch (e: any) {
      console.error(e);
      setStatus({ type: 'error', message: e.message || "Synchronisation failed. Verify permissions." });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStudent = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'users', id));
      setStatus({ type: 'success', message: "Identity purged from central registry." });
      setConfirmDelete(null);
      fetchStudents();
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', message: "Purge failed. Administrative override required." });
    }
  };

  const filteredStudents = students.filter(s => 
    (s.officialName || s.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.rollNo || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const attendanceStats = {
    present: filteredStudents.filter(student => attendanceRecords[student.id] === 'present').length,
    absent: filteredStudents.filter(student => attendanceRecords[student.id] === 'absent').length,
    late: filteredStudents.filter(student => attendanceRecords[student.id] === 'late').length,
    pending: filteredStudents.filter(student => !attendanceRecords[student.id]).length,
  };

  if (loading) return <div className="h-64 flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-10 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/40">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter italic">Student Portfolio</h2>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1">Manage official identities and enrollment metadata</p>
        </div>
        
        <button 
          onClick={() => setShowModal(true)}
          className="px-8 py-5 bg-slate-900 text-white font-black rounded-3xl flex items-center gap-4 transition-all hover:bg-blue-600 shadow-2xl shadow-blue-100 active:scale-95"
        >
          <UserPlus size={24} />
          ADD STUDENT
        </button>
      </div>

      <div className="relative group">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={24} />
        <input 
          type="text" 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Lookup by roll no, name, or email..."
          className="w-full pl-16 pr-8 py-6 bg-white border border-slate-100 rounded-[2rem] shadow-xl shadow-slate-200/40 focus:border-blue-600 outline-none transition-all font-bold text-slate-700"
        />
      </div>

      <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/30 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight italic">Attendance Register</h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Mark present, absent, or late for each student and surface it in principal analytics</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 rounded-2xl border border-slate-100">
              <CalendarDays size={16} className="text-indigo-600" />
              <input
                type="date"
                value={attendanceDate}
                onChange={e => setAttendanceDate(e.target.value)}
                className="bg-transparent text-[11px] font-black uppercase tracking-widest text-slate-600 outline-none"
              />
            </div>
            {attendanceLoading && <Loader2 className="animate-spin text-indigo-600" size={18} />}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Present', value: attendanceStats.present, tone: 'emerald' },
            { label: 'Late', value: attendanceStats.late, tone: 'amber' },
            { label: 'Absent', value: attendanceStats.absent, tone: 'rose' },
            { label: 'Pending', value: attendanceStats.pending, tone: 'slate' },
          ].map(item => (
            <div key={item.label} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/70">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.label}</p>
              <p className="text-2xl font-black text-slate-900 mt-1">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {status && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={cn(
              "p-6 rounded-[2rem] border font-black uppercase tracking-widest text-[10px] flex items-center gap-4",
              status.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-rose-50 border-rose-100 text-rose-600"
            )}
          >
            {status.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {status.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Student List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
        {filteredStudents.map((student) => (
          <motion.div 
            layout
            key={student.id}
            className="bg-white group overflow-hidden rounded-[1.5rem] sm:rounded-[2.5rem] border border-slate-200 hover:border-blue-400 transition-all shadow-xl shadow-slate-200/40 relative"
          >
            <div className="p-4 sm:p-6 lg:p-10 flex flex-col sm:flex-row gap-4 sm:gap-6 lg:gap-8 items-start">
               <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 bg-slate-50 rounded-2xl sm:rounded-[2rem] border border-slate-100 flex items-center justify-center text-slate-300 group-hover:bg-blue-50 group-hover:text-blue-600 transition-all">
                  <UserIcon size={30} className="sm:w-9 sm:h-9 lg:w-[44px] lg:h-[44px]" />
               </div>

               <div className="flex-1">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                     <div>
                        <h4 className="text-lg sm:text-xl lg:text-2xl font-black text-slate-800 uppercase tracking-tight break-words">{student.officialName || student.displayName}</h4>
                        <p className="text-[10px] sm:text-xs font-black text-blue-600 uppercase tracking-[0.2em] mb-3 sm:mb-4">{student.trade || 'General Course'}</p>
                     </div>
                     <div className="flex gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => setEditingStudent(student)}
                          className="p-2.5 sm:p-3 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl sm:rounded-2xl transition-all"
                        >
                          <Edit2 size={18} className="sm:w-5 sm:h-5" />
                        </button>
                        <button 
                          onClick={() => setConfirmDelete(student.id)}
                          className="p-2.5 sm:p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl sm:rounded-2xl transition-all"
                        >
                           <Trash2 size={18} className="sm:w-5 sm:h-5" />
                        </button>
                     </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-3 sm:mb-4">
                      {student.uid ? (
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-black uppercase tracking-widest border border-emerald-100">
                          <UserCheck size={12} />
                          Active Identity
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-600 rounded-lg text-[9px] font-black uppercase tracking-widest border border-amber-100">
                          <Loader2 size={12} className="animate-spin" />
                          Pending Login
                        </div>
                      )}
                      {student.trade && (
                        <div className="px-3 py-1 bg-slate-50 text-slate-500 rounded-lg text-[9px] font-black uppercase tracking-widest border border-slate-100">
                          {student.trade}
                        </div>
                      )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                     <div className="flex items-center gap-2 p-2.5 sm:p-3 bg-slate-50 rounded-2xl border border-slate-100/50">
                        <Fingerprint size={16} className="text-slate-400" />
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{student.rollNo || 'No Roll'}</span>
                     </div>
                     <div className="flex items-center gap-2 p-2.5 sm:p-3 bg-slate-50 rounded-2xl border border-slate-100/50">
                        <Mail size={16} className="text-slate-400" />
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest truncate">{student.email}</span>
                     </div>
                  </div>

                  <div className="mt-4 sm:mt-5 pt-4 sm:pt-5 border-t border-slate-100">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Attendance for {attendanceDate}</p>
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border",
                        attendanceRecords[student.id] === 'present' && "bg-emerald-50 text-emerald-600 border-emerald-100",
                        attendanceRecords[student.id] === 'late' && "bg-amber-50 text-amber-600 border-amber-100",
                        attendanceRecords[student.id] === 'absent' && "bg-rose-50 text-rose-600 border-rose-100",
                        !attendanceRecords[student.id] && "bg-slate-50 text-slate-500 border-slate-100"
                      )}>
                        {attendanceRecords[student.id] || 'pending'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {[
                        { key: 'present' as const, label: 'Present', icon: UserCheck, tone: 'emerald' },
                        { key: 'late' as const, label: 'Late', icon: Clock3, tone: 'amber' },
                        { key: 'absent' as const, label: 'Absent', icon: AlertTriangle, tone: 'rose' },
                      ].map(option => (
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
               </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Enrollment/Edit Modal */}
      <AnimatePresence>
        {(showModal || editingStudent) && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-12">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setShowModal(false); setEditingStudent(null); }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-xl rounded-[3.5rem] shadow-2xl relative overflow-hidden p-12"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter italic">
                  {editingStudent ? 'Update Profile' : 'Enroll Student'}
                </h2>
                <button onClick={() => { setShowModal(false); setEditingStudent(null); }} className="p-2 text-slate-400 hover:text-slate-900">
                  <X size={24} />
                </button>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Official Full Name</label>
                  <input 
                    type="text" 
                    value={editingStudent ? (editingStudent.officialName || editingStudent.displayName || '') : newStudent.name}
                    onChange={e => editingStudent 
                      ? setEditingStudent({...editingStudent, officialName: e.target.value, displayName: e.target.value})
                      : setNewStudent({...newStudent, name: e.target.value})
                    }
                    placeholder="Full Legal Name"
                    className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-blue-600 rounded-2xl outline-none font-bold transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Registration Email {editingStudent && '(Sync ID)'}</label>
                  <input 
                    type="email" 
                    value={editingStudent ? editingStudent.email : newStudent.email}
                    onChange={e => editingStudent
                      ? setEditingStudent({...editingStudent, email: e.target.value})
                      : setNewStudent({...newStudent, email: e.target.value})
                    }
                    placeholder="student@college.edu"
                    className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-blue-600 rounded-2xl outline-none font-bold transition-all"
                  />
                  {editingStudent && (
                    <p className="text-[9px] text-slate-400 font-bold mt-2 italic px-2">Changing email will re-map the registration stub.</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Roll Number</label>
                    <input 
                      type="text" 
                      value={editingStudent ? editingStudent.rollNo : newStudent.rollNo}
                      onChange={e => editingStudent
                        ? setEditingStudent({...editingStudent, rollNo: e.target.value})
                        : setNewStudent({...newStudent, rollNo: e.target.value})
                      }
                      placeholder="e.g. 2026-CS-01"
                      className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-blue-600 rounded-2xl outline-none font-bold transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Course Branch</label>
                    <input 
                      type="text" 
                      value={editingStudent ? editingStudent.trade : newStudent.trade}
                      onChange={e => editingStudent
                        ? setEditingStudent({...editingStudent, trade: e.target.value})
                        : setNewStudent({...newStudent, trade: e.target.value})
                      }
                      placeholder="e.g. Machinist"
                      className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-blue-600 rounded-2xl outline-none font-bold transition-all"
                    />
                  </div>
                </div>

                <div className="pt-6 flex gap-4">
                  <button 
                    onClick={() => { setShowModal(false); setEditingStudent(null); }}
                    className="flex-1 py-5 text-slate-400 font-black uppercase tracking-widest text-xs hover:text-slate-600 transition-all border-2 border-slate-100 rounded-3xl"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={editingStudent ? handleUpdateStudent : handleAddStudent}
                    disabled={saving}
                    className="flex-[2] py-5 bg-blue-600 text-white font-black rounded-3xl flex items-center justify-center gap-4 transition-all hover:bg-slate-900 disabled:opacity-50 shadow-xl shadow-blue-100"
                  >
                    {saving ? <Loader2 className="animate-spin" /> : <ShieldCheck size={20} />}
                    {editingStudent ? 'SAVE CHANGES' : 'VET IDENTITY & ENROLL'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

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
                className="bg-white w-full max-w-sm rounded-[3rem] p-10 relative shadow-2xl text-center"
              >
                <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                  <Trash2 size={40} />
                </div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">Confirm Purge</h3>
                <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed mb-8">
                  You are about to permanently remove this identity from the institutional registry. All associated metadata will be orphaned.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => setConfirmDelete(null)}
                    className="py-4 px-6 bg-slate-50 text-slate-400 font-black rounded-2xl text-[10px] uppercase tracking-widest hover:bg-slate-100 transition-all border border-slate-100"
                  >
                    Abstain
                  </button>
                  <button 
                    onClick={() => handleDeleteStudent(confirmDelete)}
                    className="py-4 px-6 bg-rose-600 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest hover:bg-rose-700 transition-all shadow-lg shadow-rose-100"
                  >
                    Verify Purge
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </AnimatePresence>
    </div>
  );
}
