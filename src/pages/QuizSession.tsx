import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, auth } from '../lib/firebase';
import { doc, getDoc, addDoc, collection, serverTimestamp, setDoc, deleteDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShieldAlert, 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  Send, 
  Loader2,
  AlertTriangle,
  LayoutList,
  Bookmark,
  RotateCcw,
  Info
} from 'lucide-react';
import { cn } from '../lib/utils';
import MathRenderer from '../components/MathRenderer';

export default function QuizSession() {
  const { testId } = useParams();
  const navigate = useNavigate();
  
  const [test, setTest] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(0);
  const [violations, setViolations] = useState({ fsExits: 0, tabSwitches: 0 });
  const [showWarning, setShowWarning] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [needsName, setNeedsName] = useState(false);
  const [reviewIds, setReviewIds] = useState<string[]>([]);
  const [savingProgress, setSavingProgress] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const [studentRollNo, setStudentRollNo] = useState("N/A");

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading || isSubmitted || (test && test.isPractice)) return;
    
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleFinalSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [loading, isSubmitted, test]);

  useEffect(() => {
    fetchTestData();
    fetchUserIdentity();
    
    // Anti-cheat: Tab Switching Detection
    const handleVisibilityChange = () => {
      if (document.hidden && !isSubmitted && test && !test.isPractice) {
        setViolations(prev => ({ ...prev, tabSwitches: prev.tabSwitches + 1 }));
        setShowWarning(true);
      }
    };

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const fetchUserIdentity = async () => {
    if (!auth.currentUser) return;
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        // FORCE officialName if exists, else displayName
        setStudentName(data.officialName || data.displayName || auth.currentUser.displayName || "");
        setStudentRollNo(data.rollNo || "N/A");
      }
    } catch (e) {
      console.error("Identity fetch error:", e);
    }
  };

  const enterFullscreen = () => {
    const element = document.documentElement;
    const request = element.requestFullscreen || (element as any).webkitRequestFullscreen || (element as any).mozRequestFullScreen || (element as any).msRequestFullscreen;
    
    if (request) {
      request.call(element).catch((err: any) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
        setIsFullscreen(true); // Forced bypass if error occurs but user intent was there
      });
    } else {
      // Direct bypass for mobile browsers that don't support FS API (e.g. iOS Safari)
      setIsFullscreen(true);
    }
  };

  const fetchTestData = async () => {
    if (!testId) return;
    try {
      const testSnap = await getDoc(doc(db, 'tests', testId));
      if (!testSnap.exists()) {
        navigate('/student');
        return;
      }
      const testData = testSnap.data();
      setTest({ id: testSnap.id, ...testData });
      setTimeLeft(testData.duration * 60);

      // Check for saved progress if it's a practice test
      if (testData.isPractice && auth.currentUser) {
        const progressSnap = await getDoc(doc(db, 'practice_progress', `${auth.currentUser.uid}_${testId}`));
        if (progressSnap.exists()) {
          const prog = progressSnap.data();
          setAnswers(prog.answers || {});
          setReviewIds(prog.reviewIds || []);
          setCurrentIdx(prog.currentIdx || 0);
        }
      }

      if (testData.settings?.authRequired === false && !auth.currentUser) {
        setNeedsName(true);
      }

      if (testData.settings?.forceFullscreen && !testData.isPractice && !document.fullscreenElement) {
        // Fullscreen check logic is handled in the render phase
      }

      // Fetch questions
      const qPromises = testData.questionIds.map((id: string) => getDoc(doc(db, 'questions', id)));
      const qSnaps = await Promise.all(qPromises);
      let qs = qSnaps.map(s => {
        const data = s.data();
        if (!data) return null;
        const q = { id: s.id, ...data };
        
        // Shuffle options content but keep A/B/C/D labels fixed
        if (testData.settings?.shuffleOptions) {
          const originalOptions = Object.entries(q.options || {});
          const originalAnswerText = (q.options as any)[q.answer];
          
          const shuffledEntries = [...originalOptions].sort(() => Math.random() - 0.5);
          const newOptions: any = {};
          let newAnswer = q.answer;

          ['A', 'B', 'C', 'D'].forEach((label, idx) => {
            if (shuffledEntries[idx]) {
               const [oldLabel, text] = shuffledEntries[idx];
               newOptions[label] = text;
               if (text === originalAnswerText) {
                 newAnswer = label;
               }
            }
          });
          q.options = newOptions;
          q.answer = newAnswer;
        }
        return q;
      }).filter(Boolean);

      if (testData.settings?.shuffleQuestions) {
        qs = (qs as any[]).sort(() => Math.random() - 0.5);
      }

      setQuestions(qs as any[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (qId: string, option: string) => {
    if (isSubmitted) return;
    setAnswers(prev => {
      const next = { ...prev, [qId]: option };
      if (test?.isPractice) saveProgress(next, reviewIds, currentIdx);
      return next;
    });
  };

  const handleClear = (qId: string) => {
    if (isSubmitted) return;
    setAnswers(prev => {
      const next = { ...prev };
      delete next[qId];
      if (test?.isPractice) saveProgress(next, reviewIds, currentIdx);
      return next;
    });
  };

  const handleReview = (qId: string) => {
    if (isSubmitted) return;
    setReviewIds(prev => {
      const next = prev.includes(qId) ? prev.filter(id => id !== qId) : [...prev, qId];
      if (test?.isPractice) saveProgress(answers, next, currentIdx);
      return next;
    });
  };

  const saveProgress = async (currentAnswers: any, currentReviews: string[], idx: number) => {
    if (!auth.currentUser || !testId || !test?.isPractice) return;
    setSavingProgress(true);
    try {
      await setDoc(doc(db, 'practice_progress', `${auth.currentUser.uid}_${testId}`), {
        studentId: auth.currentUser.uid,
        testId,
        answers: currentAnswers,
        reviewIds: currentReviews,
        currentIdx: idx,
        lastUpdated: serverTimestamp()
      });
    } catch (e) {
      console.error("Progress save failed:", e);
    } finally {
      setSavingProgress(false);
    }
  };

  const handleFinalSubmit = async () => {
    if (isSubmitted || (needsName && !studentName)) return;
    setIsSubmitted(true);
    
    let rightAnswers = 0;
    let attempted = 0;
    
    questions.forEach(q => {
      const studentAnswer = answers[q.id];
      if (studentAnswer) {
        attempted++;
        if (studentAnswer === q.answer) rightAnswers++;
      }
    });

    const wrongAnswers = attempted - rightAnswers;
    const totalQuestions = questions.length;
    const percentage = (rightAnswers / totalQuestions) * 100;
    const passingMarks = test?.passingMarks || 40;

    try {
      await addDoc(collection(db, 'submissions'), {
        studentId: auth.currentUser?.uid || 'anonymous',
        studentName: studentName || 'Unknown',
        studentRollNo: studentRollNo,
        testId: test?.id,
        collegeId: test?.collegeId || null,
        answers, 
        score: rightAnswers,
        total: totalQuestions,
        rightAnswers,
        wrongAnswers,
        attempted,
        percentage: Number(percentage.toFixed(2)),
        status: percentage >= passingMarks ? 'PASS' : 'FAIL',
        released: false, 
        violations,
        isPractice: !!test?.isPractice,
        submittedAt: serverTimestamp()
      });
      
      // Cleanup progress on full submit
      if (test?.isPractice && auth.currentUser) {
        await deleteDoc(doc(db, 'practice_progress', `${auth.currentUser.uid}_${testId}`));
      }
      
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(e => console.error(e));
      }
      navigate('/student');
    } catch (e) {
      console.error(e);
      alert("Submission failed. Check your connection.");
      setIsSubmitted(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (loading) return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white gap-4">
      <Loader2 className="animate-spin text-blue-500" size={48} />
      <p className="font-bold uppercase tracking-widest text-slate-400">Securing Session...</p>
    </div>
  );

  if (needsName && !studentName) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-950 p-6">
         <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-white p-12 rounded-[3.5rem] w-full max-w-lg shadow-2xl">
            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-4 italic">Verification Required</h2>
            <p className="text-slate-500 font-bold mb-8">Enter your official name to proceed with the assessment.</p>
            <input 
              type="text" 
              placeholder="Your Full Name" 
              className="w-full p-6 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-slate-900 outline-none font-black mb-8"
              onKeyUp={(e) => e.key === 'Enter' && setStudentName((e.target as HTMLInputElement).value)}
            />
            <button 
              onClick={(e) => {
                const input = (e.currentTarget.previousSibling as HTMLInputElement).value;
                if (input) setStudentName(input);
              }}
              className="w-full py-6 bg-slate-900 text-white font-black rounded-3xl hover:bg-indigo-600 transition-all uppercase tracking-widest text-xs"
            >
              AUTHENTICATE SESSION
            </button>
         </motion.div>
      </div>
    );
  }

  if (test?.settings?.forceFullscreen && !test?.isPractice && !isFullscreen) {
    return (
      <div className="h-screen flex items-center justify-center bg-red-950 p-6">
         <div className="text-center max-w-md">
            <ShieldAlert size={80} className="mx-auto text-white mb-6 animate-pulse" />
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">Fullscreen Required</h2>
            <p className="text-red-200 font-bold mb-10 leading-relaxed">This examination requires a secured fullscreen environment. Please enable it to begin.</p>
            <button 
              onClick={enterFullscreen}
              className="w-full py-6 bg-white text-red-900 font-black rounded-3xl transition-all shadow-2xl"
            >
              ENABLE SECURE MODE
            </button>
         </div>
      </div>
    );
  }

  const currentQ = questions[currentIdx];

  const getStatus = (idx: number) => {
    const qId = questions[idx].id;
    const isAnswered = !!answers[qId];
    const isReview = reviewIds.includes(qId);
    
    if (isAnswered && isReview) return 'answered-review';
    if (isReview) return 'review';
    if (isAnswered) return 'answered';
    if (currentIdx === idx) return 'current';
    return 'not-visited';
  };

  return (
    <div className="h-screen bg-[#F8FAFC] flex flex-col select-none overflow-hidden" ref={containerRef}>
      {/* Quiz Header */}
      <header className="h-14 sm:h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between z-50 shrink-0">
        <div className="flex items-center gap-2 sm:gap-4 truncate">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center font-black text-sm sm:text-base">M</div>
          <h2 className="font-extrabold text-slate-800 text-sm sm:text-lg truncate uppercase tracking-tight">{test?.title}</h2>
        </div>

        <div className="flex items-center gap-2 sm:gap-6">
          <div className={cn(
            "flex items-center gap-1.5 sm:gap-3 px-3 sm:px-6 py-1.5 sm:py-2.5 rounded-xl border font-black transition-all",
            timeLeft < 300 ? "bg-rose-50 border-rose-100 text-rose-600 animate-pulse" : "bg-slate-50 border-slate-100 text-slate-700"
          )}>
            <Clock size={16} className="sm:w-5 sm:h-5 text-indigo-600" />
            <span className="text-sm sm:text-xl tabular-nums tracking-tighter">{formatTime(timeLeft)}</span>
          </div>

          <div className="hidden sm:flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
             <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs uppercase">
               {studentName ? studentName.charAt(0) : (auth.currentUser?.displayName?.charAt(0) || 'S')}
             </div>
             <div className="text-left leading-tight">
               <p className="text-xs font-black uppercase text-slate-800 truncate max-w-[100px]">{studentName || auth.currentUser?.displayName || 'Student'}</p>
               <p className="text-[10px] font-bold text-slate-400">ROLL: {studentRollNo}</p>
             </div>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Side: Question Area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          <div className="flex items-center justify-between px-4 sm:px-8 py-3 sm:py-4 bg-slate-50/50 border-b border-slate-100 shrink-0">
             <span className="text-xs sm:text-sm font-black uppercase tracking-widest text-indigo-600">
               Question No. <span className="text-base sm:text-xl">{currentIdx + 1}</span>
             </span>
             <div className="flex gap-2">
                <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-[10px] font-black rounded uppercase">Single Correct</span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-600 text-[10px] font-black rounded uppercase">+{currentQ.points || 1}.00</span>
                <span className="px-2 py-0.5 bg-rose-100 text-rose-600 text-[10px] font-black rounded uppercase">-{currentQ.negativeMarks || 0}.00</span>
             </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 sm:space-y-8 custom-scrollbar">
            <div className="space-y-6">
              <div className="prose max-w-none">
                <MathRenderer content={currentQ.text} className="text-base sm:text-2xl font-bold text-slate-800 leading-relaxed" />
                {currentQ.marathiText && (
                  <p className="text-sm sm:text-lg text-slate-500 font-medium italic border-l-4 border-indigo-100 pl-4 py-2 mt-4">
                    {currentQ.marathiText}
                  </p>
                )}
              </div>

              {currentQ.imageUrl && (
                <div className="max-w-2xl mx-auto bg-slate-50 p-2 sm:p-4 rounded-2xl border border-slate-100 shadow-sm">
                   <img 
                     src={currentQ.imageUrl} 
                     alt="Question Content" 
                     className="w-full max-h-48 sm:max-h-80 object-contain rounded-xl"
                     referrerPolicy="no-referrer"
                   />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {Object.entries(currentQ.options).map(([key, text]) => {
                const isSelected = answers[currentQ.id] === key;
                const isCorrect = key === currentQ.answer;
                const showResult = test?.isPractice && isSelected;
                const optImage = (currentQ.optionImages as any)?.[key];

                return (
                  <button
                    key={key}
                    onClick={() => handleSelect(currentQ.id, key)}
                    className={cn(
                      "flex flex-col p-3 sm:p-5 rounded-xl border-2 transition-all text-left relative overflow-hidden group/opt",
                      isSelected 
                      ? (test?.isPractice ? (isCorrect ? 'bg-emerald-50 border-emerald-500' : 'bg-rose-50 border-rose-500') : 'bg-indigo-50 border-indigo-600 ring-2 ring-indigo-600/10') 
                      : "bg-white border-slate-100 hover:border-slate-300 hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-center gap-3 sm:gap-4">
                      <div className={cn(
                        "w-8 h-8 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center font-black text-sm sm:text-lg transition-all border-2 shrink-0",
                        isSelected 
                        ? (test?.isPractice ? (isCorrect ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-rose-500 border-rose-400 text-white') : 'bg-indigo-600 border-indigo-600 text-white') 
                        : "bg-slate-50 border-slate-200 text-slate-400"
                      )}>
                        {key}
                      </div>
                      <div className="flex-1 min-w-0">
                        <MathRenderer content={text as string} className="text-xs sm:text-sm font-bold text-slate-700 leading-tight" />
                        {currentQ.marathiOptions?.[key] && (
                          <p className="text-[10px] sm:text-xs text-slate-400 font-medium italic mt-1">{currentQ.marathiOptions[key]}</p>
                        )}
                      </div>
                    </div>

                    {optImage && (
                      <div className="mt-3 w-full bg-white p-2 rounded-lg border border-slate-100">
                        <img 
                          src={optImage} 
                          alt={`Option ${key}`} 
                          className="w-full max-h-24 sm:max-h-32 object-contain rounded"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}

                    {showResult && (
                      <div className={cn("text-[8px] font-black uppercase tracking-widest mt-2", isCorrect ? "text-emerald-600" : "text-rose-600")}>
                        {isCorrect ? "● Verified Match" : "● Correction Required"}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {test?.isPractice && answers[currentQ.id] && (
              <div className="mt-8 p-6 bg-slate-50 rounded-[2rem] border border-slate-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center">
                    <Info size={16} />
                  </div>
                  <h4 className="font-black text-slate-900 uppercase tracking-widest text-xs">Solution Insight & Logic</h4>
                </div>
                <div className="prose max-w-none text-slate-600 text-sm font-medium leading-relaxed">
                   <MathRenderer content={currentQ.explanation || "No written explanation provided for this asset."} />
                </div>
                {currentQ.explanationImageUrl && (
                  <div className="mt-6 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm max-w-xl mx-auto overflow-hidden">
                     <img 
                       src={currentQ.explanationImageUrl} 
                       alt="Explanation Diagram" 
                       className="w-full max-h-64 object-contain rounded-xl"
                       referrerPolicy="no-referrer"
                     />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Sidebar Palette (Desktop) */}
        <aside className="hidden lg:flex w-80 bg-white border-l border-slate-200 flex-col shrink-0">
          <div className="p-6 border-b border-slate-200 bg-slate-50/50">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Question Palette</h3>
            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, i) => {
                const status = getStatus(i);
                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIdx(i)}
                    className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center text-[10px] font-black transition-all border-2 relative",
                      status === 'current' ? "bg-white border-indigo-600 text-indigo-600 ring-4 ring-indigo-50" : 
                      status === 'answered' ? "bg-emerald-500 border-emerald-500 text-white" :
                      status === 'review' ? "bg-amber-400 border-amber-400 text-white rounded-full" :
                      status === 'answered-review' ? "bg-amber-400 border-amber-400 text-white rounded-full after:content-['✓'] after:absolute after:-bottom-1 after:-right-1 after:w-4 after:h-4 after:bg-emerald-500 after:rounded-full after:flex after:items-center after:justify-center after:text-[8px]" :
                      "bg-white border-slate-200 text-slate-400"
                    )}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-6 space-y-3 overflow-y-auto custom-scrollbar flex-1">
             <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 leading-none">Legend</h3>
             <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {[
                  { label: 'Answered', count: Object.keys(answers).length, color: 'bg-emerald-500' },
                  { label: 'Review', count: reviewIds.filter(id => !answers[id]).length, color: 'bg-amber-400 rounded-full' },
                  { label: 'Ans & Review', count: reviewIds.filter(id => answers[id]).length, color: 'bg-amber-400 rounded-full after:content-["✓"] relative after:absolute after:bottom-0 after:right-0 after:w-2 after:h-2 after:bg-emerald-500 after:rounded-full' },
                  { label: 'Not Visited', count: questions.length - 0 /* simplified */, color: 'bg-white border-slate-200 border-2' },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-2">
                    <div className={cn("w-4 h-4 shrink-0 rounded", item.color)}></div>
                    <span className="text-[10px] font-bold text-slate-600 truncate">{item.label}</span>
                  </div>
                ))}
             </div>
          </div>

          <div className="p-6 border-t border-slate-200 mt-auto bg-slate-50/50">
             <button 
               onClick={handleFinalSubmit}
               className="w-full py-4 bg-slate-900 hover:bg-emerald-600 text-white font-black rounded-xl transition-all shadow-xl shadow-slate-200 uppercase tracking-widest text-xs flex items-center justify-center gap-3"
             >
               <Send size={16} /> Submit Test
             </button>
          </div>
        </aside>
      </div>

      {/* Footer Actions */}
      <footer className="h-16 sm:h-20 bg-white border-t border-slate-200 px-4 sm:px-8 flex items-center justify-between z-50 shrink-0">
        <div className="flex gap-2 shrink-0">
          <button 
            onClick={() => handleReview(currentQ.id)}
            className="px-3 sm:px-6 py-2 sm:py-3 border-2 border-slate-200 text-slate-600 font-bold rounded-xl text-[10px] sm:text-xs uppercase hover:bg-slate-50 transition-all flex items-center gap-2"
          >
            <Bookmark size={14} className={reviewIds.includes(currentQ.id) ? "fill-amber-400 text-amber-400" : ""} />
            <span className="hidden sm:inline">Mark for Review</span>
            <span className="sm:hidden">Review</span>
          </button>
          <button 
            onClick={() => handleClear(currentQ.id)}
            className="px-3 sm:px-6 py-2 sm:py-3 border-2 border-slate-200 text-slate-600 font-bold rounded-xl text-[10px] sm:text-xs uppercase hover:bg-slate-50 transition-all flex items-center gap-2"
          >
            <RotateCcw size={14} />
            <span className="hidden sm:inline">Clear Response</span>
            <span className="sm:hidden">Clear</span>
          </button>
        </div>

        <div className="flex gap-1.5 sm:gap-4 items-center">
          <button 
            disabled={currentIdx === 0}
            onClick={() => {
              const newIdx = currentIdx - 1;
              setCurrentIdx(newIdx);
              if (test?.isPractice) saveProgress(answers, reviewIds, newIdx);
            }}
            className="px-3 sm:px-6 py-2 sm:py-4 bg-slate-100 text-slate-600 rounded-xl font-black text-[10px] sm:text-xs uppercase hover:bg-slate-200 transition-all disabled:opacity-30 flex items-center gap-2"
          >
            <ChevronLeft size={16} /> <span className="hidden sm:inline">Back</span>
          </button>
          
          <button 
            onClick={() => {
              if (currentIdx === questions.length - 1) {
                setShowSubmitConfirm(true);
              } else {
                const newIdx = currentIdx + 1;
                setCurrentIdx(newIdx);
                if (test?.isPractice) saveProgress(answers, reviewIds, newIdx);
              }
            }}
            className="px-4 sm:px-10 py-2 sm:py-4 bg-indigo-600 text-white rounded-xl font-black text-[10px] sm:text-xs uppercase hover:bg-slate-900 transition-all shadow-lg shadow-indigo-100 flex items-center gap-2 group"
          >
            <span className="hidden sm:inline">{currentIdx === questions.length - 1 ? 'Finish Test' : 'Save & Next'}</span>
            <span className="sm:hidden">{currentIdx === questions.length - 1 ? 'Finish' : 'Next'}</span>
            <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </footer>

      {/* Mobile Floating Action Button for Palette */}
      <div className="lg:hidden fixed bottom-24 right-4 z-[60]">
         <button 
           onClick={() => setShowPalette(true)}
           className="w-14 h-14 bg-indigo-600 text-white rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-all"
         >
           <LayoutList size={28} />
         </button>
      </div>

      {/* Mobile Palette Drawer */}
      <AnimatePresence>
        {showPalette && (
          <div className="fixed inset-0 z-[100] flex justify-end lg:hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPalette(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="bg-white w-full max-w-[280px] h-full relative z-10 shadow-2xl flex flex-col"
            >
               <div className="p-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="font-black text-slate-800 uppercase tracking-tighter italic">Exam Palette</h3>
                  <button onClick={() => setShowPalette(false)} className="p-2 bg-white rounded-lg border border-slate-200">
                    <ChevronRight size={20} />
                  </button>
               </div>
               
               <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-[#FDFDFD]">
                  <div className="grid grid-cols-4 gap-2 mb-8">
                    {questions.map((q, i) => {
                      const status = getStatus(i);
                      return (
                        <button
                          key={q.id}
                          onClick={() => {
                            setCurrentIdx(i);
                            setShowPalette(false);
                          }}
                          className={cn(
                            "aspect-square rounded-lg flex items-center justify-center text-[10px] font-bold border-2 transition-all relative",
                            status === 'current' ? "border-indigo-600 bg-white text-indigo-600" : 
                            status === 'answered' ? "bg-emerald-500 border-emerald-500 text-white" :
                            status === 'review' ? "bg-amber-400 border-amber-400 text-white rounded-full" :
                            status === 'answered-review' ? "bg-amber-400 border-amber-400 text-white rounded-full after:content-['✓'] after:absolute after:-bottom-0.5 after:-right-0.5 after:w-3 after:h-3 after:bg-emerald-500 after:rounded-full after:flex after:items-center after:justify-center after:text-[6px]" :
                            "bg-white border-slate-200 text-slate-400"
                          )}
                        >
                          {i + 1}
                        </button>
                      );
                    })}
                  </div>

                  <div className="space-y-4 pt-4 border-t border-slate-100">
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Action</p>
                     <button 
                       onClick={() => {
                         setShowPalette(false);
                         setShowSubmitConfirm(true);
                       }}
                       className="w-full py-4 bg-rose-600 text-white font-black rounded-xl uppercase tracking-widest text-[10px] shadow-lg shadow-rose-100"
                     >
                       Finish Submission
                     </button>
                  </div>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Submission Confirmation Modal */}
      <AnimatePresence>
        {showSubmitConfirm && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSubmitConfirm(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col"
            >
              <div className="bg-slate-900 p-8 text-white">
                <h3 className="text-2xl font-black italic tracking-tight uppercase mb-2">Final Submission</h3>
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Review your performance summary before closing</p>
              </div>

              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Attempted</p>
                    <p className="text-2xl font-black text-indigo-600">{Object.keys(answers).length}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">In Review</p>
                    <p className="text-2xl font-black text-amber-500">{reviewIds.length}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Unvisited</p>
                    <p className="text-2xl font-black text-slate-400">{questions.length - Object.keys(answers).length}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Items</p>
                    <p className="text-2xl font-black text-slate-900">{questions.length}</p>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-start gap-4">
                   <AlertTriangle className="text-amber-500 shrink-0 mt-1" size={20} />
                   <p className="text-[11px] font-bold text-amber-700 leading-relaxed">
                     Are you sure you want to end this session? Once submitted, you cannot modify your responses. All review marks will be cleared.
                   </p>
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    onClick={() => setShowSubmitConfirm(false)}
                    className="flex-1 py-4 font-black text-slate-400 uppercase tracking-widest text-[10px] hover:text-slate-600 transition-all"
                  >
                    Keep Working
                  </button>
                  <button 
                    onClick={() => {
                      setShowSubmitConfirm(false);
                      handleFinalSubmit();
                    }}
                    className="flex-[2] py-4 bg-rose-600 text-white font-black rounded-2xl uppercase text-[11px] shadow-xl shadow-rose-100 transition-all hover:bg-slate-900"
                  >
                    Finish and Submit
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Submission Confirmation Modal */}
      <AnimatePresence>
        {showSubmitConfirm && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSubmitConfirm(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-md rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col"
            >
              <div className="bg-slate-900 p-6 sm:p-8 text-white">
                <h3 className="text-xl sm:text-2xl font-black italic tracking-tight uppercase mb-2">Review Summary</h3>
                <p className="text-[9px] sm:text-[10px] font-black text-indigo-400 uppercase tracking-widest">Validate your attempts before final submission</p>
              </div>

              <div className="p-6 sm:p-8 space-y-4 sm:space-y-6">
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-100 text-center">
                    <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Attempted</p>
                    <p className="text-xl sm:text-2xl font-black text-indigo-600">{Object.keys(answers).length}</p>
                  </div>
                  <div className="bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-100 text-center">
                    <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">In Review</p>
                    <p className="text-xl sm:text-2xl font-black text-amber-500">{reviewIds.length}</p>
                  </div>
                  <div className="bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-100 text-center">
                    <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Unvisited</p>
                    <p className="text-xl sm:text-2xl font-black text-slate-400">{questions.length - Object.keys(answers).length}</p>
                  </div>
                  <div className="bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-100 text-center">
                    <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total</p>
                    <p className="text-xl sm:text-2xl font-black text-slate-900">{questions.length}</p>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl sm:rounded-2xl flex items-start gap-3 sm:gap-4">
                   <AlertTriangle className="text-amber-500 shrink-0 mt-0.5 sm:mt-1" size={18} />
                   <p className="text-[10px] sm:text-[11px] font-bold text-amber-700 leading-relaxed">
                     Are you sure you want to end this session? Once submitted, you cannot modify your responses. All review marks will be cleared.
                   </p>
                </div>

                <div className="flex gap-3 sm:gap-4 pt-2 sm:pt-4">
                  <button 
                    onClick={() => setShowSubmitConfirm(false)}
                    className="flex-1 py-3 sm:py-4 font-black text-slate-400 uppercase tracking-widest text-[9px] sm:text-[10px] hover:text-slate-600 transition-all border border-transparent hover:border-slate-100 rounded-xl"
                  >
                    Go Back
                  </button>
                  <button 
                    onClick={() => {
                      setShowSubmitConfirm(false);
                      handleFinalSubmit();
                    }}
                    className="flex-[2] py-3 sm:py-4 bg-rose-600 text-white font-black rounded-xl sm:rounded-2xl uppercase text-[10px] sm:text-[11px] shadow-xl shadow-rose-100 transition-all hover:bg-slate-900 active:scale-95"
                  >
                    Finish & Submit
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Saving Indicator */}
      {savingProgress && (
        <div className="fixed top-20 right-4 z-[70]">
           <div className="bg-emerald-500 text-white px-4 py-2 rounded-full text-[8px] font-black uppercase tracking-widest shadow-xl flex items-center gap-2">
              <Loader2 className="animate-spin" size={10} /> Progress Sync
           </div>
        </div>
      )}
    </div>
  );
};
