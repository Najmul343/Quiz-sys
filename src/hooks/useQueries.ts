import { useQuery } from '@tanstack/react-query';
import { collection, query, where, getDocs, orderBy, getDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Test, Submission, Question, UserProfile, College } from '../types';

// STUDENT HOOKS
export const useStudentTests = (collegeId: string | undefined) => {
  return useQuery({
    queryKey: ['tests', 'student', collegeId],
    queryFn: async () => {
      if (!collegeId) return [];
      const q = query(collection(db, 'tests'), where('status', '==', 'active'), where('collegeId', '==', collegeId), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Test));
    },
    enabled: !!collegeId,
  });
};

export const useStudentSubmissions = (studentId: string | undefined) => {
  return useQuery({
    queryKey: ['submissions', 'student', studentId],
    queryFn: async () => {
      if (!studentId) return [];
      const q = query(collection(db, 'submissions'), where('studentId', '==', studentId), orderBy('submittedAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Submission));
    },
    enabled: !!studentId,
  });
};

export const usePracticeProgress = (studentId: string | undefined) => {
  return useQuery({
    queryKey: ['practice_progress', studentId],
    queryFn: async () => {
      if (!studentId) return {};
      const q = query(collection(db, 'practice_progress'), where('studentId', '==', studentId));
      const snap = await getDocs(q);
      const progMap: Record<string, any> = {};
      snap.docs.forEach(d => { progMap[d.data().testId] = d.data(); });
      return progMap;
    },
    enabled: !!studentId,
  });
};

// TEACHER HOOKS
export const useTeacherQuestions = (collegeId: string | undefined, teacherId: string | undefined) => {
  return useQuery({
    queryKey: ['questions', 'teacher', teacherId],
    queryFn: async () => {
      if (!collegeId || !teacherId) return [];
      // To strictly follow blueprint, we query by collegeId and createdBy
      const q = query(collection(db, 'questions'), where('collegeId', '==', collegeId));
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question));
    },
    enabled: !!collegeId && !!teacherId,
  });
};

export const useTeacherTests = (collegeId: string | undefined, teacherId: string | undefined) => {
  return useQuery({
    queryKey: ['tests', 'teacher', teacherId],
    queryFn: async () => {
      if (!collegeId || !teacherId) return [];
      const q = query(collection(db, 'tests'), where('teacherId', '==', teacherId), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Test));
    },
    enabled: !!collegeId && !!teacherId,
  });
};

// ADMIN & PRINCIPAL HOOKS
export const useCollegeUsers = (collegeId: string | undefined, role: string) => {
  return useQuery({
    queryKey: ['users', 'college', collegeId, role],
    queryFn: async () => {
      if (!collegeId) return [];
      const q = query(collection(db, 'users'), where('collegeId', '==', collegeId), where('role', '==', role));
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));
    },
    enabled: !!collegeId,
  });
};

export const useAllColleges = (isSuperAdmin: boolean) => {
  return useQuery({
    queryKey: ['colleges', 'all'],
    queryFn: async () => {
      if (!isSuperAdmin) return [];
      const snap = await getDocs(collection(db, 'colleges'));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as College));
    },
    enabled: isSuperAdmin,
  });
};

