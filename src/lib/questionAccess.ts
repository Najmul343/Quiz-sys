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
  scopeType: 'subject' | 'chapter';
  subject?: string;
  chapter?: string;
};

const dedupeById = <T extends { id: string }>(items: T[]) => Array.from(new Map(items.map((item) => [item.id, item])).values());

export async function fetchAccessibleQuestions(db: Firestore, collegeId: string) {
  const [baseSnap, shareSnap] = await Promise.all([
    getDocs(query(collection(db, 'questions'), where('collegeId', '==', collegeId))),
    getDocs(query(collection(db, 'question_shares'), where('targetCollegeId', '==', collegeId))),
  ]);
  const baseQuestions = baseSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as QuestionDoc[];
  const grants = shareSnap.docs.map((doc) => doc.data()) as ShareGrant[];

  const sharedQuestions: QuestionDoc[] = [];

  for (const grant of grants) {
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
