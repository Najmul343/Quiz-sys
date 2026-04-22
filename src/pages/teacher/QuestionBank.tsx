import React, { useState, useEffect, ChangeEvent, useRef, useDeferredValue, useMemo } from 'react';
import { db, auth } from '../../lib/firebase';
import { collection, query, getDocs, addDoc, serverTimestamp, deleteDoc, doc, setDoc, where, getDoc, writeBatch, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  BrainCircuit, 
  Search, 
  Loader2, 
  CheckCircle2, 
  Trash2, 
  BookOpen, 
  LayoutDashboard, 
  ShieldCheck, 
  Edit3, 
  FileUp, 
  X,
  Image as ImageIcon,
  Clipboard,
  Camera,
  AlertTriangle,
  Info
} from 'lucide-react';
import { cn, getDirectImageUrl } from '../../lib/utils';
import { resolveTeacherAssignedClass } from '../../lib/classAccess';
import { fetchAccessibleQuestions } from '../../lib/questionAccess';
import { generateQuestionsAI } from '../../services/geminiService';
import * as pdfjs from 'pdfjs-dist';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import MathRenderer from '../../components/MathRenderer';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type QuestionBankProps = {
  collegeIdOverride?: string;
  mode?: 'teacher' | 'principal' | 'superadmin';
  classOptions?: any[];
  classIdOverride?: string;
};

export default function QuestionBank({ collegeIdOverride, mode = 'teacher', classOptions = [], classIdOverride }: QuestionBankProps) {
  const [questions, setQuestions] = useState<any[]>([]);
  const [availableColleges, setAvailableColleges] = useState<any[]>([]);
  const [availableClasses, setAvailableClasses] = useState<any[]>(classOptions);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<any>(null);
  const [savingRename, setSavingRename] = useState(false);
  const [sharingQuestionBank, setSharingQuestionBank] = useState(false);
  const [shareNote, setShareNote] = useState('');
  const [shareTargetCollegeId, setShareTargetCollegeId] = useState('');
  const [shareTargetClassId, setShareTargetClassId] = useState('');
  const [shareScopeType, setShareScopeType] = useState<'subject' | 'chapter'>('subject');
  const [shareGrants, setShareGrants] = useState<any[]>([]);
  const [loadingShareGrants, setLoadingShareGrants] = useState(false);
  const [renameSubjectFrom, setRenameSubjectFrom] = useState('');
  const [renameSubjectTo, setRenameSubjectTo] = useState('');
  const [renameChapterFrom, setRenameChapterFrom] = useState('');
  const [renameChapterTo, setRenameChapterTo] = useState('');
  const [renameMessage, setRenameMessage] = useState<string | null>(null);
  
  // Filtering states
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSubject, setActiveSubject] = useState("all");
  const [activeChapter, setActiveChapter] = useState("all");

  // AI Form state
  const [aiTopic, setAiTopic] = useState("");
  const [aiCount, setAiCount] = useState(5);
  const [aiDiff, setAiDiff] = useState("medium");
  const [aiSubject, setAiSubject] = useState("");
  const [aiChapter, setAiChapter] = useState("");
  const [bulkSubject, setBulkSubject] = useState("");
  const [bulkChapter, setBulkChapter] = useState("");
  const [bulkContext, setBulkContext] = useState("");
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [teacherClassId, setTeacherClassId] = useState<string | null>(null);
  const [classScopeNotice, setClassScopeNotice] = useState<string | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const triggerImageUpload = (type: 'main' | 'A' | 'B' | 'C' | 'D') => {
    (fileInputRef.current as any).dataset.target = type;
    fileInputRef.current?.click();
  };

  const handleImageInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const type = (e.target as any).dataset.target || 'main';
    if (file) handleImageFile(file, type);
  };

  const handleImageFile = (file: File, type: 'main' | 'A' | 'B' | 'C' | 'D') => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      if (type === 'main') {
        setForm(prev => ({ ...prev, imageUrl: base64 }));
      } else {
        setForm(prev => ({ ...prev, optionImages: { ...prev.optionImages, [type]: base64 } }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePasteInModal = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            if (blob) handleImageFile(blob, 'main');
        }
    }
  };

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
    if ((!aiTopic && !fileContent) || !aiSubject || !aiChapter || aiCount < 1) {
      alert("Please choose subject, chapter, and at least 1 question.");
      return;
    }
    setIsGenerating(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser?.uid || ''));
      const userData = userDoc.data();
      const collegeId = userData?.collegeId;
      const assignedClassId = mode === 'teacher'
        ? teacherClassId || (await resolveTeacherAssignedClass(db, {
            collegeId,
            user: auth.currentUser,
            profile: userData || null,
          }))?.id || null
        : null;

      const questionsData = await generateQuestionsAI(aiSubject, aiTopic, aiDiff, aiCount, fileContent);
      
      for (const q of questionsData) {
        await addDoc(collection(db, 'questions'), {
          ...q,
          collegeId,
          needsImage: q.needsImage || false,
          imageDescription: q.imageDescription || "",
          subject: aiSubject,
          chapter: aiChapter || aiTopic || (uploadedFile?.name.split('.')[0]) || "AI Generated",
          classId: assignedClassId,
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser?.uid
        });
      }
      
      fetchQuestions();
      setShowAiModal(false);
      setAiTopic("");
      setAiChapter("");
      setUploadedFile(null);
      setFileContent("");
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "AI Generation failed. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredQuestions = useMemo(() => questions.filter(q => {
    const search = deferredSearchQuery.toLowerCase();
    const matchesSearch = (q.text || '').toLowerCase().includes(search) ||
                         (q.subject || '').toLowerCase().includes(search) ||
                         (q.chapter || '').toLowerCase().includes(search);
    const matchesSubject = activeSubject === 'all' || q.subject === activeSubject;
    const matchesChapter = activeChapter === 'all' || q.chapter === activeChapter;
    return matchesSearch && matchesSubject && matchesChapter;
  }), [activeChapter, activeSubject, deferredSearchQuery, questions]);

  const subjects = useMemo(() => ['all', ...Array.from(new Set(questions.map(q => q.subject).filter(Boolean)))], [questions]) as string[];
  const chapters = useMemo(() => ['all', ...Array.from(new Set(questions.filter(q => activeSubject === 'all' || q.subject === activeSubject).map(q => q.chapter).filter(Boolean)))], [activeSubject, questions]) as string[];

  const uniqueSubjects = useMemo(() => Array.from(new Set(questions.map(q => q.subject).filter(Boolean))) as string[], [questions]);
  const uniqueChapters = useMemo(() => Array.from(new Set(questions.filter(q => !aiSubject || q.subject === aiSubject).map(q => q.chapter).filter(Boolean))) as string[], [aiSubject, questions]);

  const handleSubjectChange = (s: string) => {
    setActiveSubject(s);
    setActiveChapter('all');
  };

  const commitBatchChunks = async (updates: Array<(batch: ReturnType<typeof writeBatch>) => void>, chunkSize = 350) => {
    for (let i = 0; i < updates.length; i += chunkSize) {
      const batch = writeBatch(db);
      updates.slice(i, i + chunkSize).forEach((apply) => apply(batch));
      await batch.commit();
    }
  };

  const openRenameModal = () => {
    setRenameMessage(null);
    setRenameSubjectFrom(activeSubject !== 'all' ? activeSubject : uniqueSubjects[0] || '');
    setRenameChapterFrom(activeChapter !== 'all' ? activeChapter : uniqueChapters[0] || '');
    setRenameSubjectTo('');
    setRenameChapterTo('');
    setShowRenameModal(true);
  };

  const handleRenameTags = async () => {
    const subjectFrom = renameSubjectFrom.trim();
    const subjectTo = renameSubjectTo.trim();
    const chapterFrom = renameChapterFrom.trim();
    const chapterTo = renameChapterTo.trim();

    if (!subjectFrom && !chapterFrom) {
      setRenameMessage('Choose at least one source tag to rename.');
      return;
    }
    if (!subjectTo && !chapterTo) {
      setRenameMessage('Enter at least one new tag value.');
      return;
    }

    const userDoc = await getDoc(doc(db, 'users', auth.currentUser?.uid || ''));
    const userData = userDoc.data();
    const collegeId = collegeIdOverride || userData?.collegeId;
    if (!collegeId) {
      setRenameMessage('College context missing.');
      return;
    }

    const sourceQuestions = questions.filter((question) => {
      if (question.collegeId !== collegeId) return false;
      const subjectMatches = !subjectFrom || question.subject === subjectFrom;
      const chapterMatches = !chapterFrom || question.chapter === chapterFrom;
      return subjectMatches && chapterMatches;
    });

    if (!sourceQuestions.length) {
      setRenameMessage('No matching questions found for that tag.');
      return;
    }

    setSavingRename(true);
    try {
      const updates = sourceQuestions.map((question) => (batch: ReturnType<typeof writeBatch>) => {
        batch.update(doc(db, 'questions', question.id), {
          ...(subjectTo ? { subject: subjectTo } : null),
          ...(chapterTo ? { chapter: chapterTo } : null),
          updatedAt: serverTimestamp(),
        });
      });

      await commitBatchChunks(updates);
      await fetchQuestions();
      setShowRenameModal(false);
      setRenameMessage(null);
      if (subjectFrom && subjectTo && activeSubject === subjectFrom) {
        setActiveSubject(subjectTo);
      }
      if (chapterFrom && chapterTo && activeChapter === chapterFrom) {
        setActiveChapter(chapterTo);
      }
    } catch (error) {
      console.error(error);
      setRenameMessage('Rename failed. Please check permissions and retry.');
    } finally {
      setSavingRename(false);
    }
  };

  const handleShareQuestionBank = async () => {
    const userDoc = await getDoc(doc(db, 'users', auth.currentUser?.uid || ''));
    const userData = userDoc.data();
    const sourceCollegeId = collegeIdOverride || userData?.collegeId;

    if (!sourceCollegeId) return;
    if (mode === 'superadmin' && !shareTargetCollegeId) return;
    if (mode === 'principal' && !shareTargetClassId) return;
    if (mode === 'superadmin' && sourceCollegeId === shareTargetCollegeId) {
      alert('Choose another college to share with.');
      return;
    }
    if (!renameSubjectFrom && shareScopeType === 'subject' && !activeSubject && !aiSubject && !uniqueSubjects[0]) {
      alert('Pick a subject to share.');
      return;
    }

    const subject = shareScopeType === 'subject'
      ? (activeSubject !== 'all' ? activeSubject : renameSubjectFrom || uniqueSubjects[0] || '')
      : (activeSubject !== 'all' ? activeSubject : renameSubjectFrom || uniqueSubjects[0] || '');
    const chapter = shareScopeType === 'chapter'
      ? (activeChapter !== 'all' ? activeChapter : renameChapterFrom || uniqueChapters[0] || '')
      : '';

    if (!subject || (shareScopeType === 'chapter' && !chapter)) {
      alert('Select the subject or chapter you want to share.');
      return;
    }

    setSharingQuestionBank(true);
    try {
      await addDoc(collection(db, 'question_shares'), {
        sourceCollegeId,
        targetCollegeId: mode === 'principal' ? sourceCollegeId : shareTargetCollegeId,
        targetClassId: mode === 'principal' ? shareTargetClassId : '',
        scopeType: shareScopeType,
        subject,
        chapter: shareScopeType === 'chapter' ? chapter : '',
        note: shareNote.trim(),
        createdBy: auth.currentUser?.uid,
        createdAt: serverTimestamp(),
      });
      setShareNote('');
      setShareTargetClassId('');
      setShowSharePanel(false);
      await fetchShareGrants();
      alert('Question bank access shared successfully.');
    } catch (error) {
      console.error(error);
      alert('Failed to share question bank access.');
    } finally {
      setSharingQuestionBank(false);
    }
  };

  const handleRevokeShareGrant = async (grantId: string) => {
    try {
      await deleteDoc(doc(db, 'question_shares', grantId));
      await fetchShareGrants();
    } catch (error) {
      console.error(error);
      alert('Failed to revoke question bank access.');
    }
  };

  // Manual Form State
  const initialForm = {
    text: "",
    subject: "",
    chapter: "",
    options: { A: "", B: "", C: "", D: "" },
    optionImages: { A: "", B: "", C: "", D: "" },
    marathiText: "",
    marathiOptions: { A: "", B: "", C: "", D: "" },
    answer: "A",
    difficulty: "medium",
    explanation: "",
    imageUrl: "",
    explanationImageUrl: "",
    points: 1,
    negativeMarks: 0,
    needsImage: false,
    imageDescription: "",
  };
  const [form, setForm] = useState(initialForm);
  const [savingManual, setSavingManual] = useState(false);

  useEffect(() => {
    fetchQuestions();
  }, [teacherClassId]);

  useEffect(() => {
    const refreshOnFocus = () => {
      if (mode === 'teacher' && document.visibilityState !== 'hidden') {
        fetchQuestions();
      }
    };

    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnFocus);
    return () => {
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnFocus);
    };
  }, [mode, teacherClassId, classIdOverride]);

  useEffect(() => {
    if (mode !== 'teacher') return;

    let closed = false;
    let unsubscribers: Array<() => void> = [];

    const attachShareListeners = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser?.uid || ''));
        const userData = userDoc.data();
        const collegeId = collegeIdOverride || userData?.collegeId;
        const activeClassId = classIdOverride || teacherClassId || userData?.classId || null;

        if (!collegeId || closed) return;

        const shareQueries = [query(collection(db, 'question_shares'), where('targetCollegeId', '==', collegeId))];
        if (activeClassId) {
          shareQueries.push(query(collection(db, 'question_shares'), where('targetClassId', '==', activeClassId)));
        }

        unsubscribers = shareQueries.map((shareQuery) =>
          onSnapshot(shareQuery, () => {
            if (!closed) {
              fetchQuestions();
            }
          })
        );
      } catch (error) {
        console.error(error);
      }
    };

    attachShareListeners();

    return () => {
      closed = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [mode, collegeIdOverride, classIdOverride, teacherClassId]);

  useEffect(() => {
    setAvailableClasses(classOptions);
  }, [classOptions]);

  useEffect(() => {
    if (mode !== 'superadmin') return;
    const loadColleges = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'colleges')));
        setAvailableColleges(snap.docs.map((collegeDoc) => ({ id: collegeDoc.id, ...collegeDoc.data() })));
      } catch (error) {
        console.error(error);
      }
    };
    loadColleges();
  }, [mode]);

  useEffect(() => {
    if (mode !== 'principal') return;
    const loadPrincipalClasses = async () => {
      if (classOptions.length) return;
      try {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser?.uid || ''));
        const userData = userDoc.data();
        const collegeId = collegeIdOverride || userData?.collegeId;
        if (!collegeId) return;
        const classesSnap = await getDocs(query(collection(db, 'classes'), where('collegeId', '==', collegeId)));
        setAvailableClasses(classesSnap.docs.map((classDoc) => ({ id: classDoc.id, ...classDoc.data() })));
      } catch (error) {
        console.error(error);
      }
    };
    loadPrincipalClasses();
  }, [classOptions, collegeIdOverride, mode]);

  useEffect(() => {
    if (showSharePanel && mode === 'principal') {
      fetchShareGrants();
    }
  }, [mode, showSharePanel]);

  useEffect(() => {
    if (mode !== 'teacher') return;
    const loadAssignedClass = async () => {
      try {
        if (classIdOverride) {
          setTeacherClassId(classIdOverride);
          return;
        }
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser?.uid || ''));
        const userData = userDoc.data();
        const assignedClass = await resolveTeacherAssignedClass(db, {
          collegeId: collegeIdOverride || userData?.collegeId,
          user: auth.currentUser,
          profile: userData || null,
        });
        setTeacherClassId(assignedClass?.id || null);
      } catch (error) {
        console.error(error);
      }
    };
    loadAssignedClass();
  }, [classIdOverride, collegeIdOverride, mode]);

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser?.uid || ''));
      const userData = userDoc.data();
      const collegeId = collegeIdOverride || userData?.collegeId;

      if (!collegeId) return;
      const activeTeacherClassId = mode === 'teacher'
        ? (classIdOverride || teacherClassId || (await resolveTeacherAssignedClass(db, {
            collegeId,
            user: auth.currentUser,
            profile: userData || null,
          }))?.id) || null
        : null;

      if (mode === 'teacher') {
        setTeacherClassId(activeTeacherClassId);
        setClassScopeNotice(activeTeacherClassId ? null : 'No class is assigned to this teacher yet. The class-scoped sections will stay blank until the principal assigns a class.');
      }

      const fetchedQuestions = await fetchAccessibleQuestions(db, collegeId, {
        classId: activeTeacherClassId,
        mode,
      });
      fetchedQuestions.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setQuestions(fetchedQuestions);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchShareGrants = async () => {
    if (mode !== 'principal') return;
    setLoadingShareGrants(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser?.uid || ''));
      const userData = userDoc.data();
      const collegeId = collegeIdOverride || userData?.collegeId;
      if (!collegeId) return;
      const shareSnap = await getDocs(query(collection(db, 'question_shares'), where('sourceCollegeId', '==', collegeId)));
      setShareGrants(
        shareSnap.docs
          .map((shareDoc) => ({ id: shareDoc.id, ...shareDoc.data() }))
          .filter((share: any) => !!share.targetClassId)
      );
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingShareGrants(false);
    }
  };

  const handleManualSave = async () => {
    if (!form.text || !form.subject || !form.chapter) return;
    setSavingManual(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser?.uid || ''));
      const userData = userDoc.data();
      const collegeId = userData?.collegeId;
      const assignedClassId = mode === 'teacher'
        ? teacherClassId || userData?.classId || null
        : null;

      const data: any = {
        ...form,
        collegeId,
        classId: assignedClassId,
        updatedAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid
      };
      
      if (editingQuestion) {
        await setDoc(doc(db, 'questions', editingQuestion.id), data, { merge: true });
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, 'questions'), data);
      }
      
      setShowManualModal(false);
      setEditingQuestion(null);
      setForm(initialForm);
      fetchQuestions();
    } catch (e) {
      console.error(e);
      alert("Failed to save question.");
    } finally {
      setSavingManual(false);
    }
  };

  const deleteByChapter = async () => {
    if (activeChapter === 'all') {
      alert("Please select a specific chapter first.");
      return;
    }
    if (!confirm(`Are you sure you want to delete ALL questions in "${activeChapter}"? This action is irreversible.`)) return;
    
    setLoading(true);
    try {
      const qIds = filteredQuestions.map(q => q.id);
      if (qIds.length === 0) {
        alert("No questions found in this chapter.");
        setLoading(false);
        return;
      }
      for (const id of qIds) {
        await deleteDoc(doc(db, 'questions', id));
      }
      await fetchQuestions();
      alert(`Successfully deleted ${qIds.length} questions from "${activeChapter}".`);
    } catch (e: any) {
      console.error(e);
      alert("Failed to bulk delete: " + (e.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const handleExcelImport = async (file: File, subjectName: string, chapterName: string, contextText = "") => {
    if (!file) return;

    setLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

      // Assuming first row is header, skip it
      const questionsToUpload = [];
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser?.uid || ''));
      const userData = userDoc.data();
      const collegeId = userData?.collegeId;
      const assignedClassId = mode === 'teacher'
        ? teacherClassId || userData?.classId || null
        : null;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row[0]) continue; // Skip empty rows

        const q = {
          text: String(row[0] || ""),
          imageUrl: String(row[1] || ""),
          options: {
            A: String(row[2] || ""),
            B: String(row[4] || ""),
            C: String(row[6] || ""),
            D: String(row[8] || "")
          },
          optionImages: {
            A: String(row[3] || ""),
            B: String(row[5] || ""),
            C: String(row[7] || ""),
            D: String(row[9] || "")
          },
          answer: String(row[10] || "A").toUpperCase(),
          difficulty: String(row[11] || "medium").toLowerCase(),
          points: Number(row[12] || 1),
          negativeMarks: Number(row[13] || 0),
          explanation: String(row[14] || ""),
          marathiText: String(row[15] || ""),
          marathiOptions: {
            A: String(row[16] || ""),
            B: String(row[17] || ""),
            C: String(row[18] || ""),
            D: String(row[19] || "")
          },
          explanationImageUrl: String(row[20] || ""),
          subject: subjectName || (activeSubject === 'all' ? 'Uncategorized' : activeSubject),
          chapter: chapterName || (activeChapter === 'all' ? 'Bulk Upload' : activeChapter),
          contextualData: contextText,
          collegeId,
          classId: assignedClassId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: auth.currentUser?.uid
        };
        questionsToUpload.push(q);
      }

      for (const q of questionsToUpload) {
        await addDoc(collection(db, 'questions'), q);
      }

      alert(`Successfully imported ${questionsToUpload.length} questions.`);
      fetchQuestions();
      setShowBulkImportModal(false);
      setBulkFile(null);
      setBulkSubject('');
      setBulkChapter('');
      setBulkContext('');
    } catch (error) {
      console.error("Excel Import Error:", error);
      alert("Failed to import Excel. Ensure it follows the A-U column format.");
    } finally {
      setLoading(false);
    }
  };

  const deleteQuestion = async (id: string) => {
    if (!confirm("Are you sure?")) return;
    try {
      await deleteDoc(doc(db, 'questions', id));
      await fetchQuestions();
      alert("Question deleted successfully.");
    } catch (e: any) {
      console.error(e);
      alert("Deletion failed: " + (e.message || "Permission denied or network error"));
    }
  };

  const handleEditQuestion = (q: any) => {
    setEditingQuestion(q);
    setForm({
      text: q.text,
      subject: q.subject,
      chapter: q.chapter,
      options: q.options,
      optionImages: q.optionImages || { A: "", B: "", C: "", D: "" },
      marathiText: q.marathiText || "",
      marathiOptions: q.marathiOptions || { A: "", B: "", C: "", D: "" },
      answer: q.answer,
      difficulty: q.difficulty,
      explanation: q.explanation || "",
      imageUrl: q.imageUrl || "",
      explanationImageUrl: q.explanationImageUrl || "",
      points: q.points || 1,
      negativeMarks: q.negativeMarks || 0,
      needsImage: q.needsImage || false,
      imageDescription: q.imageDescription || "",
    });
    setShowManualModal(true);
  };

  return (
    <>
      <div className="space-y-6" onPaste={showManualModal ? handlePasteInModal : undefined}>
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleImageInput} 
        accept="image/*" 
        className="hidden" 
      />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40">
        <div>
          <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter italic">Question Architecture</h3>
          <p className="text-sm text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-1">Hierarchical Subject-Chapter Repository</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setBulkSubject(activeSubject !== 'all' ? activeSubject : uniqueSubjects[0] || '');
              setBulkChapter(activeChapter !== 'all' ? activeChapter : uniqueChapters[0] || '');
              setBulkContext('');
              setBulkFile(null);
              setShowBulkImportModal(true);
            }}
            className="flex items-center gap-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-black px-6 py-4 rounded-2xl border border-emerald-200 transition-all shadow-sm group"
          >
            <FileUp size={20} className="group-hover:translate-y-[-2px] transition-transform" />
            <span className="text-xs uppercase tracking-widest leading-none">Bulk Import (A-U)</span>
          </button>
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
          <button
            type="button"
            onClick={openRenameModal}
            className="flex items-center gap-2 bg-white text-slate-600 hover:text-indigo-600 hover:border-indigo-200 font-black px-6 py-4 rounded-2xl border border-slate-100 transition-all shadow-sm"
          >
            <Edit3 size={20} />
            <span className="text-xs uppercase tracking-widest leading-none">Rename Tags</span>
          </button>
          {(mode === 'superadmin' || mode === 'principal') && (
            <button
              type="button"
              onClick={() => {
                setRenameSubjectFrom(activeSubject !== 'all' ? activeSubject : uniqueSubjects[0] || '');
                setRenameChapterFrom(activeChapter !== 'all' ? activeChapter : uniqueChapters[0] || '');
                setShareTargetCollegeId('');
                setShareTargetClassId('');
                setShareNote('');
                setShowSharePanel(true);
              }}
              className="flex items-center gap-2 bg-purple-50 text-purple-700 hover:bg-purple-100 font-black px-6 py-4 rounded-2xl border border-purple-100 transition-all shadow-sm"
            >
              <ShieldCheck size={20} />
              <span className="text-xs uppercase tracking-widest leading-none">{mode === 'principal' ? 'Share To Class' : 'Share Bank'}</span>
            </button>
          )}
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

      {classScopeNotice && mode === 'teacher' && (
        <div className="px-6 py-4 rounded-[2rem] border border-amber-100 bg-amber-50 text-amber-700 font-black uppercase tracking-widest text-[10px] flex items-center gap-3">
          <Info size={16} />
          {classScopeNotice}
        </div>
      )}

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
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
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
            {activeChapter !== 'all' && (
              <button 
                onClick={deleteByChapter}
                className="ml-auto flex items-center gap-2 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white px-4 py-2 rounded-lg font-black text-[9px] uppercase tracking-widest transition-all border border-rose-100"
              >
                <Trash2 size={12} /> Delete Chapter
              </button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 grayscale opacity-40">
          <Loader2 className="animate-spin text-blue-600 mb-6" size={48} />
          <p className="font-black text-slate-500 uppercase tracking-[0.3em] text-[10px]">Syncing Knowledge Base</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 pb-24">
          {filteredQuestions.map((q) => (
            <motion.div 
              key={q.id} 
              layout
              className="bg-white p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] border border-slate-100 hover:border-blue-400 transition-all shadow-lg shadow-slate-200/30 group flex flex-col"
            >
              <div className="flex justify-between items-start gap-3 mb-4">
                <div className="flex flex-wrap gap-2">
                  <div className="px-2 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-md text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                    <BookOpen size={10} /> {q.subject}
                  </div>
                  <div className="px-2 py-0.5 bg-slate-50 text-slate-500 border border-slate-100 rounded-md text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                    <LayoutDashboard size={10} /> {q.chapter}
                  </div>
                  {q.sharedFromCollegeId && (
                    <div className="px-2 py-0.5 bg-purple-50 text-purple-600 border border-purple-100 rounded-md text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                      <ShieldCheck size={10} /> Shared
                    </div>
                  )}
                  <div className={cn(
                    "px-2 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-widest",
                    q.difficulty === 'hard' ? 'bg-red-50 text-red-600 border-red-100' : 
                    q.difficulty === 'medium' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                  )}>
                    {q.difficulty}
                  </div>
                  {q.needsImage && !q.imageUrl && (
                    <div className="px-2 py-0.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-md text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 animate-pulse">
                      <AlertTriangle size={10} /> Image Needed
                    </div>
                  )}
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                  <button 
                    onClick={() => handleEditQuestion(q)}
                    className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                  >
                    <Edit3 size={18} />
                  </button>
                  <button 
                    onClick={() => deleteQuestion(q.id)}
                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              {q.imageUrl && (
                <div className="w-full h-28 sm:h-32 bg-slate-50 rounded-2xl mb-4 overflow-hidden border border-slate-100">
                   <img src={getDirectImageUrl(q.imageUrl)} alt="Diagram" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                </div>
              )}

              <MathRenderer content={q.text} className="font-bold text-slate-800 text-base mb-1 leading-relaxed" />
              {q.marathiText && (
                <div className="text-slate-500 font-medium text-sm mb-4 border-l-2 border-slate-200 pl-4 py-1 italic">
                  {q.marathiText}
                </div>
              )}

              {q.explanation && (
                <div className="mb-4 p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl text-[10px] font-bold text-indigo-700">
                  <span className="uppercase tracking-widest block mb-0.5 opacity-50 text-[8px]">Solution Logic:</span>
                  <MathRenderer content={q.explanation} />
                  {q.explanationImageUrl && (
                    <div className="mt-2 w-full h-24 bg-white rounded-lg border border-indigo-100 overflow-hidden">
                       <img src={getDirectImageUrl(q.explanationImageUrl)} alt="Explanation Link" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-auto">
                {Object.entries(q.options).map(([key, text]) => (
                  <div key={key} className={cn(
                    "p-3 rounded-xl border flex items-center gap-3 text-[11px] transition-all relative overflow-hidden group/option",
                    key === q.answer ? "bg-emerald-50 border-emerald-200 text-emerald-900 font-bold" : "bg-slate-50/50 border-slate-100 text-slate-500"
                  )}>
                    <div className={cn(
                      "w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border-2 font-black text-[10px]",
                      key === q.answer ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-slate-200 text-slate-400"
                    )}>{key}</div>
                    <div className="flex-1 min-w-0">
                      <MathRenderer content={text as string} className="truncate" />
                      {q.marathiOptions?.[key] && (
                        <p className="text-[9px] text-slate-400 mt-0.5 truncate">{q.marathiOptions[key]}</p>
                      )}
                      {(q.optionImages as any)?.[key] && (
                        <div className="mt-1 w-full h-12 bg-white rounded-lg border border-slate-100 overflow-hidden">
                           <img src={getDirectImageUrl((q.optionImages as any)[key])} alt={`Opt ${key}`} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                        </div>
                      )}
                    </div>
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
              onPaste={handlePasteInModal}
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
                  {/* Left Column: Basic Info & Content */}
                  <div className="space-y-6 text-left">
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
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Question Content (English)</label>
                      <textarea 
                        value={form.text}
                        onChange={e => setForm({...form, text: e.target.value})}
                        placeholder="State the question clearly..."
                        className="w-full p-4 h-32 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl transition-all font-medium resize-none shadow-inner"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Question Content (Marathi - Optional)</label>
                      <textarea 
                        value={form.marathiText}
                        onChange={e => setForm({...form, marathiText: e.target.value})}
                        placeholder="Marathi translation..."
                        className="w-full p-4 h-24 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl transition-all font-medium resize-none shadow-inner"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Diagram Content</label>
                        <div className="flex gap-2">
                           <button onClick={() => triggerImageUpload('main')} className="text-[9px] font-black text-indigo-600 uppercase flex items-center gap-1 hover:bg-indigo-50 px-2 py-1 rounded">
                             <Camera size={10} /> Upload
                           </button>
                        </div>
                      </div>
                      <input 
                        type="text" 
                        value={form.imageUrl}
                        onChange={e => setForm({...form, imageUrl: e.target.value})}
                        placeholder="Paste image URL..."
                        className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl transition-all font-bold text-xs"
                      />
                    </div>
                  </div>

                  {/* Right Column: Scoring & Logic */}
                  <div className="space-y-6 text-left">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Points</label>
                        <input 
                          type="number" 
                          value={form.points}
                          onChange={e => setForm({...form, points: Number(e.target.value)})}
                          className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Negative</label>
                        <input 
                          type="number" 
                          value={form.negativeMarks}
                          step="0.25"
                          onChange={e => setForm({...form, negativeMarks: Number(e.target.value)})}
                          className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl font-bold"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Difficulty & Answer</label>
                      <div className="grid grid-cols-2 gap-2">
                        <select 
                          value={form.difficulty}
                          onChange={e => setForm({...form, difficulty: e.target.value})}
                          className="w-full p-4 bg-slate-50 rounded-2xl font-black uppercase text-xs"
                        >
                          <option value="easy">Easy</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                        </select>
                        <select 
                          value={form.answer}
                          onChange={e => setForm({...form, answer: e.target.value as any})}
                          className="w-full p-4 bg-slate-50 rounded-2xl font-black uppercase text-xs"
                        >
                          {['A', 'B', 'C', 'D'].map(k => <option key={k} value={k}>Ans {k}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Explanation Logic</label>
                      <textarea 
                        value={form.explanation}
                        onChange={e => setForm({...form, explanation: e.target.value})}
                        placeholder="Why is the answer correct?"
                        className="w-full p-4 h-24 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl transition-all font-medium resize-none shadow-inner"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Explanation Illustration URL</label>
                      <input 
                        type="text" 
                        value={form.explanationImageUrl}
                        onChange={e => setForm({...form, explanationImageUrl: e.target.value})}
                        placeholder="Logic diagram URL..."
                        className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-indigo-600 rounded-2xl font-bold text-xs"
                      />
                    </div>
                    {editingQuestion && (
                      <button 
                        onClick={() => deleteQuestion(editingQuestion.id)}
                        className="w-full p-4 bg-rose-50 text-rose-600 border border-rose-100 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-rose-600 hover:text-white transition-all flex items-center justify-center gap-2"
                      >
                        <Trash2 size={14} /> Purge Question
                      </button>
                    )}
                  </div>

                  {/* Full Width Row: Options */}
                  <div className="lg:col-span-2 space-y-6 text-left">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 uppercase">Bilingual Response Matrix</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {['A', 'B', 'C', 'D'].map(key => (
                         <div key={key} className="flex items-start gap-4 p-4 border border-slate-100 rounded-[2rem] bg-slate-50/30">
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center font-black transition-all cursor-pointer border-2 shrink-0 mt-1",
                              form.answer === key ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200 text-slate-400"
                            )} onClick={() => setForm({...form, answer: key as any})}>
                              {key}
                            </div>
                            <div className="flex-1 space-y-3">
                               <input 
                                 type="text" 
                                 value={(form.options as any)[key]}
                                 onChange={e => setForm({...form, options: {...form.options, [key]: e.target.value}})}
                                 className="w-full p-3 bg-white border-2 border-transparent focus:border-indigo-600 rounded-xl transition-all font-bold text-sm"
                                 placeholder={`Eng Option ${key}`}
                               />
                               <input 
                                 type="text" 
                                 value={(form.marathiOptions as any)[key]}
                                 onChange={e => setForm({...form, marathiOptions: {...form.marathiOptions, [key]: e.target.value}})}
                                 className="w-full p-3 bg-white border-2 border-transparent focus:border-indigo-600 rounded-xl transition-all font-medium text-xs italic"
                                 placeholder={`Marathi Option ${key}`}
                               />
                               <div className="flex gap-2 items-center px-1">
                                 <input 
                                   type="text" 
                                   value={(form.optionImages as any)[key]}
                                   onChange={e => setForm({...form, optionImages: {...form.optionImages, [key]: e.target.value}})}
                                   className="flex-1 py-1 bg-transparent border-b border-slate-200 text-[9px] font-bold text-slate-400 focus:border-indigo-400 outline-none"
                                   placeholder={`Opt ${key} Image URL`}
                                 />
                                 <button onClick={() => triggerImageUpload(key as any)} className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-all shrink-0">
                                   <Camera size={12} />
                                 </button>
                               </div>
                            </div>
                         </div>
                      ))}
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
        {showRenameModal && (
          <div className="fixed inset-0 z-[52] flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 18 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 18 }}
              className="w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-6 sm:p-8 border-b border-slate-100">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bulk Tag Tools</p>
                    <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter italic">Rename subject / chapter tags</h3>
                  </div>
                  <button onClick={() => setShowRenameModal(false)} className="p-2 text-slate-400 hover:text-slate-900">
                    <X size={20} />
                  </button>
                </div>
                <p className="mt-2 text-sm text-slate-500 font-medium">
                  This updates every matching question in the selected college so reports, tests, and filters stay consistent.
                </p>
              </div>

              <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-3">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Subject From</label>
                  <select
                    value={renameSubjectFrom}
                    onChange={(e) => setRenameSubjectFrom(e.target.value)}
                    className="w-full px-4 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-bold text-slate-700 outline-none"
                  >
                    <option value="">Select subject</option>
                    {uniqueSubjects.map((subject) => (
                      <option key={subject} value={subject}>{subject}</option>
                    ))}
                  </select>
                  <input
                    value={renameSubjectTo}
                    onChange={(e) => setRenameSubjectTo(e.target.value)}
                    placeholder="New subject name"
                    className="w-full px-4 py-4 rounded-2xl border border-slate-200 bg-white font-bold text-slate-700 outline-none"
                  />
                </div>

                <div className="space-y-3">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Chapter From</label>
                  <select
                    value={renameChapterFrom}
                    onChange={(e) => setRenameChapterFrom(e.target.value)}
                    className="w-full px-4 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-bold text-slate-700 outline-none"
                  >
                    <option value="">Select chapter</option>
                    {uniqueChapters.map((chapter) => (
                      <option key={chapter} value={chapter}>{chapter}</option>
                    ))}
                  </select>
                  <input
                    value={renameChapterTo}
                    onChange={(e) => setRenameChapterTo(e.target.value)}
                    placeholder="New chapter name"
                    className="w-full px-4 py-4 rounded-2xl border border-slate-200 bg-white font-bold text-slate-700 outline-none"
                  />
                </div>
              </div>

              {renameMessage && (
                <div className="px-6 sm:px-8 pb-4 text-[10px] font-black uppercase tracking-widest text-rose-600">
                  {renameMessage}
                </div>
              )}

              <div className="p-6 sm:p-8 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => setShowRenameModal(false)}
                  className="px-6 py-4 rounded-2xl border border-slate-200 bg-white text-slate-500 font-black uppercase tracking-widest text-[10px]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRenameTags}
                  disabled={savingRename}
                  className="px-6 py-4 rounded-2xl bg-indigo-600 text-white font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 disabled:opacity-50"
                >
                  {savingRename ? <Loader2 size={14} className="animate-spin" /> : <Edit3 size={14} />}
                  Apply Rename
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {showSharePanel && (mode === 'superadmin' || mode === 'principal') && (
          <div className="fixed inset-0 z-[53] flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 18 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 18 }}
              className="w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-6 sm:p-8 border-b border-slate-100">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {mode === 'principal' ? 'Principal Share' : 'Super Admin Share'}
                    </p>
                    <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter italic">
                      {mode === 'principal' ? 'Assign question access to a class teacher' : 'Assign question access to another college'}
                    </h3>
                  </div>
                  <button onClick={() => setShowSharePanel(false)} className="p-2 text-slate-400 hover:text-slate-900">
                    <X size={20} />
                  </button>
                </div>
                <p className="mt-2 text-sm text-slate-500 font-medium">
                  {mode === 'principal'
                    ? 'Share either a whole subject or a chapter with one class. Reassigning that class to a new teacher preserves the same access automatically.'
                    : 'Share either a whole subject or a chapter so another principal can use the same question bank.'}
                </p>
              </div>

              <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-5">
                {mode === 'superadmin' ? (
                  <div className="space-y-3 md:col-span-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Target College</label>
                    <select
                      value={shareTargetCollegeId}
                      onChange={(e) => setShareTargetCollegeId(e.target.value)}
                      className="w-full px-4 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-bold text-slate-700 outline-none"
                    >
                      <option value="">Choose destination college</option>
                      {availableColleges
                        .filter((college) => college.id !== (collegeIdOverride || ''))
                        .map((college) => (
                          <option key={college.id} value={college.id}>
                            {college.name}
                          </option>
                        ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-3 md:col-span-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Target Class</label>
                    <select
                      value={shareTargetClassId}
                      onChange={(e) => setShareTargetClassId(e.target.value)}
                      className="w-full px-4 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-bold text-slate-700 outline-none"
                    >
                      <option value="">Choose class</option>
                      {availableClasses.map((classRoom) => (
                        <option key={classRoom.id} value={classRoom.id}>
                          {classRoom.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-3">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Share Scope</label>
                  <select
                    value={shareScopeType}
                    onChange={(e) => setShareScopeType(e.target.value as 'subject' | 'chapter')}
                    className="w-full px-4 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-bold text-slate-700 outline-none"
                  >
                    <option value="subject">Subject Wise</option>
                    <option value="chapter">Chapter Wise</option>
                  </select>
                </div>

                <div className="space-y-3">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Subject</label>
                  <select
                    value={renameSubjectFrom}
                    onChange={(e) => setRenameSubjectFrom(e.target.value)}
                    className="w-full px-4 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-bold text-slate-700 outline-none"
                  >
                    <option value="">Choose subject</option>
                    {uniqueSubjects.map((subject) => (
                      <option key={subject} value={subject}>{subject}</option>
                    ))}
                  </select>
                </div>

                {shareScopeType === 'chapter' && (
                  <div className="space-y-3 md:col-span-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Chapter</label>
                    <select
                      value={renameChapterFrom}
                      onChange={(e) => setRenameChapterFrom(e.target.value)}
                      className="w-full px-4 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-bold text-slate-700 outline-none"
                    >
                      <option value="">Choose chapter</option>
                      {uniqueChapters.map((chapter) => (
                        <option key={chapter} value={chapter}>{chapter}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-3 md:col-span-2">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Note</label>
                  <input
                    value={shareNote}
                    onChange={(e) => setShareNote(e.target.value)}
                    placeholder={mode === 'principal' ? 'Optional note for the teacher' : 'Optional note for the principal'}
                    className="w-full px-4 py-4 rounded-2xl border border-slate-200 bg-white font-bold text-slate-700 outline-none"
                  />
                </div>

                {mode === 'principal' && (
                  <div className="space-y-3 md:col-span-2">
                    <div className="flex items-center justify-between gap-4">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Active Shares</label>
                      {loadingShareGrants && <Loader2 size={14} className="animate-spin text-slate-400" />}
                    </div>
                    <div className="space-y-3 max-h-52 overflow-y-auto pr-2">
                      {shareGrants.map((grant) => {
                        const classRoom = availableClasses.find((item) => item.id === grant.targetClassId);
                        return (
                          <div key={grant.id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">
                                {grant.subject}{grant.scopeType === 'chapter' && grant.chapter ? ` / ${grant.chapter}` : ''}
                              </p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                {classRoom?.name || 'Unknown Class'}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRevokeShareGrant(grant.id)}
                              className="px-3 py-2 rounded-xl border border-rose-100 bg-white text-[10px] font-black uppercase tracking-widest text-rose-600"
                            >
                              Revoke
                            </button>
                          </div>
                        );
                      })}
                      {!loadingShareGrants && shareGrants.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                          No class shares active
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 sm:p-8 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => setShowSharePanel(false)}
                  className="px-6 py-4 rounded-2xl border border-slate-200 bg-white text-slate-500 font-black uppercase tracking-widest text-[10px]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleShareQuestionBank}
                  disabled={sharingQuestionBank || (mode === 'superadmin' ? !shareTargetCollegeId : !shareTargetClassId)}
                  className="px-6 py-4 rounded-2xl bg-purple-600 text-white font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 shadow-lg shadow-purple-100 disabled:opacity-50"
                >
                  {sharingQuestionBank ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                  Share Access
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Hidden File Input for Image Uploads */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleImageInput} 
        accept="image/*" 
        className="hidden" 
      />

      {/* Bulk Import Modal */}
      <AnimatePresence>
        {showBulkImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/45 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-white">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white">
                    <FileUp size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-800 tracking-tight uppercase tracking-tighter italic">Bulk Import Setup</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tag subject, chapter and source before upload</p>
                  </div>
                </div>
                <button onClick={() => setShowBulkImportModal(false)} className="p-2 text-slate-300 hover:text-slate-900 transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Subject Area</label>
                    <div className="space-y-2">
                      <select
                        value={bulkSubject}
                        onChange={(e) => setBulkSubject(e.target.value)}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:border-emerald-600 outline-none transition-all font-bold text-slate-700 text-xs"
                      >
                        <option value="">Existing...</option>
                        {uniqueSubjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                      </select>
                      <input
                        type="text"
                        value={bulkSubject}
                        onChange={(e) => setBulkSubject(e.target.value)}
                        placeholder="Or type new..."
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-emerald-600 outline-none transition-all text-[10px] font-black uppercase text-slate-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Chapter / Topic</label>
                    <div className="space-y-2">
                      <select
                        value={bulkChapter}
                        onChange={(e) => setBulkChapter(e.target.value)}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:border-emerald-600 outline-none transition-all font-bold text-slate-700 text-xs"
                      >
                        <option value="">Existing...</option>
                        {uniqueChapters.map((chapter) => <option key={chapter} value={chapter}>{chapter}</option>)}
                      </select>
                      <input
                        type="text"
                        value={bulkChapter}
                        onChange={(e) => setBulkChapter(e.target.value)}
                        placeholder="Or type new..."
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-emerald-600 outline-none transition-all text-[10px] font-black uppercase text-slate-600"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-2">Contextual Data</label>
                  <textarea
                    value={bulkContext}
                    onChange={(e) => setBulkContext(e.target.value)}
                    placeholder="Enter concept or paste source text..."
                    className="w-full p-4 h-24 bg-slate-50 border border-slate-100 rounded-xl focus:border-emerald-600 outline-none transition-all font-medium resize-none text-xs"
                  />
                </div>

                <div className="bg-slate-50 p-6 rounded-2xl border-2 border-dashed border-slate-200">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <FileUp size={24} className="text-emerald-600" />
                      <div>
                        <p className="text-xs font-black uppercase text-slate-700">Source Document</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">PDF, DOCX, XLSX</p>
                      </div>
                    </div>
                    {bulkFile && (
                      <button
                        onClick={() => setBulkFile(null)}
                        className="p-2 hover:bg-red-50 text-red-500 rounded-lg"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>

                  {bulkFile ? (
                    <div className="bg-white p-3 rounded-xl border border-emerald-100 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-emerald-600 truncate max-w-[200px]">{bulkFile.name}</span>
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    </div>
                  ) : (
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        className="hidden"
                        accept=".xlsx,.xls"
                        onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                      />
                      <div className="py-4 text-center border-2 border-slate-200 border-dashed rounded-xl hover:bg-white hover:border-emerald-600 transition-all">
                        <span className="text-[10px] font-black uppercase text-slate-400">Click to Upload Materials</span>
                      </div>
                    </label>
                  )}
                </div>
              </div>

              <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowBulkImportModal(false)}
                  className="px-6 py-4 bg-white border border-slate-200 text-slate-400 font-bold rounded-2xl flex-1 hover:text-slate-600 transition-all uppercase text-[10px] tracking-widest"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => bulkFile && handleExcelImport(bulkFile, bulkSubject, bulkChapter, bulkContext)}
                  disabled={!bulkFile}
                  className="px-6 py-4 bg-emerald-600 text-white font-black rounded-2xl flex-1 flex items-center justify-center gap-3 hover:bg-slate-900 shadow-xl shadow-emerald-100 transition-all disabled:opacity-50 uppercase text-[10px] tracking-widest"
                >
                  <ShieldCheck size={18} />
                  Import Questions
                </motion.button>
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
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-white">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white">
                    <BrainCircuit size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-800 tracking-tight uppercase tracking-tighter italic">Cortex AI Generator</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Generate structured MCQ sets</p>
                  </div>
                </div>
                <button onClick={() => setShowAiModal(false)} className="p-2 text-slate-300 hover:text-slate-900 transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Subject Area</label>
                    <div className="space-y-2">
                      <select 
                        value={aiSubject}
                        onChange={(e) => setAiSubject(e.target.value)}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 outline-none transition-all font-bold text-slate-700 text-xs"
                      >
                        <option value="">Existing...</option>
                        {uniqueSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <input 
                        type="text" 
                        value={aiSubject}
                        onChange={(e) => setAiSubject(e.target.value)}
                        placeholder="Or type new..."
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 outline-none transition-all text-[10px] font-black uppercase text-slate-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Chapter / Topic</label>
                    <div className="space-y-2">
                      <select 
                        value={aiChapter}
                        onChange={(e) => setAiChapter(e.target.value)}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 outline-none transition-all font-bold text-slate-700 text-xs"
                      >
                        <option value="">Existing...</option>
                        {uniqueChapters.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <input 
                        type="text" 
                        value={aiChapter}
                        onChange={(e) => setAiChapter(e.target.value)}
                        placeholder="Or type new..."
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 outline-none transition-all text-[10px] font-black uppercase text-slate-600"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-2">Contextual Data</label>
                  <textarea 
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                    placeholder="Enter concept or paste source text..."
                    className="w-full p-4 h-24 bg-slate-50 border border-slate-100 rounded-xl focus:border-indigo-600 outline-none transition-all font-medium resize-none text-xs"
                  />
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
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowAiModal(false)}
                  className="px-6 py-4 bg-white border border-slate-200 text-slate-400 font-bold rounded-2xl flex-1 hover:text-slate-600 transition-all uppercase text-[10px] tracking-widest"
                >
                  Cancel
                </motion.button>
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={generateWithAi}
                  disabled={isGenerating || (!aiTopic && !fileContent) || !aiSubject || !aiChapter}
                  className="px-6 py-4 bg-indigo-600 text-white font-black rounded-2xl flex-1 flex items-center justify-center gap-3 hover:bg-slate-900 shadow-xl shadow-indigo-100 transition-all disabled:opacity-50 uppercase text-[10px] tracking-widest"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Synthesizing...
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={18} />
                      Run Cortex
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
    </>
  );
}
