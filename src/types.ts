export type UserRole = 'superadmin' | 'principal' | 'teacher' | 'student' | 'admin';

export interface UserProfile {
  id?: string;
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  collegeId?: string;
  classId?: string; // For students and teachers
  trade?: string; // Branch/Subject specialty
  rollNo?: string;
  createdAt: any;
}

export interface College {
  id: string;
  name: string;
  location: string;
  principalId: string;
  principalEmail: string;
  createdAt: any;
}

export interface ClassRoom {
  id: string;
  collegeId: string;
  name: string; // e.g. "Drafting - Batch A"
  teacherId: string;
  createdAt: any;
}

export interface Question {
  id: string;
  text: string;
  imageUrl?: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  optionImages?: {
    A?: string;
    B?: string;
    C?: string;
    D?: string;
  };
  answer: 'A' | 'B' | 'C' | 'D';
  subject: string;
  chapter: string;
  difficulty: 'easy' | 'medium' | 'hard';
  explanation?: string;
  createdBy: string;
  collegeId?: string;
  createdAt: any;
}

export interface TestSettings {
  forceFullscreen: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showInstantFeedback: boolean; // Practice mode
  allowOnce: boolean;
  authRequired: boolean; // false = name dropdown
}

export interface Test {
  id: string;
  title: string;
  subject: string;
  chapter?: string; // Optional if multi-chapter
  duration: number; // minutes
  passingMarks: number;
  questionIds: string[];
  settings: TestSettings;
  teacherId: string;
  collegeId?: string;
  visible?: boolean;
  status: 'active' | 'inactive' | 'draft';
  isPractice: boolean;
  createdAt: any;
}

export interface Submission {
  id: string;
  studentId: string;
  studentName: string; // Helpful for non-auth tests
  studentRollNo?: string;
  testId: string;
  answers: Record<string, string>;
  score: number;
  total: number;
  percentage?: number;
  released?: boolean;
  status: 'PASS' | 'FAIL';
  violations: {
    fsExits: number;
    tabSwitches: number;
  };
  submittedAt: any;
}
