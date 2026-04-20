/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import { Loader2 } from 'lucide-react';
import { cn } from './lib/utils';

// Modules
import LoginPage from './pages/Login';
import TeacherDashboard from './pages/TeacherDashboard';
import StudentDashboard from './pages/StudentDashboard';
import QuizSession from './pages/QuizSession';
import AdminDashboard from './pages/AdminDashboard';
import PrincipalDashboard from './pages/PrincipalDashboard';
import SuperAdminDashboard from './pages/SuperAdminDashboard';

function RootRedirect() {
  const { user, role, loading } = useAuth();
  
  if (loading || (user && !role)) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Initializing Identity Profile...</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  switch (role) {
    case 'superadmin': return <Navigate to="/superadmin" replace />;
    case 'principal': return <Navigate to="/principal" replace />;
    case 'teacher': return <Navigate to="/teacher" replace />;
    case 'admin' as any: return <Navigate to="/admin" replace />;
    default: return <Navigate to="/student" replace />;
  }
}

export default function App() {
  const { role, user, loading } = useAuth();

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
          <Route path="/" element={<RootRedirect />} />
          
          <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" replace />} />

          <Route path="/superadmin/*" element={
            <ProtectedRoute allowedRoles={['superadmin']}>
              <SuperAdminDashboard />
            </ProtectedRoute>
          } />

          <Route path="/principal/*" element={
            <ProtectedRoute allowedRoles={['principal']}>
              <PrincipalDashboard />
            </ProtectedRoute>
          } />

          <Route path="/teacher/*" element={
            <ProtectedRoute allowedRoles={['teacher']}>
              <TeacherDashboard />
            </ProtectedRoute>
          } />

          <Route path="/student/*" element={
            <ProtectedRoute allowedRoles={['student']}>
              <StudentDashboard />
            </ProtectedRoute>
          } />

          <Route path="/admin/*" element={
            <ProtectedRoute allowedRoles={['admin' as any]}>
              <AdminDashboard />
            </ProtectedRoute>
          } />

          <Route path="/quiz/:testId" element={
            <ProtectedRoute>
              <QuizSession />
            </ProtectedRoute>
          } />
        </Routes>
      </div>
    </Router>
  );
}
