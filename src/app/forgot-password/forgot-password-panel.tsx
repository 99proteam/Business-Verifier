"use client";

import { FormEvent, useState } from "react";
import { KeyRound } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";

export function ForgotPasswordPanel() {
  const { hasFirebaseConfig, requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setInfo(null);
    setError(null);
    try {
      await requestPasswordReset(email);
      setInfo(
        "If this email has a password account, a reset link has been sent. Gmail sign-in users can continue with Google sign-in.",
      );
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "Unable to send reset link right now.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="glass mx-auto w-full max-w-md rounded-3xl p-7">
      <p className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-xs text-brand-strong">
        <KeyRound size={14} />
        Account Recovery
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Forgot password</h1>
      <p className="mt-2 text-sm text-muted">
        Enter your email to receive a reset link. For standard platform access, continue
        using Gmail sign-in.
      </p>

      {!hasFirebaseConfig && (
        <p className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          Firebase environment variables are missing. Copy values into `.env.local`.
        </p>
      )}

      {info && (
        <p className="mt-4 rounded-xl border border-brand/40 bg-brand/10 px-3 py-2 text-xs">
          {info}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      <label className="mt-6 block space-y-1">
        <span className="text-sm">Email</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
        />
      </label>

      <button
        type="submit"
        disabled={busy || !hasFirebaseConfig}
        className="mt-6 flex w-full items-center justify-center rounded-xl bg-brand px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-70"
      >
        {busy ? "Sending..." : "Send reset link"}
      </button>
    </form>
  );
}
