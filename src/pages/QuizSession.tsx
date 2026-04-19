import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, auth } from '../lib/firebase';
import { doc, getDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShieldAlert, 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  Send, 
  Loader2,
  AlertTriangle,
  LayoutList
} from 'lucide-react';
import { cn } from '../lib/utils';

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
    setAnswers(prev => ({ ...prev, [qId]: option }));
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
        answers, // This stores the raw response sheet
        score: rightAnswers,
        total: totalQuestions,
        rightAnswers,
        wrongAnswers,
        attempted,
        percentage: Number(percentage.toFixed(2)),
        status: percentage >= passingMarks ? 'PASS' : 'FAIL',
        released: false, // Teacher must release it
        violations,
        submittedAt: serverTimestamp()
      });
      
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

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col select-none relative" ref={containerRef}>
      {/* Quiz Header */}
      <header className={cn(
        "h-24 bg-white border-b border-slate-100 px-12 flex items-center justify-between sticky top-0 z-40 bg-white/80 backdrop-blur-md transition-all duration-300",
        isFullscreen && "max-h-0 py-0 overflow-hidden opacity-0 sm:max-h-24 sm:py-5 sm:opacity-100",
        "mobile-landscape:hidden"
      )}>
        <div className="flex items-center gap-6">
          <div className="w-14 h-14 bg-slate-900 text-white rounded-[1.5rem] flex items-center justify-center font-black text-xl shadow-lg shadow-slate-200">
            {currentIdx + 1}
          </div>
          <div>
            <h2 className="font-black text-slate-800 tracking-tight text-lg italic">{test?.title}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded uppercase tracking-widest">
                Question {currentIdx + 1} of {questions.length}
              </span>
              {test?.isPractice && (
                <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded uppercase tracking-widest">Practice Mode</span>
              )}
            </div>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-4">
          <div className={cn(
            "flex items-center gap-3 px-8 py-3 rounded-2xl border-2 font-black transition-all shadow-inner",
            timeLeft < 300 ? "bg-red-50 border-red-100 text-red-600 animate-pulse" : "bg-slate-50 border-slate-100 text-slate-700"
          )}>
            <Clock size={20} />
            <span className="text-2xl tabular-nums tracking-tighter">{formatTime(timeLeft)}</span>
          </div>

          <button 
            onClick={() => setShowPalette(true)}
            className="w-14 h-14 bg-slate-100 hover:bg-slate-200 rounded-2xl flex items-center justify-center text-slate-600 transition-all font-black text-xl border-2 border-slate-200"
          >
            <LayoutList size={24} />
          </button>
        </div>

        <button 
          onClick={handleFinalSubmit}
          className="bg-slate-900 hover:bg-emerald-600 text-white font-black px-10 py-5 rounded-[2rem] flex items-center gap-3 transition-all shadow-2xl shadow-slate-200 active:scale-95"
        >
          <Send size={20} />
          <span className="text-xs uppercase tracking-widest">Complete Test</span>
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-12 flex flex-col gap-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIdx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex-1 flex flex-col gap-10"
          >
            <div className="bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-2xl shadow-slate-200/40 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-2 h-full bg-slate-900" />
              
              {currentQ.imageUrl && (
                <div className="w-full h-80 bg-slate-50 rounded-[2.5rem] mb-10 overflow-hidden border border-slate-100 p-4">
                   <img src={currentQ.imageUrl} alt="Diagram" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                </div>
              )}

              <h3 className="text-3xl font-black text-slate-800 leading-tight mb-12 italic tracking-tighter">
                {currentQ.text}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Object.entries(currentQ.options).map(([key, text]) => {
                  const isSelected = answers[currentQ.id] === key;
                  const isCorrect = key === currentQ.answer;
                  const showResult = test?.isPractice && isSelected;

                  return (
                    <button
                      key={key}
                      onClick={() => handleSelect(currentQ.id, key)}
                      className={cn(
                        "flex items-center gap-6 p-8 rounded-[2.5rem] border-4 transition-all text-left relative overflow-hidden group/opt",
                        isSelected 
                        ? (test?.isPractice ? (isCorrect ? 'bg-emerald-50 border-emerald-500' : 'bg-rose-50 border-rose-500') : 'bg-slate-900 border-slate-900 text-white shadow-2xl shadow-slate-300') 
                        : "bg-slate-50/50 border-transparent hover:border-slate-200 text-slate-600 hover:bg-white"
                      )}
                    >
                      <div className={cn(
                        "w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl transition-all border-4",
                        isSelected 
                        ? (test?.isPractice ? (isCorrect ? 'bg-emerald-500 border-emerald-400 text-white shadow-emerald-200' : 'bg-rose-500 border-rose-400 text-white shadow-rose-200') : 'bg-white/10 border-white/20 text-white') 
                        : "bg-white border-slate-200 group-hover/opt:border-slate-300 text-slate-400 group-hover/opt:text-slate-900"
                      )}>
                        {key}
                      </div>
                      <div className="flex-1">
                        <span className="text-xl font-black tracking-tight leading-none block">{text as string}</span>
                        {showResult && (
                           <motion.p initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className={cn("text-[10px] font-black uppercase tracking-widest mt-2", isCorrect ? "text-emerald-600" : "text-rose-600")}>
                             {isCorrect ? "Perfect Matrix Match" : "Incorrect Calibration"}
                           </motion.p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Footer Nav */}
        <div className={cn(
          "flex justify-between items-center bg-white/60 backdrop-blur-md p-6 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 sticky bottom-10 transition-all duration-300",
          isFullscreen && "max-h-0 py-0 overflow-hidden opacity-0 sm:max-h-32 sm:py-6 sm:opacity-100"
        )}>
          <button 
            disabled={currentIdx === 0}
            onClick={() => setCurrentIdx(prev => prev - 1)}
            className="flex items-center gap-3 px-10 py-5 font-black text-slate-400 hover:text-slate-900 disabled:opacity-30 transition-all uppercase tracking-widest text-xs"
          >
            <ChevronLeft size={24} />
            Previous
          </button>
          
          <div className="hidden sm:flex gap-3">
            {questions.map((_, i) => (
              <div 
                key={i}
                onClick={() => setCurrentIdx(i)}
                className={cn(
                  "w-3 h-3 rounded-full cursor-pointer transition-all hover:scale-150",
                  i === currentIdx ? "w-10 bg-slate-900" : answers[questions[i].id] ? "bg-emerald-400 shadow-lg shadow-emerald-100" : "bg-slate-200"
                )}
              />
            ))}
          </div>

          <button 
            disabled={currentIdx === questions.length - 1}
            onClick={() => setCurrentIdx(prev => prev + 1)}
            className="flex items-center gap-3 px-10 py-5 font-black transition-all uppercase tracking-widest text-xs text-white bg-slate-900 hover:bg-slate-800 rounded-[2rem]"
          >
            Next Question
            <ChevronRight size={24} />
          </button>
        </div>
      </main>

      {/* Palette Drawer */}
      <AnimatePresence>
        {showPalette && (
          <div className="fixed inset-0 z-[100] flex justify-end">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPalette(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-md cursor-pointer"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="bg-white w-full max-w-md h-full relative z-10 shadow-2xl p-12 flex flex-col"
            >
              <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-4 italic">Response Matrix</h3>
              <p className="text-slate-400 font-bold mb-10 text-sm uppercase tracking-widest">Instant Navigation Jump</p>

              <div className="grid grid-cols-5 gap-3 flex-1 overflow-y-auto pr-4 custom-scrollbar">
                {questions.map((q, i) => (
                  <button
                    key={q.id}
                    onClick={() => {
                      setCurrentIdx(i);
                      setShowPalette(false);
                    }}
                    className={cn(
                      "aspect-square rounded-2xl flex items-center justify-center font-black transition-all border-4",
                      i === currentIdx ? "bg-slate-900 border-slate-900 text-white" : answers[q.id] ? "bg-emerald-400 shadow-lg shadow-emerald-100" : "bg-slate-200"
                    )}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>

              <button 
                onClick={() => setShowPalette(false)}
                className="mt-12 w-full py-6 bg-slate-50 text-slate-600 font-black rounded-3xl hover:bg-slate-100 transition-all uppercase tracking-widest text-xs"
              >
                CLOSE MATRIX
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
