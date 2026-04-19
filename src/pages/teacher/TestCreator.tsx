import { useState, useEffect } from 'react';
import { db, auth } from '../../lib/firebase';
import { collection, query, getDocs, addDoc, serverTimestamp, doc, getDoc, setDoc, where } from 'firebase/firestore';
import { motion } from 'framer-motion';
import { 
  FilePlus, 
  CheckCircle2, 
  Clock, 
  ShieldAlert, 
  LayoutList, 
  Plus, 
  ArrowRight,
  Loader2,
  Settings2
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '../../lib/utils';

export default function TestCreator() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('id');
  
  const [questions, setQuestions] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Test settings
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(60);
  const [passingMarks, setPassingMarks] = useState(40);
  const [forceFullscreen, setForceFullscreen] = useState(true);
  const [shuffleQ, setShuffleQ] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [isPractice, setIsPractice] = useState(false);
  const [authRequired, setAuthRequired] = useState(true);
  
  // Filtering
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [chapterFilter, setChapterFilter] = useState("all");

  useEffect(() => {
    const init = async () => {
      await fetchQuestions();
      if (editId) {
        await loadExistingTest(editId);
      }
    };
    init();
  }, [editId]);

  const loadExistingTest = async (id: string) => {
    try {
      const docSnap = await getDoc(doc(db, 'tests', id));
      if (docSnap.exists()) {
        const data = docSnap.data();
        setTitle(data.title);
        setDuration(data.duration);
        setPassingMarks(data.passingMarks);
        setIsPractice(data.isPractice);
        setForceFullscreen(data.settings.forceFullscreen);
        setShuffleQ(data.settings.shuffleQuestions);
        setShuffleOptions(data.settings.shuffleOptions);
        setAuthRequired(data.settings.authRequired);
        setSelectedIds(data.questionIds);
      }
    } catch (e) {
      console.error("Error loading test:", e);
    }
  };

  const fetchQuestions = async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser?.uid || ''));
      const userData = userDoc.data();
      const collegeId = userData?.collegeId;

      if (!collegeId) return;

      const q = query(collection(db, 'questions'), where('collegeId', '==', collegeId));
      const snap = await getDocs(q);
      setQuestions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTest = async (status: 'active' | 'draft' = 'active') => {
    if (!title || selectedIds.length === 0) return;
    setSaving(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser?.uid || ''));
      const userData = userDoc.data();
      const collegeId = userData?.collegeId;

      const testData = {
        title,
        duration,
        passingMarks,
        isPractice,
        collegeId,
        settings: { 
          forceFullscreen, 
          shuffleQuestions: shuffleQ, 
          shuffleOptions,
          authRequired 
        },
        questionIds: selectedIds,
        teacherId: auth.currentUser?.uid,
        status,
        updatedAt: serverTimestamp(),
        createdAt: editId ? undefined : serverTimestamp()
      };

      if (editId) {
        await setDoc(doc(db, 'tests', editId), testData, { merge: true });
      } else {
        await addDoc(collection(db, 'tests'), { ...testData, createdAt: serverTimestamp() });
      }
      navigate('/teacher');
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const subjects = ['all', ...Array.from(new Set(questions.map(q => q.subject)))];
  const chapters = ['all', ...Array.from(new Set(questions.filter(q => subjectFilter === 'all' || q.subject === subjectFilter).map(q => q.chapter)))];

  const filteredQuestions = questions.filter(q => {
    const sMatch = subjectFilter === 'all' || q.subject === subjectFilter;
    const cMatch = chapterFilter === 'all' || q.chapter === chapterFilter;
    return sMatch && cMatch;
  });

  if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-blue-600" size={48} /></div>;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 pb-20">
      {/* Settings Column */}
      <div className="space-y-6">
        <div className="bg-white p-10 space-y-8 sticky top-24 rounded-[3rem] border border-slate-100 shadow-2xl shadow-slate-200/50">
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-lg">
              <Settings2 size={24} />
            </div>
            <div>
              <h3 className="font-black text-lg uppercase tracking-tight text-slate-800 italic">Configuration</h3>
              <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">Encryption & Protocol</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Examination Title</label>
              <input 
                type="text" 
                placeholder="e.g. Terminal Exam 2026" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl outline-none transition-all font-bold text-slate-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
                  <Clock size={12} /> Limit (m)
                </label>
                <input 
                  type="number" 
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value))}
                  className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl outline-none transition-all font-black text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Passing %</label>
                <input 
                  type="number" 
                  value={passingMarks}
                  onChange={(e) => setPassingMarks(parseInt(e.target.value))}
                  className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl outline-none transition-all font-black text-slate-900"
                />
              </div>
            </div>

            <div className="space-y-3 pt-4">
              {[
                { label: 'Strict Fullscreen', state: forceFullscreen, set: setForceFullscreen, icon: ShieldAlert, color: 'red' },
                { label: 'Shuffle Questions', state: shuffleQ, set: setShuffleQ, icon: LayoutList, color: 'indigo' },
                { label: 'Shuffle Options', state: shuffleOptions, set: setShuffleOptions, icon: CheckCircle2, color: 'emerald' },
                { label: 'Practice Mode', state: isPractice, set: setIsPractice, icon: Plus, color: 'amber' },
                { label: 'Require Auth', state: authRequired, set: setAuthRequired, icon: Settings2, color: 'slate' },
              ].map(opt => (
                <label key={opt.label} className={cn(
                  "flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all border-2",
                  opt.state ? `bg-${opt.color}-50 border-${opt.color}-100` : "bg-slate-50 border-transparent"
                )}>
                  <div className="flex items-center gap-3">
                    <opt.icon size={20} className={opt.state ? `text-${opt.color}-600` : "text-slate-400"} />
                    <span className="text-xs font-black uppercase tracking-tight text-slate-700">{opt.label}</span>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={opt.state}
                    onChange={(e) => opt.set(e.target.checked)}
                    className="w-5 h-5 rounded accent-slate-900"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <button 
              onClick={() => handleCreateTest('active')}
              disabled={saving || !title || selectedIds.length === 0}
              className="w-full py-6 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-[2rem] flex items-center justify-center gap-4 transition-all shadow-2xl shadow-slate-200 active:scale-[0.98] disabled:opacity-30 disabled:pointer-events-none"
            >
              {saving ? <Loader2 className="animate-spin" /> : <ArrowRight size={24} />}
              DEPLOY ASSESSMENT
            </button>

            <button 
              onClick={() => handleCreateTest('draft')}
              disabled={saving || !title || selectedIds.length === 0}
              className="w-full py-4 bg-white border-2 border-slate-100 hover:border-indigo-600 text-slate-600 hover:text-indigo-600 font-black rounded-[2rem] flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-30 disabled:pointer-events-none"
            >
              <FilePlus size={20} />
              SAVE AS DRAFT
            </button>
          </div>
        </div>
      </div>

      {/* Select Questions Column */}
      <div className="xl:col-span-2 space-y-8">
        <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/40 flex flex-col md:flex-row gap-6 justify-between items-center">
          <div>
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter italic">Selection Matrix</h3>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] font-black text-white bg-indigo-600 px-3 py-1 rounded-full uppercase tracking-widest leading-none">
                {selectedIds.length} Selections
              </span>
              <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-3 py-1 rounded-full uppercase tracking-widest leading-none">
                {filteredQuestions.length} Match
              </span>
            </div>
          </div>
          
          <div className="flex gap-4 w-full md:w-auto">
             <button 
               onClick={() => setSelectedIds([])}
               className="p-3 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-100 transition-all"
             >
               Deselect All
             </button>
             <select 
               value={subjectFilter}
               onChange={e => {
                 setSubjectFilter(e.target.value);
                 setChapterFilter('all');
               }}
               className="p-3 bg-slate-50 border border-slate-100 rounded-xl font-black text-[10px] uppercase tracking-widest outline-none"
             >
               {subjects.map(s => <option key={s} value={s}>{s}</option>)}
             </select>
             <select 
               value={chapterFilter}
               onChange={e => setChapterFilter(e.target.value)}
               className="p-3 bg-slate-50 border border-slate-100 rounded-xl font-black text-[10px] uppercase tracking-widest outline-none"
             >
               {chapters.map(c => <option key={c} value={c}>{c}</option>)}
             </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredQuestions.map((q) => {
            const isSelected = selectedIds.includes(q.id);
            return (
              <div 
                key={q.id}
                onClick={() => toggleSelection(q.id)}
                className={cn(
                  "bg-white p-8 rounded-[3rem] border-2 cursor-pointer group relative overflow-hidden transition-all",
                  isSelected 
                  ? 'border-indigo-600 bg-indigo-50/20 shadow-2xl shadow-indigo-100' 
                  : 'border-transparent hover:border-slate-200 shadow-xl shadow-slate-100/50'
                )}
              >
                <div className="flex items-start gap-4">
                  <div className={cn(
                    "shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center border-2 transition-all",
                    isSelected ? "bg-indigo-600 border-indigo-600 text-white" : "bg-slate-50 border-transparent text-slate-300 group-hover:bg-slate-100"
                  )}>
                    {isSelected ? <CheckCircle2 size={24} /> : <Plus size={24} />}
                  </div>
                  <div className="flex-1">
                    <div className="flex gap-2 mb-3">
                       <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded leading-none">{q.subject}</span>
                    </div>
                    <p className="font-bold text-slate-800 leading-relaxed line-clamp-3">{q.text}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-4 italic">{q.chapter}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
