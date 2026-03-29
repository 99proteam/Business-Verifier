"use client";

import {
  User,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { auth, googleProvider } from "@/lib/firebase/client";
import {
  ensureUserProfile,
  fetchAuthenticatorSettings,
  verifyAuthenticatorChallenge,
} from "@/lib/firebase/repositories";

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  mfaRequired: boolean;
  isMfaVerified: boolean;
  hasFirebaseConfig: boolean;
  signInWithGoogle: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  completeMfaVerification: (code: string) => Promise<void>;
  refreshSecurityState: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(auth));
  const [mfaRequired, setMfaRequired] = useState(false);
  const [isMfaVerified, setIsMfaVerified] = useState(false);

  const syncMfaState = useCallback(async (nextUser: User | null) => {
    if (!nextUser || !auth) {
      setMfaRequired(false);
      setIsMfaVerified(false);
      return;
    }
    const settings = await fetchAuthenticatorSettings(nextUser.uid);
    const required = settings.enabled;
    setMfaRequired(required);
    if (!required) {
      setIsMfaVerified(true);
      return;
    }
    const key = `bv_mfa_verified_${nextUser.uid}`;
    const cached = typeof window !== "undefined" ? window.sessionStorage.getItem(key) : null;
    setIsMfaVerified(cached === "1");
  }, []);

  useEffect(() => {
    if (!auth) return;

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      void (async () => {
        setIsLoading(true);
        setUser(currentUser);
        if (currentUser) {
          await ensureUserProfile(currentUser);
          await syncMfaState(currentUser);
        } else {
          setMfaRequired(false);
          setIsMfaVerified(false);
        }
        setIsLoading(false);
      })().catch(() => {
        setIsLoading(false);
      });
    });

    return unsubscribe;
  }, [syncMfaState]);

  const signInWithGoogle = useCallback(async () => {
    if (!auth) {
      throw new Error(
        "Firebase config missing. Add NEXT_PUBLIC_FIREBASE_* env vars first.",
      );
    }
    await signInWithPopup(auth, googleProvider);
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!auth) {
      throw new Error(
        "Firebase config missing. Add NEXT_PUBLIC_FIREBASE_* env vars first.",
      );
    }
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      throw new Error("Email is required.");
    }
    await sendPasswordResetEmail(auth, cleanEmail);
  }, []);

  const signOut = useCallback(async () => {
    if (!auth) return;
    if (user && typeof window !== "undefined") {
      window.sessionStorage.removeItem(`bv_mfa_verified_${user.uid}`);
    }
    setMfaRequired(false);
    setIsMfaVerified(false);
    await firebaseSignOut(auth);
  }, [user]);

  const completeMfaVerification = useCallback(
    async (code: string) => {
      if (!user) {
        throw new Error("Sign in first.");
      }
      const ok = await verifyAuthenticatorChallenge({
        userUid: user.uid,
        code,
      });
      if (!ok) {
        throw new Error("Invalid authenticator or backup code.");
      }
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(`bv_mfa_verified_${user.uid}`, "1");
      }
      setIsMfaVerified(true);
    },
    [user],
  );

  const refreshSecurityState = useCallback(async () => {
    await syncMfaState(user);
  }, [syncMfaState, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      mfaRequired,
      isMfaVerified,
      hasFirebaseConfig: Boolean(auth),
      signInWithGoogle,
      requestPasswordReset,
      completeMfaVerification,
      refreshSecurityState,
      signOut,
    }),
    [
      completeMfaVerification,
      isLoading,
      isMfaVerified,
      mfaRequired,
      requestPasswordReset,
      refreshSecurityState,
      signInWithGoogle,
      signOut,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
