/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, LogOut, LayoutDashboard, FileText, UserCircle, Settings, Shield } from 'lucide-react';

// Modules (To be created)
import Home from './pages/Home';
import LoginPage from './pages/Login';
import TeacherDashboard from './pages/TeacherDashboard';
import StudentDashboard from './pages/StudentDashboard';
import QuizSession from './pages/QuizSession';
import AdminDashboard from './pages/AdminDashboard';
import PrincipalDashboard from './pages/PrincipalDashboard';
import SuperAdminDashboard from './pages/SuperAdminDashboard';

import { cn } from './lib/utils';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let detachSnapshot: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Clear previous listener if it exists
        if (detachSnapshot) detachSnapshot();

        // Listen to user document in real-time
        // This is crucial for detecting when a stub document is migrated to a UID document during first login
        detachSnapshot = onSnapshot(doc(db, 'users', currentUser.uid), (snapshot) => {
          if (snapshot.exists()) {
            const userData = snapshot.data();
            setRole(userData.role || 'student');
            
            // Special SuperAdmin check for thenajmulhuda@gmail.com
            if (currentUser.email === 'thenajmulhuda@gmail.com') {
              setRole('superadmin');
            }
          } else {
            // Document doesn't exist at UID yet (might be awaiting migration)
            // We set role to null to indicate it's still being fetched/migrated
            setRole(null);
          }
          setUser(currentUser);
          setLoading(false);
        }, (error) => {
          console.error("User doc listener error:", error);
          setLoading(false);
        });

      } else {
        if (detachSnapshot) detachSnapshot();
        setUser(null);
        setRole(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (detachSnapshot) detachSnapshot();
    };
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <Router>
      <div className={cn(
        "min-h-screen transition-colors duration-500",
        role === 'student' && "theme-student",
        role === 'teacher' && "theme-teacher",
        role === 'principal' && "theme-principal",
        role === 'superadmin' && "theme-super-admin",
        !role && "bg-slate-50"
      )}>
        <Routes>
          <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" />} />
          
          <Route path="/" element={
            user ? (
              role ? (
                role === 'superadmin' ? <Navigate to="/superadmin" /> :
                role === 'principal' ? <Navigate to="/principal" /> :
                role === 'teacher' ? <Navigate to="/teacher" /> :
                role === 'admin' ? <Navigate to="/admin" /> :
                <Navigate to="/student" />
              ) : (
                <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
                  <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Initializing Identity Profile...</p>
                </div>
              )
            ) : <LoginPage />
          } />

          <Route path="/superadmin/*" element={
            user && role === 'superadmin' ? <SuperAdminDashboard /> : (user && !role ? <Navigate to="/" /> : <Navigate to="/login" />)
          } />

          <Route path="/principal/*" element={
            user && role === 'principal' ? <PrincipalDashboard /> : (user && !role ? <Navigate to="/" /> : <Navigate to="/login" />)
          } />

          <Route path="/teacher/*" element={
            user && role === 'teacher' ? <TeacherDashboard /> : (user && !role ? <Navigate to="/" /> : <Navigate to="/login" />)
          } />

          <Route path="/student/*" element={
            user && role === 'student' ? <StudentDashboard /> : (user && !role ? <Navigate to="/" /> : <Navigate to="/login" />)
          } />

          <Route path="/quiz/:testId" element={
            user ? <QuizSession /> : <Navigate to="/login" />
          } />

          <Route path="/admin/*" element={
            user && role === 'admin' ? <AdminDashboard /> : <Navigate to="/login" />
          } />
        </Routes>
      </div>
    </Router>
  );
}

