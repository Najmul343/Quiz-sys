import { useState, useEffect } from 'react';
import { db, auth } from '../../lib/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp, setDoc, doc } from 'firebase/firestore';
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
  Plus
} from 'lucide-react';
import { cn } from '../../lib/utils';

export default function StudentManagement() {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newStudent, setNewStudent] = useState({ name: '', email: '', rollNo: '', trade: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      // Find students in teacher's class
      const q = query(collection(db, 'users'), where('role', '==', 'student'));
      // Ideally filter by teacher's class ID, but we'll fetch all and filter by teacherId in some field
      const snap = await getDocs(q);
      setStudents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStudent = async () => {
    if (!newStudent.name || !newStudent.email) return;
    setSaving(true);
    try {
      // Create a user record stub (auth logic is handled separately in Firebase, 
      // but we can pre-populate the 'users' collection with their role and metadata)
      const studentId = newStudent.email.replace(/[^a-zA-Z0-9]/g, '_');
      await setDoc(doc(db, 'users', studentId), {
        displayName: newStudent.name,
        email: newStudent.email,
        rollNo: newStudent.rollNo,
        trade: newStudent.trade,
        role: 'student',
        addedBy: auth.currentUser?.uid,
        createdAt: serverTimestamp()
      });

      setShowModal(false);
      setNewStudent({ name: '', email: '', rollNo: '', trade: '' });
      fetchStudents();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-64 flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-10 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/40">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter italic">Student Registrar</h2>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1">Manage active enrollment and identity verification</p>
        </div>
        
        <button 
          onClick={() => setShowModal(true)}
          className="px-8 py-5 bg-slate-900 text-white font-black rounded-3xl flex items-center gap-4 transition-all hover:bg-blue-600 shadow-2xl shadow-blue-100 active:scale-95"
        >
          <UserPlus size={24} />
          ENROLL STUDENT
        </button>
      </div>

      <div className="relative group">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={24} />
        <input 
          type="text" 
          placeholder="Lookup by roll number, name, or enrollment tag..."
          className="w-full pl-16 pr-8 py-6 bg-white border border-slate-100 rounded-[2rem] shadow-xl shadow-slate-200/40 focus:border-blue-600 outline-none transition-all font-bold text-slate-700"
        />
      </div>

      {/* Student List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {students.map((student) => (
          <motion.div 
            layout
            key={student.id}
            className="bg-white group overflow-hidden rounded-[3rem] border border-slate-200 hover:border-blue-400 transition-all shadow-xl shadow-slate-200/40 relative"
          >
            <div className="p-10 flex gap-8 items-start">
               <div className="w-24 h-24 bg-slate-50 rounded-[2rem] border border-slate-100 flex items-center justify-center text-slate-300 group-hover:bg-blue-50 group-hover:text-blue-600 transition-all">
                  <UserIcon size={44} />
               </div>

               <div className="flex-1">
                  <div className="flex justify-between items-start">
                     <div>
                        <h4 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{student.displayName}</h4>
                        <p className="text-xs font-black text-blue-600 uppercase tracking-[0.2em] mb-4">{student.trade || 'General Course'}</p>
                     </div>
                     <button className="p-3 text-slate-200 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all opacity-0 group-hover:opacity-100">
                        <Trash2 size={20} />
                     </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-100/50">
                        <Fingerprint size={16} className="text-slate-400" />
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{student.rollNo || 'No Roll'}</span>
                     </div>
                     <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-100/50">
                        <Mail size={16} className="text-slate-400" />
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest truncate">{student.email}</span>
                     </div>
                  </div>
               </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Enrollment Modal */}
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
              className="bg-white w-full max-w-xl rounded-[3.5rem] shadow-2xl relative overflow-hidden p-12"
            >
              <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-8 italic">Enrollment Portal</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Student Name</label>
                  <input 
                    type="text" 
                    value={newStudent.name}
                    onChange={e => setNewStudent({...newStudent, name: e.target.value})}
                    placeholder="Full Legal Name"
                    className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-blue-600 rounded-2xl outline-none font-bold transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Registration Email</label>
                  <input 
                    type="email" 
                    value={newStudent.email}
                    onChange={e => setNewStudent({...newStudent, email: e.target.value})}
                    placeholder="student@college.edu"
                    className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-blue-600 rounded-2xl outline-none font-bold transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Roll Number</label>
                    <input 
                      type="text" 
                      value={newStudent.rollNo}
                      onChange={e => setNewStudent({...newStudent, rollNo: e.target.value})}
                      placeholder="e.g. 2026-CS-01"
                      className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-blue-600 rounded-2xl outline-none font-bold transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Course Branch</label>
                    <input 
                      type="text" 
                      value={newStudent.trade}
                      onChange={e => setNewStudent({...newStudent, trade: e.target.value})}
                      placeholder="e.g. Machinist"
                      className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-blue-600 rounded-2xl outline-none font-bold transition-all"
                    />
                  </div>
                </div>

                <div className="pt-6 flex gap-4">
                  <button 
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-5 text-slate-400 font-black uppercase tracking-widest text-xs hover:text-slate-600 transition-all border-2 border-slate-100 rounded-3xl"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleAddStudent}
                    disabled={saving}
                    className="flex-[2] py-5 bg-blue-600 text-white font-black rounded-3xl flex items-center justify-center gap-4 transition-all hover:bg-slate-900 disabled:opacity-50 shadow-xl shadow-blue-100"
                  >
                    {saving ? <Loader2 className="animate-spin" /> : <ShieldCheck size={20} />}
                    VET IDENTITY & ENROLL
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
