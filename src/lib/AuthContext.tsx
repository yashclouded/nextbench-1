import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { handleFirestoreError, OperationType } from './firestore-errors';
import { usePresence } from './presence';

export interface UserData {
  name: string;
  email: string;
  school: string;
  verified: boolean;
  verificationStatus: 'pending' | 'approved' | 'rejected';
  reputation: number;
  isAdmin: boolean;
  role?: 'admin' | 'moderator' | 'user';
  profilePicture?: string | null;
  idCardUrl?: string | null;
  selfieUrl?: string | null;
  about?: string | null;
  username?: string | null;
  city?: string;
  createdAt: string;
  updatedAt: string;
  // Name fields
  firstName?: string | null;
  lastName?: string | null;
  // Anonymous posting
  anonymousPersonaName?: string | null;
  lastUsernameChange?: { toDate: () => Date } | null;
  // Chat privacy settings
  chatPrivacy?: { followersOnly?: boolean } | null;
  // Organization account fields
  accountType?: 'student' | 'organization';
  orgName?: string | null;
  orgType?: 'company' | 'school' | 'coaching' | 'ngo' | 'other' | null;
  orgDocumentUrl?: string | null;
  orgWebsite?: string | null;
  orgDescription?: string | null;
  // FCM push notification tokens
  fcmTokens?: string[];
}

interface AuthContextType {
  user: FirebaseUser | null;
  userData: UserData | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  usePresence(user?.uid);
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

      if (firebaseUser) {
        const unsubscribeDoc = onSnapshot(
          doc(db, 'users', firebaseUser.uid),
          (snapshot) => {
            if (snapshot.exists()) {
              setUserData(snapshot.data() as UserData);
            } else {
              setUserData(null);
            }
          },
          (error) => {
            handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
          }
        );
        return () => unsubscribeDoc();
      } else {
        setUserData(null);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Memoize the context value to avoid re-rendering every consumer
  // on every AuthProvider render (e.g. when unrelated parent state changes).
  const value = useMemo(() => ({ user, userData, loading }), [user, userData, loading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};