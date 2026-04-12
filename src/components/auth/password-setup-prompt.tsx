"use client";

import { FormEvent, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";

function mapPasswordSetupError(input: unknown) {
  const message =
    input instanceof Error ? input.message : "Unable to set password right now.";
  if (message.toLowerCase().includes("requires-recent-login")) {
    return "Please sign in again, then set your password.";
  }
  if (message.toLowerCase().includes("weak-password")) {
    return "Choose a stronger password (minimum 8 characters).";
  }
  return message;
}

export function PasswordSetupPrompt() {
  const {
    user,
    isLoading,
    needsPasswordSetup,
    isPasswordSetupPromptSkipped,
    setAccountPassword,
    skipPasswordSetupPrompt,
  } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const showPrompt = useMemo(
    () =>
      Boolean(
        !isLoading && user && needsPasswordSetup && !isPasswordSetupPromptSkipped,
      ),
    [isLoading, isPasswordSetupPromptSkipped, needsPasswordSetup, user],
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    const nextPassword = password.trim();
    if (nextPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (nextPassword !== confirmPassword.trim()) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await setAccountPassword(nextPassword);
      setPassword("");
      setConfirmPassword("");
      setInfo("Password setup completed. You can now use email + password login.");
    } catch (submitError) {
      setError(mapPasswordSetupError(submitError));
    } finally {
      setBusy(false);
    }
  }

  if (!showPrompt) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-white p-5 shadow-2xl">
        <h2 className="text-lg font-semibold tracking-tight">Set your password</h2>
        <p className="mt-1 text-sm text-muted">
          You signed in with Gmail. Add a password now so you can also log in with
          email + password.
        </p>

        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <label className="block space-y-1">
            <span className="text-xs text-muted">New password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
              placeholder="Minimum 8 characters"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted">Confirm password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
              placeholder="Re-enter password"
            />
          </label>
          {error && (
            <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
          {info && (
            <p className="rounded-lg border border-brand/40 bg-brand/10 px-3 py-2 text-xs">
              {info}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
            >
              {busy ? "Saving..." : "Set password"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={skipPasswordSetupPrompt}
              className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
            >
              Skip for now
            </button>
          </div>
        </form>
        <p className="mt-3 text-xs text-muted">
          You can set this later from Dashboard {">"} Security.
        </p>
      </div>
    </div>
  );
}

