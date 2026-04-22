import { collection, getDocs, query, where, type Firestore } from 'firebase/firestore';

type UserLike = {
  uid?: string | null;
  email?: string | null;
};

type ProfileLike = {
  collegeId?: string;
  classId?: string;
};

export const sanitizeLegacyDocId = (value?: string | null) =>
  (value || '').toLowerCase().trim().replace(/[^a-zA-Z0-9]/g, '_');

export const getTeacherIdentityCandidates = (user?: UserLike | null) =>
  Array.from(
    new Set(
      [user?.uid, sanitizeLegacyDocId(user?.email)].filter((value): value is string => Boolean(value))
    )
  );

export async function resolveTeacherAssignedClass(
  db: Firestore,
  params: {
    collegeId?: string;
    user?: UserLike | null;
    profile?: ProfileLike | null;
  }
) {
  const collegeId = params.collegeId || params.profile?.collegeId;
  if (!collegeId) return null;

  const classIdFromProfile = params.profile?.classId;
  const classSnap = await getDocs(query(collection(db, 'classes'), where('collegeId', '==', collegeId)));
  const classes = classSnap.docs.map((classDoc) => ({ id: classDoc.id, ...classDoc.data() })) as any[];

  if (classIdFromProfile) {
    const matchedByProfile = classes.find((classRoom) => classRoom.id === classIdFromProfile);
    if (matchedByProfile) return matchedByProfile;
  }

  const identities = getTeacherIdentityCandidates(params.user);
  return classes.find((classRoom) => identities.includes(classRoom.teacherId)) || null;
}
