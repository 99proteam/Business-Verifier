"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";

export function VerifyMfaPanel() {
  const { user, mfaRequired, isMfaVerified, completeMfaVerification } = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const params = useSearchParams();
  const router = useRouter();
  const returnUrl = params.get("returnUrl") || "/dashboard";

  useEffect(() => {
    if (!user) {
      router.replace(`/sign-in?returnUrl=${encodeURIComponent(returnUrl)}`);
      return;
    }
    if (!mfaRequired || isMfaVerified) {
      router.replace(returnUrl);
    }
  }, [isMfaVerified, mfaRequired, returnUrl, router, user]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    if (!code.trim()) {
      setError("Authenticator code is required.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await completeMfaVerification(code.trim());
      router.replace(returnUrl);
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : "Unable to verify authenticator code.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="glass mx-auto w-full max-w-md rounded-3xl p-7">
      <p className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-xs text-brand-strong">
        <ShieldCheck size={14} />
        Authenticator Check
      </p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Verify your login</h1>
      <p className="mt-2 text-sm text-muted">
        Enter 6-digit authenticator code or backup code to continue.
      </p>

      {error && (
        <p className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      <input
        value={code}
        onChange={(event) => setCode(event.target.value)}
        placeholder="123456 or ABCDE-12345"
        className="mt-5 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
      />
      <button
        type="submit"
        disabled={loading}
        className="mt-4 w-full rounded-xl bg-brand px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
      >
        {loading ? "Verifying..." : "Continue"}
      </button>
    </form>
  );
}
