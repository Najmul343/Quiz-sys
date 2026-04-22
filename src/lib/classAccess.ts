import { collection, getDocs, query, where, type Firestore } from 'firebase/firestore';

type UserLike = {
  uid?: string | null;
  email?: string | null;
};

type ProfileLike = {
  id?: string;
  uid?: string;
  email?: string;
  collegeId?: string;
  classId?: string;
};

export const sanitizeLegacyDocId = (value?: string | null) =>
  (value || '').toLowerCase().trim().replace(/[^a-zA-Z0-9]/g, '_');

export const getTeacherIdentityCandidates = (user?: UserLike | null, profile?: ProfileLike | null) =>
  Array.from(
    new Set(
      [
        user?.uid,
        sanitizeLegacyDocId(user?.email),
        profile?.uid,
        profile?.id,
        sanitizeLegacyDocId(profile?.email),
      ].filter((value): value is string => Boolean(value))
    )
  );

export const doesClassBelongToTeacher = (classRoom: any, identities: string[]) => {
  const classCandidates = [
    classRoom?.teacherId,
    classRoom?.teacherUid,
    sanitizeLegacyDocId(classRoom?.teacherEmail),
  ].filter((value): value is string => Boolean(value));

  return classCandidates.some((value) => identities.includes(value));
};

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

  const identities = getTeacherIdentityCandidates(params.user, params.profile);
  return classes.find((classRoom) => doesClassBelongToTeacher(classRoom, identities)) || null;
}
