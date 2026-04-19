import { useState, useEffect, ChangeEvent } from 'react';
import { db, auth } from '../../lib/firebase';
import { collection, query, getDocs, addDoc, serverTimestamp, orderBy, deleteDoc, doc, setDoc, where, getDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, BrainCircuit, Search, Loader2, CheckCircle2, Trash2, BookOpen, LayoutDashboard, ShieldCheck, Edit3, FileUp, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { generateQuestionsAI } from '../../services/geminiService';
import * as pdfjs from 'pdfjs-dist';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export default function QuestionBank() {
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<any>(null);
  
  // Filtering states
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSubject, setActiveSubject] = useState("all");
  const [activeChapter, setActiveChapter] = useState("all");

  // AI Form state
  const [aiTopic, setAiTopic] = useState("");
  const [aiCount, setAiCount] = useState(5);
  const [aiDiff, setAiDiff] = useState("medium");
  const [aiSubject, setAiSubject] = useState("Electrician");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [isReadingFile, setIsReadingFile] = useState(false);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);
    setIsReadingFile(true);
    try {
      let content = "";
      const extension = file.name.split('.').pop()?.toLowerCase();

      if (extension === 'pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const text = await page.getTextContent();
          content += text.items.map((item: any) => item.str).join(' ');
        }
      } else if (extension === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        content = result.value;
      } else if (extension === 'xlsx' || extension === 'xls') {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer);
        workbook.SheetNames.forEach(name => {
          const sheet = workbook.Sheets[name];
          content += XLSX.utils.sheet_to_txt(sheet);
        });
      } else {
        content = await file.text();
      }
      setFileContent(content.slice(0, 15000)); // Limit to 15k chars for prompt
    } catch (err) {
      console.error("File Read Error:", err);
      alert("Failed to read file content.");
    } finally {
      setIsReadingFile(false);
    }
  };

  const generateWithAi = async () => {
    if (!aiTopic && !fileContent) return;
    setIsGenerating(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser?.uid || ''));
      const userData = userDoc.data();
      const collegeId = userData?.collegeId;

      const questionsData = await generateQuestionsAI(aiSubject, aiTopic, aiDiff, aiCount, fileContent);
      
      for (const q of questionsData) {
        await addDoc(collection(db, 'questions'), {
          ...q,
          collegeId,
          subject: aiSubject,
          chapter: aiTopic || (uploadedFile?.name.split('.')[0]) || "AI Generated",
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser?.uid
        });
      }
      
      fetchQuestions();
      setShowAiModal(false);
      setAiTopic("");
      setUploadedFile(null);
      setFileContent("");
    } catch (e) {
      console.error(e);
      alert("AI Generation failed. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredQuestions = questions.filter(q => {
    const matchesSearch = q.text.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         q.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         q.chapter.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSubject = activeSubject === 'all' || q.subject === activeSubject;
    const matchesChapter = activeChapter === 'all' || q.chapter === activeChapter;
    return matchesSearch && matchesSubject && matchesChapter;
  });

  const subjects = ['all', ...Array.from(new Set(questions.map(q => q.subject)))] as string[];
  const chapters = ['all', ...Array.from(new Set(questions.filter(q => activeSubject === 'all' || q.subject === activeSubject).map(q => q.chapter)))] as string[];

  const handleSubjectChange = (s: string) => {
    setActiveSubject(s);
    setActiveChapter('all');
  };

  // Manual Form State
  const initialForm = {
    text: "",
    subject: "",
    chapter: "",
    options: { A: "", B: "", C: "", D: "" },
    answer: "A",
    difficulty: "medium",
    explanation: "",
    imageUrl: "",
  };
  const [form, setForm] = useState(initialForm);
  const [savingManual, setSavingManual] = useState(false);

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser?.uid || ''));
      const userData = userDoc.data();
      const collegeId = userData?.collegeId;

      if (!collegeId) return;

      const q = query(
        collection(db, 'questions'), 
        where('collegeId', '==', collegeId),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setQuestions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSave = async () => {
    if (!form.text || !form.subject || !form.chapter) return;
    setSavingManual(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser?.uid || ''));
      const userData = userDoc.data();
      const collegeId = userData?.collegeId;

      const data = {
        ...form,
        collegeId,
        updatedAt: serverTimestamp(),
        createdAt: editingQuestion ? undefined : serverTimestamp(),
        createdBy: auth.currentUser?.uid
      };
      
      if (editingQuestion) {
        await setDoc(doc(db, 'questions', editingQuestion.id), data, { merge: true });
      } else {
        await addDoc(collection(db, 'questions'), { ...data, createdAt: serverTimestamp() });
      }
      
      setShowManualModal(false);
      setEditingQuestion(null);
      setForm(initialForm);
      fetchQuestions();
    } catch (e) {
      console.error(e);
    } finally {
      setSavingManual(false);
    }
  };

  const deleteQuestion = async (id: string) => {
    if (!confirm("Are you sure?")) return;
    try {
      await deleteDoc(doc(db, 'questions', id));
      fetchQuestions();
    } catch (e) {
      console.error(e);
    }
  };

  const handleEditQuestion = (q: any) => {
    setEditingQuestion(q);
    setForm({
      text: q.text,
      subject: q.subject,
      chapter: q.chapter,
      options: q.options,
      answer: q.answer,
      difficulty: q.difficulty,
      explanation: q.explanation || "",
      imageUrl: q.imageUrl || "",
    });
    setShowManualModal(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40">
        <div>
          <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter italic">Question Architecture</h3>
          <p className="text-sm text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-1">Hierarchical Subject-Chapter Repository</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => setShowAiModal(true)}
            className="flex items-center gap-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-black px-6 py-4 rounded-2xl border border-indigo-200 transition-all shadow-sm group"
          >
            <BrainCircuit size={20} className="group-hover:rotate-12 transition-transform" />
            <span className="text-xs uppercase tracking-widest leading-none">AI Generator</span>
          </button>
          <button 
            onClick={() => setShowManualModal(true)}
            className="flex items-center gap-2 bg-slate-900 text-white hover:bg-slate-800 font-black px-6 py-4 rounded-2xl transition-all shadow-xl shadow-slate-200"
          >
            <Plus size={20} />
            <span className="text-xs uppercase tracking-widest leading-none">Add Manually</span>
          </button>
        </div>
      </div>

      <div className="relative group">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={24} />
        <input 
          type="text" 
          placeholder="Filter by subject, chapter, or question text..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-16 pr-8 py-6 bg-white border border-slate-100 rounded-[2rem] shadow-xl shadow-slate-200/40 focus:border-blue-600 outline-none transition-all font-bold text-slate-700"
        />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {subjects.map(s => (
            <button
              key={s}
              onClick={() => handleSubjectChange(s)}
              className={cn(
                "px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest border transition-all",
                activeSubject === s ? "bg-indigo-600 border-indigo-600 text-white shadow-lg" : "bg-white border-slate-100 text-slate-400 hover:border-slate-300"
              )}
            >
              {s}
            </button>
          ))}
        </div>
        {activeSubject !== 'all' && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
            {chapters.map(c => (
              <button
                key={c}
                onClick={() => setActiveChapter(c)}
                className={cn(
                  "px-4 py-2 rounded-lg font-bold text-[9px] uppercase tracking-widest border transition-all",
                  activeChapter === c ? "bg-slate-900 border-slate-900 text-white" : "bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100"
                )}
              >
                {c === 'all' ? 'All Chapters' : c}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 grayscale opacity-40">
          <Loader2 className="animate-spin text-blue-600 mb-6" size={48} />
          <p className="font-black text-slate-500 uppercase tracking-[0.3em] text-[10px]">Syncing Knowledge Base</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pb-24">
          {filteredQuestions.map((q) => (
            <motion.div 
              key={q.id} 
              layout
              className="bg-white p-8 rounded-[3rem] border border-slate-100 hover:border-blue-400 transition-all shadow-xl shadow-slate-200/50 group flex flex-col"
            >
              <div className="flex justify-between items-start mb-6">
                <div className="flex flex-wrap gap-2">
                  <div className="px-3 py-1 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                    <BookOpen size={10} /> {q.subject}
                  </div>
                  <div className="px-3 py-1 bg-slate-50 text-slate-500 border border-slate-100 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                    <LayoutDashboard size={10} /> {q.chapter}
                  </div>
                  <div className={cn(
                    "px-3 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest",
                    q.difficulty === 'hard' ? 'bg-red-50 text-red-600 border-red-100' : 
                    q.difficulty === 'medium' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                  )}>
                    {q.difficulty}
                  </div>
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                  <button 
                    onClick={() => handleEditQuestion(q)}
                    className="p-3 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all"
                  >
                    <Edit3 size={20} />
                  </button>
                  <button 
                    onClick={() => deleteQuestion(q.id)}
                    className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>

              {q.imageUrl && (
                <div className="w-full h-48 bg-slate-50 rounded-3xl mb-6 overflow-hidden border border-slate-100">
                   <img src={q.imageUrl} alt="Diagram" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                </div>
              )}

              <h4 className="font-bold text-slate-800 text-lg mb-8 leading-relaxed line-clamp-3">{q.text}</h4>

              {q.explanation && (
                <div className="mb-6 p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl text-[10px] font-bold text-indigo-700">
                  <span className="uppercase tracking-widest block mb-1 opacity-50">Solution Logic:</span>
                  {q.explanation}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-auto">
                {Object.entries(q.options).map(([key, text]) => (
                  <div key={key} className={cn(
                    "p-4 rounded-2xl border flex items-center gap-4 text-xs transition-all relative overflow-hidden group/option",
                    key === q.answer ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-bold" : "bg-slate-50/50 border-slate-100 text-slate-500"
                  )}>
                    <div className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border-2 font-black text-xs",
                      key === q.answer ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-slate-200 text-slate-400"
                    )}>{key}</div>
                    <span className="truncate flex-1">{text as string}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Manual Add Modal */}
      <AnimatePresence>
        {showManualModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 sm:p-12 overflow-y-auto bg-slate-900/40 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl relative overflow-hidden p-10 flex flex-col max-h-[90vh]"
            >
              <div className="flex justify-between items-center mb-8 shrink-0">
                <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter italic">
                  {editingQuestion ? 'Modify Asset' : 'Manual Assembly'}
                </h3>
                <button onClick={() => {
                  setShowManualModal(false);
                  setEditingQuestion(null);
                  setForm(initialForm);
                }} className="p-4 hover:bg-slate-100 rounded-full transition-all">
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Basic Data */}
                  <div className="space-y-6">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Subject Area</label>
                      <input 
                        type="text" 
                        value={form.subject}
                        onChange={e => setForm({...form, subject: e.target.value})}
                        placeholder="e.g. Electrician Theory"
                        className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl transition-all font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Chapter / Topic</label>
                      <input 
                        type="text" 
                        value={form.chapter}
                        onChange={e => setForm({...form, chapter: e.target.value})}
                        placeholder="e.g. Chapter 4: Circuit Theorems"
                        className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl transition-all font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Question Content</label>
                      <textarea 
                        value={form.text}
                        onChange={e => setForm({...form, text: e.target.value})}
                        placeholder="State the question clearly..."
                        className="w-full p-4 h-32 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl transition-all font-medium resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Diagram URL (Optional)</label>
                      <input 
                        type="text" 
                        value={form.imageUrl}
                        onChange={e => setForm({...form, imageUrl: e.target.value})}
                        placeholder="https://..."
                        className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl transition-all font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Explanation (Optional)</label>
                      <textarea 
                        value={form.explanation}
                        onChange={e => setForm({...form, explanation: e.target.value})}
                        placeholder="Explain why the answer is correct..."
                        className="w-full p-4 h-24 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl transition-all font-medium resize-none"
                      />
                    </div>
                  </div>

                  {/* Options Mapping */}
                  <div className="space-y-6">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Response Matrix</label>
                    <div className="grid grid-cols-1 gap-4">
                      {['A', 'B', 'C', 'D'].map(key => (
                         <div key={key} className="flex items-center gap-4">
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center font-black transition-all cursor-pointer border-2",
                              form.answer === key ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200 text-slate-400"
                            )} onClick={() => setForm({...form, answer: key as any})}>
                              {key}
                            </div>
                            <input 
                              type="text" 
                              value={(form.options as any)[key]}
                              onChange={e => setForm({...form, options: {...form.options, [key]: e.target.value}})}
                              className="flex-1 p-4 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl transition-all font-bold"
                              placeholder={`Option ${key}`}
                            />
                         </div>
                      ))}
                    </div>
                    
                    <div className="pt-4 grid grid-cols-2 gap-4">
                       <div>
                         <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Difficulty</label>
                         <select 
                           value={form.difficulty}
                           onChange={e => setForm({...form, difficulty: e.target.value})}
                           className="w-full p-4 bg-slate-50 rounded-2xl font-black uppercase text-xs"
                         >
                           <option value="easy">Easy</option>
                           <option value="medium">Medium</option>
                           <option value="hard">Hard</option>
                         </select>
                       </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-8 flex gap-4 shrink-0">
                <button onClick={() => {
                  setShowManualModal(false);
                  setEditingQuestion(null);
                  setForm(initialForm);
                }} className="flex-1 py-4 font-black text-slate-400 uppercase tracking-widest text-[10px] hover:text-slate-600 transition-all">Discard</button>
                <button 
                  onClick={handleManualSave}
                  disabled={savingManual || !form.text || !form.subject || !form.chapter}
                  className="flex-[2] py-5 bg-indigo-600 text-white font-black rounded-3xl transition-all hover:bg-slate-900 shadow-2xl shadow-indigo-100 disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {savingManual ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={20} />}
                  {editingQuestion ? 'UPDATE KNOWLEDGE' : 'PERSIST TO BANK'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AI Generate Modal */}
      <AnimatePresence>
        {showAiModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-slate-100 flex items-center gap-4 bg-gradient-to-r from-indigo-50 to-white">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white">
                  <BrainCircuit size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800">AI MCQ Engine</h3>
                  <p className="text-sm text-slate-500 font-medium">Auto-generate questions from topics</p>
                </div>
              </div>
              
              <div className="p-8 space-y-6">
                <div>
                  <label className="block text-sm font-black text-slate-700 uppercase tracking-widest mb-2">Subject / Batch</label>
                  <select 
                    value={aiSubject}
                    onChange={(e) => setAiSubject(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 outline-none transition-all font-bold text-slate-700"
                  >
                    <option>Electrician</option>
                    <option>RAC Trade</option>
                    <option>Workshop Calculation</option>
                    <option>Employability Skills</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-black text-slate-700 uppercase tracking-widest mb-2">Topic or Text Context</label>
                  <textarea 
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                    placeholder="e.g. Ohms law basics, parallel vs series circuits..."
                    className="w-full p-4 h-32 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 outline-none transition-all font-medium resize-none"
                  />
                  <p className="text-xs text-slate-400 mt-2">The more specific context you provide, the better the questions.</p>
                </div>

                <div className="bg-slate-50 p-6 rounded-2xl border-2 border-dashed border-slate-200 group-hover:border-indigo-400 transition-all">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <FileUp size={24} className="text-indigo-600" />
                      <div>
                        <p className="text-xs font-black uppercase text-slate-700">Source Document</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">PDF, DOCX, XLSX</p>
                      </div>
                    </div>
                    {uploadedFile && (
                      <button 
                        onClick={() => { setUploadedFile(null); setFileContent(""); }}
                        className="p-2 hover:bg-red-50 text-red-500 rounded-lg"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  
                  {uploadedFile ? (
                    <div className="bg-white p-3 rounded-xl border border-indigo-100 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-indigo-600 truncate max-w-[200px]">{uploadedFile.name}</span>
                      {isReadingFile ? <Loader2 size={12} className="animate-spin text-indigo-600" /> : <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                    </div>
                  ) : (
                    <label className="cursor-pointer">
                      <input type="file" className="hidden" accept=".pdf,.docx,.xlsx,.xls,.txt" onChange={handleFileChange} />
                      <div className="py-4 text-center border-2 border-slate-200 border-dashed rounded-xl hover:bg-white hover:border-indigo-600 transition-all">
                        <span className="text-[10px] font-black uppercase text-slate-400">Click to Upload Materials</span>
                      </div>
                    </label>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-black text-slate-700 uppercase tracking-widest mb-2">Number of Questions</label>
                    <input 
                      type="number" 
                      value={aiCount}
                      onChange={(e) => setAiCount(parseInt(e.target.value))}
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 outline-none transition-all font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-black text-slate-700 uppercase tracking-widest mb-2">Difficulty</label>
                    <select 
                      value={aiDiff}
                      onChange={(e) => setAiDiff(e.target.value)}
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 outline-none transition-all font-bold"
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-4">
                <button 
                  onClick={() => setShowAiModal(false)}
                  className="px-6 py-3.5 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl flex-1 hover:bg-slate-100 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={generateWithAi}
                  disabled={isGenerating || !aiTopic}
                  className="px-6 py-3.5 bg-indigo-600 text-white font-bold rounded-xl flex-1 flex items-center justify-center gap-2 hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <BrainCircuit size={20} />
                      Start Generation
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
