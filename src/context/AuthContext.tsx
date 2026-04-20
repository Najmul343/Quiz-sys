import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  role: UserRole | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  role: null,
  loading: true,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let detachSnapshot: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        if (detachSnapshot) detachSnapshot();

        detachSnapshot = onSnapshot(
          doc(db, 'users', currentUser.uid),
          (snapshot) => {
            if (snapshot.exists()) {
              const userData = snapshot.data() as UserProfile;
              let currentRole = userData.role || 'student';

              if (currentUser.email === 'thenajmulhuda@gmail.com') {
                currentRole = 'superadmin';
              }

              setProfile(userData);
              setRole(currentRole as UserRole);
            } else {
              setProfile(null);
              setRole(null);
            }
            setLoading(false);
          },
          (error) => {
            console.error("AuthContext listener error:", error);
            setLoading(false);
          }
        );
      } else {
        if (detachSnapshot) detachSnapshot();
        setProfile(null);
        setRole(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (detachSnapshot) detachSnapshot();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, role, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
