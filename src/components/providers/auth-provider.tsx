"use client";

import {
  User,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updatePassword,
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
  fetchCurrentUserNavigationContext,
  verifyAuthenticatorChallenge,
} from "@/lib/firebase/repositories";

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  mfaRequired: boolean;
  isMfaVerified: boolean;
  role: string;
  roleSelectionCompleted: boolean;
  isAdmin: boolean;
  hasFirebaseConfig: boolean;
  needsPasswordSetup: boolean;
  isPasswordSetupPromptSkipped: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmailPassword: (email: string, password: string) => Promise<void>;
  setAccountPassword: (password: string) => Promise<void>;
  skipPasswordSetupPrompt: () => void;
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
  const [role, setRole] = useState("customer");
  const [roleSelectionCompleted, setRoleSelectionCompleted] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const [isPasswordSetupPromptSkipped, setIsPasswordSetupPromptSkipped] =
    useState(false);

  const passwordPromptSkipKey = useCallback(
    (uid: string) => `bv_pw_prompt_skip_${uid}`,
    [],
  );

  const syncMfaState = useCallback(async (nextUser: User | null) => {
    if (!nextUser || !auth) {
      setMfaRequired(false);
      setIsMfaVerified(false);
      setRole("customer");
      setRoleSelectionCompleted(false);
      setIsAdmin(false);
      setNeedsPasswordSetup(false);
      setIsPasswordSetupPromptSkipped(false);
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
          const nav = await fetchCurrentUserNavigationContext(currentUser.uid);
          setRole(nav.role);
          setRoleSelectionCompleted(nav.roleSelectionCompleted);
          setIsAdmin(nav.isAdmin);
          const hasGoogleProvider = currentUser.providerData.some(
            (provider) => provider.providerId === "google.com",
          );
          const hasPasswordProvider = currentUser.providerData.some(
            (provider) => provider.providerId === "password",
          );
          const shouldPromptPasswordSetup =
            hasGoogleProvider && !hasPasswordProvider;
          setNeedsPasswordSetup(shouldPromptPasswordSetup);
          const skippedInSession =
            shouldPromptPasswordSetup && typeof window !== "undefined"
              ? window.sessionStorage.getItem(
                  passwordPromptSkipKey(currentUser.uid),
                ) === "1"
              : false;
          setIsPasswordSetupPromptSkipped(skippedInSession);
        } else {
          setMfaRequired(false);
          setIsMfaVerified(false);
          setRole("customer");
          setRoleSelectionCompleted(false);
          setIsAdmin(false);
          setNeedsPasswordSetup(false);
          setIsPasswordSetupPromptSkipped(false);
        }
        setIsLoading(false);
      })().catch(() => {
        setIsLoading(false);
      });
    });

    return unsubscribe;
  }, [passwordPromptSkipKey, syncMfaState]);

  const signInWithGoogle = useCallback(async () => {
    if (!auth) {
      throw new Error(
        "Firebase config missing. Add NEXT_PUBLIC_FIREBASE_* env vars first.",
      );
    }
    await signInWithPopup(auth, googleProvider);
  }, []);

  const signInWithEmailPassword = useCallback(
    async (email: string, password: string) => {
      if (!auth) {
        throw new Error(
          "Firebase config missing. Add NEXT_PUBLIC_FIREBASE_* env vars first.",
        );
      }
      const cleanEmail = email.trim();
      if (!cleanEmail || !password.trim()) {
        throw new Error("Email and password are required.");
      }
      await signInWithEmailAndPassword(auth, cleanEmail, password);
    },
    [],
  );

  const setAccountPassword = useCallback(
    async (password: string) => {
      if (!auth || !auth.currentUser) {
        throw new Error("Sign in first.");
      }
      const nextPassword = password.trim();
      if (nextPassword.length < 8) {
        throw new Error("Password must be at least 8 characters.");
      }
      await updatePassword(auth.currentUser, nextPassword);
      await auth.currentUser.reload();
      setNeedsPasswordSetup(false);
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(
          passwordPromptSkipKey(auth.currentUser.uid),
        );
      }
      setIsPasswordSetupPromptSkipped(false);
    },
    [passwordPromptSkipKey],
  );

  const skipPasswordSetupPrompt = useCallback(() => {
    if (!user) return;
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(passwordPromptSkipKey(user.uid), "1");
    }
    setIsPasswordSetupPromptSkipped(true);
  }, [passwordPromptSkipKey, user]);

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
      window.sessionStorage.removeItem(passwordPromptSkipKey(user.uid));
    }
    setMfaRequired(false);
    setIsMfaVerified(false);
    setNeedsPasswordSetup(false);
    setIsPasswordSetupPromptSkipped(false);
    await firebaseSignOut(auth);
  }, [passwordPromptSkipKey, user]);

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
      role,
      roleSelectionCompleted,
      isAdmin,
      hasFirebaseConfig: Boolean(auth),
      needsPasswordSetup,
      isPasswordSetupPromptSkipped,
      signInWithGoogle,
      signInWithEmailPassword,
      setAccountPassword,
      skipPasswordSetupPrompt,
      requestPasswordReset,
      completeMfaVerification,
      refreshSecurityState,
      signOut,
    }),
    [
      completeMfaVerification,
        isLoading,
        isMfaVerified,
        isAdmin,
      isPasswordSetupPromptSkipped,
        mfaRequired,
      needsPasswordSetup,
        requestPasswordReset,
        role,
        roleSelectionCompleted,
        refreshSecurityState,
      setAccountPassword,
      signInWithEmailPassword,
      signInWithGoogle,
      signOut,
      skipPasswordSetupPrompt,
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
