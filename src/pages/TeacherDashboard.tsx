import { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { auth, db } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { motion } from 'framer-motion';
import { 
  LayoutDashboard, 
  BookOpen, 
  FilePlus, 
  Users, 
  Settings, 
  LogOut,
  Plus,
  Search,
  BrainCircuit,
  BarChart3,
  Menu,
  X
} from 'lucide-react';

import TeacherOverview from './teacher/Overview';
import QuestionBank from './teacher/QuestionBank';
import TestCreator from './teacher/TestCreator';
import TeacherReports from './teacher/Reports';
import StudentManagement from './teacher/StudentManagement';
import { useAuth } from '../context/AuthContext';

export default function TeacherDashboard() {
  const location = useLocation();
  const { profile } = useAuth();
  const [stats, setStats] = useState({ questions: 0, tests: 0, students: 0 });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { name: 'Overview', path: '/teacher', icon: LayoutDashboard },
    { name: 'Question Bank', path: '/teacher/questions', icon: BookOpen },
    { name: 'Create Test', path: '/teacher/create-test', icon: FilePlus },
    { name: 'Reports & Analytics', path: '/teacher/reports', icon: BarChart3 },
    { name: 'Student Management', path: '/teacher/students', icon: Users },
  ];

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-[var(--bg)] text-[var(--text-main)] font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-[var(--border)] hidden md:flex flex-col sticky top-0 h-screen">
        <div className="h-16 flex items-center px-6 border-b border-[var(--border)]">
          <div className="flex items-center gap-3 text-[var(--primary)] font-extrabold text-xl tracking-tighter">
            <div className="w-8 h-8 bg-[var(--primary)] rounded-lg flex items-center justify-center text-white">M</div>
            MAGIC <span className="text-[var(--text-main)]">MCQ</span>
          </div>
        </div>

        <nav className="flex-1 p-5 space-y-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const PathIcon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                  isActive 
                  ? 'bg-[var(--primary)] text-white shadow-xl shadow-indigo-100' 
                  : 'text-[var(--text-sub)] hover:bg-[var(--bg)] hover:text-[var(--text-main)]'
                }`}
              >
                <PathIcon size={18} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-5 border-t border-[var(--border)]">
          <button 
            onClick={() => signOut(auth)}
            className="w-full flex items-center gap-3 px-4 py-3 text-[var(--text-sub)] hover:text-red-600 font-bold transition-colors text-sm"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <motion.aside
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: 'spring', stiffness: 280, damping: 30 }}
            className="relative z-50 w-72 h-full bg-white border-r border-[var(--border)] shadow-2xl flex flex-col"
          >
            <div className="h-16 flex items-center justify-between px-5 border-b border-[var(--border)]">
              <div className="flex items-center gap-3 text-[var(--primary)] font-extrabold text-lg tracking-tighter">
                <div className="w-8 h-8 bg-[var(--primary)] rounded-lg flex items-center justify-center text-white">M</div>
                MAGIC <span className="text-[var(--text-main)]">MCQ</span>
              </div>
              <button
                aria-label="Close navigation"
                onClick={() => setMobileMenuOpen(false)}
                className="w-10 h-10 rounded-xl border border-[var(--border)] flex items-center justify-center text-[var(--text-sub)]"
              >
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                const PathIcon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                      isActive
                        ? 'bg-[var(--primary)] text-white shadow-xl shadow-indigo-100'
                        : 'text-[var(--text-sub)] hover:bg-[var(--bg)] hover:text-[var(--text-main)]'
                    }`}
                  >
                    <PathIcon size={18} />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
            <div className="p-5 border-t border-[var(--border)] space-y-3">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
                <p className="text-xs font-black uppercase tracking-widest text-[var(--text-sub)]">Signed in as</p>
                <p className="text-sm font-extrabold text-[var(--text-main)] mt-1">{profile?.displayName || auth.currentUser?.displayName || 'Teacher'}</p>
                <p className="text-[10px] text-[var(--text-sub)]">{profile?.email || auth.currentUser?.email}</p>
              </div>
              <button
                onClick={() => signOut(auth)}
                className="w-full flex items-center gap-3 px-4 py-3 text-[var(--text-sub)] hover:text-red-600 font-bold transition-colors text-sm"
              >
                <LogOut size={18} />
                Logout
              </button>
            </div>
          </motion.aside>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <header className="h-16 bg-white border-b border-[var(--border)] flex items-center justify-between px-8 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden w-10 h-10 rounded-xl border border-[var(--border)] flex items-center justify-center text-[var(--text-main)]"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={18} />
            </button>
            <h2 className="text-lg font-extrabold text-[var(--text-main)] capitalize">
              {location.pathname.split('/').pop()?.replace('-', ' ') || 'Overview'}
            </h2>
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <div className="badge hidden sm:block">Teacher Access</div>
            <div style={{ height: '24px', width: '1px', backgroundColor: 'var(--border)' }}></div>
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-[var(--text-main)]">{profile?.displayName || auth.currentUser?.displayName || 'Teacher'}</p>
                <p className="text-[10px] text-[var(--text-sub)]">{profile?.email || auth.currentUser?.email}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center font-black text-[var(--primary)] text-sm shadow-sm transition-transform hover:scale-105">
                {profile?.displayName?.charAt(0) || auth.currentUser?.displayName?.charAt(0) || auth.currentUser?.email?.charAt(0) || 'T'}
              </div>
            </div>
          </div>
        </header>

        <div className="p-6 lg:p-8 max-w-7xl mx-auto">
          <Routes>
            <Route index element={<TeacherOverview />} />
            <Route path="questions" element={<QuestionBank />} />
            <Route path="create-test" element={<TestCreator />} />
            <Route path="reports" element={<TeacherReports />} />
            <Route path="students" element={<StudentManagement />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
