import { collection, getDocs, query, where, type Firestore } from 'firebase/firestore';

type QuestionDoc = {
  id: string;
  collegeId?: string;
  subject?: string;
  chapter?: string;
  [key: string]: any;
};

type ShareGrant = {
  sourceCollegeId: string;
  targetCollegeId: string;
  targetClassId?: string;
  scopeType: 'subject' | 'chapter';
  subject?: string;
  chapter?: string;
};

const dedupeById = <T extends { id: string }>(items: T[]) => Array.from(new Map(items.map((item) => [item.id, item])).values());

export async function fetchAccessibleQuestions(
  db: Firestore,
  collegeId: string,
  options?: {
    classId?: string | null;
    mode?: 'teacher' | 'principal' | 'superadmin';
  }
) {
  const classId = options?.classId || '';
  const isTeacherClassScoped = options?.mode === 'teacher' && !!classId;

  const shareQueries = [getDocs(query(collection(db, 'question_shares'), where('targetCollegeId', '==', collegeId)))];
  if (classId) {
    shareQueries.push(getDocs(query(collection(db, 'question_shares'), where('targetClassId', '==', classId))));
  }

  const [baseSnap, ...shareResults] = await Promise.all([
    getDocs(query(collection(db, 'questions'), where('collegeId', '==', collegeId))),
    ...shareQueries,
  ]);
  const baseQuestions = (baseSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as QuestionDoc[]).filter((question) =>
    isTeacherClassScoped ? question.classId === classId : true
  );
  const grants = dedupeById(
    shareResults.flatMap((shareResult) => shareResult.docs.map((shareDoc) => ({ id: shareDoc.id, ...shareDoc.data() })))
  ) as (ShareGrant & { id: string })[];

  const sharedQuestions: QuestionDoc[] = [];

  for (const grant of grants) {
    if (grant.targetClassId && grant.targetClassId !== classId) continue;
    const sourceSnap = await getDocs(query(collection(db, 'questions'), where('collegeId', '==', grant.sourceCollegeId)));
    const sourceQuestions = sourceSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as QuestionDoc[];
    const matched = sourceQuestions.filter((question) => {
      if (grant.scopeType === 'subject') {
        return question.subject === grant.subject;
      }
      return question.subject === grant.subject && question.chapter === grant.chapter;
    });

    sharedQuestions.push(
      ...matched.map((question) => ({
        ...question,
        sharedFromCollegeId: grant.sourceCollegeId,
        sharedScopeType: grant.scopeType,
        sharedGrantId: grant.id,
      }))
    );
  }

  return dedupeById([...baseQuestions, ...sharedQuestions]);
}

export async function createQuestionShare(db: Firestore, share: ShareGrant & { createdBy: string }) {
  return {
    sourceCollegeId: share.sourceCollegeId,
    targetCollegeId: share.targetCollegeId,
    scopeType: share.scopeType,
    subject: share.subject || '',
    chapter: share.chapter || '',
    createdBy: share.createdBy,
  };
}
