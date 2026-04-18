/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, testConnection } from './lib/firebase';
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

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    testConnection();
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Fetch user role
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setRole(userData.role);
          
          // Special SuperAdmin check for thenajmulhuda@gmail.com
          if (currentUser.email === 'thenajmulhuda@gmail.com') {
            setRole('superadmin');
          }
        } else {
          setRole('student'); // Default role
        }
        setUser(currentUser);
      } else {
        setUser(null);
        setRole(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
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
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
        <Routes>
          <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" />} />
          
          <Route path="/" element={
            user ? (
              role === 'superadmin' ? <Navigate to="/superadmin" /> :
              role === 'principal' ? <Navigate to="/principal" /> :
              role === 'teacher' ? <Navigate to="/teacher" /> :
              role === 'admin' ? <Navigate to="/admin" /> :
              <Navigate to="/student" />
            ) : <LoginPage />
          } />

          <Route path="/superadmin/*" element={
            user && role === 'superadmin' ? <SuperAdminDashboard /> : <Navigate to="/login" />
          } />

          <Route path="/principal/*" element={
            user && role === 'principal' ? <PrincipalDashboard /> : <Navigate to="/login" />
          } />

          <Route path="/teacher/*" element={
            user && role === 'teacher' ? <TeacherDashboard /> : <Navigate to="/login" />
          } />

          <Route path="/student/*" element={
            user && role === 'student' ? <StudentDashboard /> : <Navigate to="/login" />
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

