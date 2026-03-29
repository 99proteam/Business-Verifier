"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mail, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";

export function SignInPanel() {
  const { signInWithGoogle, hasFirebaseConfig } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const params = useSearchParams();
  const router = useRouter();
  const returnUrl = params.get("returnUrl") || "/dashboard";

  return (
    <div className="glass mx-auto w-full max-w-md rounded-3xl p-7">
      <p className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-xs text-brand-strong">
        <ShieldCheck size={14} />
        Secure Google Sign-in
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-sm text-muted">
        To access sensitive business and support data, all users sign in with Gmail.
        Accounts with authenticator enabled will be asked for MFA code after sign-in.
      </p>

      {!hasFirebaseConfig && (
        <p className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          Firebase environment variables are missing. Copy values into `.env.local`.
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={loading || !hasFirebaseConfig}
        onClick={async () => {
          setLoading(true);
          setError(null);
          try {
            await signInWithGoogle();
            router.push(returnUrl);
          } catch (signInError) {
            setError(
              signInError instanceof Error
                ? signInError.message
                : "Unable to sign in right now.",
            );
          } finally {
            setLoading(false);
          }
        }}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-70"
      >
        <Mail size={16} />
        {loading ? "Signing in..." : "Continue with Gmail"}
      </button>
      <p className="mt-4 text-center text-xs text-muted">
        Need password recovery for legacy email-password accounts?{" "}
        <Link href="/forgot-password" className="text-brand-strong underline-offset-2 hover:underline">
          Reset password
        </Link>
      </p>
    </div>
  );
}
