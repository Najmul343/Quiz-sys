import { User } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import type { UserProfile } from '../types';

const normalizeEmail = (email?: string | null) => (email || '').toLowerCase().trim();
const sanitizeDocId = (email: string) => email.replace(/[^a-zA-Z0-9]/g, '_');

function coerceProfile(id: string, data: any, fallbackEmail?: string | null, fallbackName?: string | null): UserProfile {
  return {
    id,
    uid: data?.uid || id,
    email: data?.email || fallbackEmail || '',
    displayName: data?.displayName || data?.officialName || fallbackName || '',
    role: data?.role || 'student',
    collegeId: data?.collegeId,
    classId: data?.classId,
    trade: data?.trade,
    rollNo: data?.rollNo,
    createdAt: data?.createdAt ?? null,
    ...data,
  } as UserProfile;
}

async function resolveCollegeForPrincipal(email: string, profile: UserProfile | null) {
  if (profile?.collegeId) return profile;

  const collegeSnap = await getDocs(
    query(collection(db, 'colleges'), where('principalEmail', '==', email), limit(1))
  );

  if (collegeSnap.empty) return profile;

  const college = collegeSnap.docs[0];
  return {
    ...(profile || {}),
    role: profile?.role || 'principal',
    collegeId: college.id,
    displayName: profile?.displayName || college.data()?.principalName || '',
  } as UserProfile;
}

export async function resolveCurrentUserProfile(currentUser: User | null): Promise<UserProfile | null> {
  if (!currentUser) return null;

  const email = normalizeEmail(currentUser.email);
  const uidDoc = await getDoc(doc(db, 'users', currentUser.uid));
  if (uidDoc.exists()) {
    const profile = coerceProfile(uidDoc.id, uidDoc.data(), email, currentUser.displayName);
    const resolvedProfile = profile.role === 'principal' ? await resolveCollegeForPrincipal(email, profile) : profile;
    if (resolvedProfile.collegeId !== profile.collegeId || resolvedProfile.role !== profile.role) {
      await setDoc(
        doc(db, 'users', currentUser.uid),
        {
          ...resolvedProfile,
          uid: currentUser.uid,
          email: email || resolvedProfile.email,
          displayName: resolvedProfile.displayName || currentUser.displayName || '',
          updatedAt: new Date(),
        },
        { merge: true }
      );
    }
    return {
      ...resolvedProfile,
      uid: currentUser.uid,
      email: email || resolvedProfile.email,
      displayName: resolvedProfile.displayName || currentUser.displayName || '',
    };
  }

  const emailDocId = email ? sanitizeDocId(email) : '';
  if (emailDocId) {
    const emailDoc = await getDoc(doc(db, 'users', emailDocId));
    if (emailDoc.exists()) {
      const profile = coerceProfile(emailDoc.id, emailDoc.data(), email, currentUser.displayName);
      const resolvedProfile = profile.role === 'principal' ? await resolveCollegeForPrincipal(email, profile) : profile;
      await setDoc(
        doc(db, 'users', currentUser.uid),
        {
          ...resolvedProfile,
          uid: currentUser.uid,
          email: email || resolvedProfile.email,
          displayName: resolvedProfile.displayName || currentUser.displayName || '',
          // Creating a UID-based profile doc requires a createdAt timestamp per rules.
          createdAt: resolvedProfile.createdAt ?? serverTimestamp(),
          updatedAt: new Date(),
        },
        { merge: true }
      );
      return {
        ...resolvedProfile,
        uid: currentUser.uid,
        email: email || resolvedProfile.email,
        displayName: resolvedProfile.displayName || currentUser.displayName || '',
      };
    }
  }

  if (email) {
    const emailQuerySnap = await getDocs(
      query(collection(db, 'users'), where('email', '==', email), limit(1))
    );
    if (!emailQuerySnap.empty) {
      const matchedDoc = emailQuerySnap.docs[0];
      const profile = coerceProfile(matchedDoc.id, matchedDoc.data(), email, currentUser.displayName);
      const resolvedProfile = profile.role === 'principal' ? await resolveCollegeForPrincipal(email, profile) : profile;
      await setDoc(
        doc(db, 'users', currentUser.uid),
        {
          ...resolvedProfile,
          uid: currentUser.uid,
          email: email || resolvedProfile.email,
          displayName: resolvedProfile.displayName || currentUser.displayName || '',
          // Creating a UID-based profile doc requires a createdAt timestamp per rules.
          createdAt: resolvedProfile.createdAt ?? serverTimestamp(),
          updatedAt: new Date(),
        },
        { merge: true }
      );
      return {
        ...resolvedProfile,
        uid: currentUser.uid,
        email: email || resolvedProfile.email,
        displayName: resolvedProfile.displayName || currentUser.displayName || '',
      };
    }
  }

  const collegeSnap = email
    ? await getDocs(query(collection(db, 'colleges'), where('principalEmail', '==', email), limit(1)))
    : null;

  if (collegeSnap && !collegeSnap.empty) {
    const college = collegeSnap.docs[0];
    const profile: UserProfile = {
      uid: currentUser.uid,
      email: email || currentUser.email || '',
      displayName: currentUser.displayName || college.data()?.principalName || '',
      role: 'principal',
      collegeId: college.id,
      createdAt: null,
    };
    await setDoc(
      doc(db, 'users', currentUser.uid),
      {
        ...profile,
        createdAt: serverTimestamp(),
        updatedAt: new Date(),
      },
      { merge: true }
    );
    return profile;
  }

  return {
    uid: currentUser.uid,
    email: email || currentUser.email || '',
    displayName: currentUser.displayName || '',
    role: 'student',
    createdAt: null,
  };
}
