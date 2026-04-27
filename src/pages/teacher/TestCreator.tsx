import { useState, useEffect } from 'react';
import { db, auth } from '../../lib/firebase';
import { collection, query, getDocs, addDoc, serverTimestamp, doc, getDoc, setDoc, where, updateDoc, orderBy } from 'firebase/firestore';
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
  Settings2,
  Eye,
  EyeOff,
  Pencil
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { fetchAccessibleQuestions } from '../../lib/questionAccess';
import MathRenderer from '../../components/MathRenderer';
import { useAuth } from '../../context/AuthContext';
import { resolveTeacherAssignedClass, sanitizeLegacyDocId } from '../../lib/classAccess';

type TestCreatorProps = {
  collegeIdOverride?: string;
  viewerMode?: 'teacher' | 'college';
  teacherIdsOverride?: string[];
  classIdOverride?: string;
};

export default function TestCreator({
  collegeIdOverride,
  viewerMode = 'teacher',
  teacherIdsOverride,
  classIdOverride,
}: TestCreatorProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('id');
  const { profile } = useAuth();
  
  const [questions, setQuestions] = useState<any[]>([]);
  const [teacherTests, setTeacherTests] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assignedClassId, setAssignedClassId] = useState<string | null>(null);

  // Test settings
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(60);
  const [passingMarks, setPassingMarks] = useState(40);
  const [forceFullscreen, setForceFullscreen] = useState(true);
  const [shuffleQ, setShuffleQ] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [isPractice, setIsPractice] = useState(false);
  const [authRequired, setAuthRequired] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  
  // Filtering
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [chapterFilter, setChapterFilter] = useState("all");
  const [showChapterLabels, setShowChapterLabels] = useState(true);

  const dedupeById = <T extends { id: string }>(items: T[]) => Array.from(new Map(items.map((item) => [item.id, item])).values());

  useEffect(() => {
    const init = async () => {
      await fetchQuestions(collegeIdOverride || profile?.collegeId);
      if (editId) {
        await loadExistingTest(editId);
      }
    };
    init();
  }, [editId, profile, collegeIdOverride, viewerMode, classIdOverride]);

  const loadExistingTest = async (id: string) => {
    try {
      const docSnap = await getDoc(doc(db, 'tests', id));
      if (docSnap.exists()) {
        const data = docSnap.data();
        setTitle(data.title);
        setDuration(data.duration);
        setPassingMarks(data.passingMarks);
        setIsPractice(data.isPractice || false);
        setIsVisible(data.visible !== undefined ? data.visible : true);
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

  const fetchQuestions = async (collegeIdArg?: string) => {
    try {
      const collegeId = collegeIdArg || collegeIdOverride || profile?.collegeId;

      if (!collegeId) return;
      const activeClassId = viewerMode === 'teacher'
        ? classIdOverride || assignedClassId || (await resolveTeacherAssignedClass(db, {
            collegeId,
            user: auth.currentUser,
            profile,
          }))?.id || null
        : classIdOverride || null;

      if (viewerMode === 'teacher') {
        setAssignedClassId(activeClassId);
      }

      const fetchedQuestions = await fetchAccessibleQuestions(db, collegeId);
      setQuestions(fetchedQuestions);

      if (viewerMode === 'college') {
        const fallbackTeacherIds = teacherIdsOverride?.length
          ? teacherIdsOverride
          : Array.from(
              new Set(
                [auth.currentUser?.uid, sanitizeLegacyDocId(auth.currentUser?.email)].filter(
                  (value): value is string => !!value
                )
              )
            );

        const scopedQueries = [getDocs(query(collection(db, 'tests'), where('collegeId', '==', collegeId)))];
        fallbackTeacherIds.forEach((teacherId) => {
          scopedQueries.push(getDocs(query(collection(db, 'tests'), where('teacherId', '==', teacherId))));
        });

        const scopedResults = await Promise.allSettled(scopedQueries);
        const tests = dedupeById(
          scopedResults.flatMap((result) =>
            result.status === 'fulfilled'
              ? result.value.docs.map((testDoc) => ({ id: testDoc.id, ...testDoc.data() }))
              : []
          ) as any[]
        ).filter((test: any) => test.collegeId === collegeId || !test.collegeId);

        setTeacherTests([...tests].sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
        return;
      }

      const testsQuery = query(
        collection(db, 'tests'),
        where('collegeId', '==', collegeId),
        where('teacherId', '==', auth.currentUser?.uid)
      );
      const testSnap = await getDocs(testsQuery);
      const tests = testSnap.docs
        .map(testDoc => ({ id: testDoc.id, ...testDoc.data() }))
        .filter((test: any) => !activeClassId || test.classId === activeClassId);
      setTeacherTests([...tests].sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
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
      const collegeId = collegeIdOverride || profile?.collegeId;
      if (!collegeId) throw new Error("College context missing.");

      const baseTestData = {
        title,
        duration,
        passingMarks,
        isPractice,
        visible: isVisible,
        collegeId,
        classId: viewerMode === 'teacher' ? (classIdOverride || assignedClassId || profile?.classId || null) : (classIdOverride || null),
        settings: { 
          forceFullscreen, 
          shuffleQuestions: shuffleQ, 
          shuffleOptions,
          authRequired 
        },
        questionIds: selectedIds,
        teacherId: auth.currentUser?.uid || '',
        status,
        updatedAt: serverTimestamp(),
      };

      if (editId) {
        await setDoc(doc(db, 'tests', editId), {
          ...baseTestData,
          createdAt: serverTimestamp(),
        }, { merge: true });
      } else {
        await addDoc(collection(db, 'tests'), {
          ...baseTestData,
          createdAt: serverTimestamp()
        });
      }
      await fetchQuestions(collegeId);
      if (viewerMode === 'teacher') {
        navigate('/teacher');
      }
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Failed to deploy assessment.");
    } finally {
      setSaving(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectVisible = () => {
    const visibleIds = filteredQuestions.map(q => q.id);
    setSelectedIds(prev => Array.from(new Set([...prev, ...visibleIds])));
  };

  const deselectVisible = () => {
    const visibleIds = filteredQuestions.map(q => q.id);
    setSelectedIds(prev => prev.filter(id => !visibleIds.includes(id)));
  };

  const toggleTestVisibility = async (testId: string, currentVisibility: boolean | undefined) => {
    try {
      const nextVisibility = currentVisibility === false ? true : false;
      await updateDoc(doc(db, 'tests', testId), {
        visible: nextVisibility,
        updatedAt: serverTimestamp(),
      });
      setTeacherTests(prev => prev.map(test => test.id === testId ? { ...test, visible: nextVisibility } : test));
    } catch (error) {
      console.error('Failed to toggle test visibility:', error);
    }
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
                { label: 'Visible to Students', state: isVisible, set: setIsVisible, icon: CheckCircle2, color: 'emerald' },
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
              <label className="flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all border-2 bg-slate-50 border-transparent">
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={20} className={showChapterLabels ? "text-indigo-600" : "text-slate-400"} />
                  <span className="text-xs font-black uppercase tracking-tight text-slate-700">Show Chapter Label in Pallet</span>
                </div>
                <input
                  type="checkbox"
                  checked={showChapterLabels}
                  onChange={(e) => setShowChapterLabels(e.target.checked)}
                  className="w-5 h-5 rounded accent-slate-900"
                />
              </label>
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
               onClick={selectVisible}
               className="p-3 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-100 transition-all"
             >
               Select Page
             </button>
             <button 
               onClick={deselectVisible}
               className="p-3 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-100 transition-all"
             >
               Clear Page
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

        <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/30 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight italic">Test Registry</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                {viewerMode === 'college'
                  ? 'Principal or super admin can monitor and toggle any college test instantly'
                  : 'Use the switch to show or hide any test from students instantly'}
              </p>
            </div>
            <div className="px-4 py-2 bg-slate-50 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 border border-slate-100">
              {teacherTests.length} total tests
            </div>
          </div>

          <div className="space-y-3">
            {teacherTests.map((test) => (
              <div key={test.id} className="p-5 rounded-[2rem] border border-slate-100 bg-slate-50/60 flex flex-col lg:flex-row lg:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border",
                      test.visible === false ? "bg-rose-50 text-rose-600 border-rose-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"
                    )}>
                      {test.visible === false ? 'Hidden' : 'Visible'}
                    </span>
                    <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border bg-indigo-50 text-indigo-600 border-indigo-100">
                      {test.status}
                    </span>
                    {viewerMode === 'college' && test.teacherId && (
                      <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border bg-slate-100 text-slate-500 border-slate-200">
                        {test.teacherId}
                      </span>
                    )}
                    {test.isPractice && (
                      <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border bg-amber-50 text-amber-600 border-amber-100">
                        Practice
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">{test.title}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                    {test.questionIds?.length || 0} questions • {test.duration} min • pass {test.passingMarks}%
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate(`/teacher/create-test?id=${test.id}`)}
                    className="px-4 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-all flex items-center gap-2"
                  >
                    <Pencil size={14} />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleTestVisibility(test.id, test.visible)}
                    className={cn(
                      "px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 border",
                      test.visible === false
                        ? "bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100"
                        : "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
                    )}
                  >
                    {test.visible === false ? <Eye size={14} /> : <EyeOff size={14} />}
                    {test.visible === false ? 'Show to Students' : 'Hide from Students'}
                  </button>
                </div>
              </div>
            ))}

            {teacherTests.length === 0 && (
              <div className="py-10 text-center text-slate-400 font-black uppercase tracking-widest text-[10px] border border-dashed border-slate-200 rounded-[2rem] bg-slate-50/50">
                No tests created yet
              </div>
            )}
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
                    <MathRenderer content={q.text} className="font-bold text-slate-800 leading-relaxed text-sm line-clamp-3" />
                    {showChapterLabels && (
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-4 italic">{q.chapter}</p>
                    )}
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
