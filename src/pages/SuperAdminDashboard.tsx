import { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, getDocs, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
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
  LayoutDashboard
} from 'lucide-react';
import { cn } from '../lib/utils';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [colleges, setColleges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [newCollege, setNewCollege] = useState({ name: '', location: '', principalEmail: '', principalName: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchColleges();
  }, []);

  const fetchColleges = async () => {
    try {
      const q = query(collection(db, 'colleges'));
      const snap = await getDocs(q);
      setColleges(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCollege = async () => {
    if (!newCollege.name || !newCollege.principalEmail) return;
    setSaving(true);
    try {
      // 1. Create College
      const collegeRef = await addDoc(collection(db, 'colleges'), {
        name: newCollege.name,
        location: newCollege.location,
        principalEmail: newCollege.principalEmail,
        principalName: newCollege.principalName,
        createdAt: serverTimestamp()
      });

      // 2. Create/Update Principal user record stub
      const principalId = newCollege.principalEmail.replace(/[^a-zA-Z0-9]/g, '_');
      await setDoc(doc(db, 'users', principalId), {
        displayName: newCollege.principalName,
        email: newCollege.principalEmail,
        role: 'principal',
        collegeId: collegeRef.id,
        createdAt: serverTimestamp()
      });
      
      setShowModal(false);
      setNewCollege({ name: '', location: '', principalEmail: '', principalName: '' });
      fetchColleges();
    } catch (e) {
      console.error(e);
      alert("Registration failed. Check connectivity.");
    } finally {
      setSaving(false);
    }
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
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
            <ShieldCheck size={28} />
          </div>
          <div>
            <h1 className="font-black text-xl uppercase tracking-tighter text-slate-800">SuperAdmin Central</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Global Infrastructure Control</p>
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
            className="px-8 py-5 bg-indigo-600 hover:bg-slate-900 text-white font-black rounded-[2rem] flex items-center gap-4 transition-all shadow-2xl shadow-indigo-100 hover:scale-[1.02] active:scale-95"
          >
            <Plus size={24} />
            REGISTER NEW COLLEGE
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Total Institutions</p>
            <div className="flex items-end gap-4">
              <span className="text-5xl font-black text-slate-900">{colleges.length}</span>
              <Building2 className="mb-2 text-indigo-500" size={32} />
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

        {/* College Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {colleges.map((college) => (
            <motion.div 
              layout
              key={college.id}
              className="bg-white group overflow-hidden rounded-[3rem] border border-slate-200 hover:border-indigo-400 transition-all shadow-xl shadow-slate-200/40 relative"
            >
              <div className="p-10">
                <div className="flex justify-between items-start mb-8">
                  <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all border border-slate-100">
                    <School size={32} />
                  </div>
                  <button 
                    onClick={() => setConfirmDelete(college.id)}
                    className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>

                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-2">{college.name}</h3>
                <p className="text-slate-500 font-bold mb-8 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-slate-300" />
                  {college.location}
                </p>

                <div className="space-y-4 pt-6 border-t border-slate-100">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
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
              <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-8 italic">Register Institution</h2>
              
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
                  <button 
                    onClick={handleCreateCollege}
                    disabled={saving}
                    className="flex-[2] py-5 bg-indigo-600 text-white font-black rounded-3xl flex items-center justify-center gap-4 transition-all hover:bg-slate-900 disabled:opacity-50 shadow-xl shadow-indigo-100"
                  >
                    {saving ? <Loader2 className="animate-spin" /> : <ShieldCheck size={20} />}
                    ACTIVATE INSTITUTION
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
