"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  AuthenticatorEnrollmentDraft,
  AuthenticatorSettingsRecord,
  confirmAuthenticatorEnrollment,
  disableAuthenticatorForUser,
  fetchAuthenticatorSettings,
  fetchCurrentUserIdentityProfile,
  initiateAuthenticatorEnrollment,
  regenerateAuthenticatorBackupCodes,
  UserIdentityProfileRecord,
} from "@/lib/firebase/repositories";

export function SecuritySettings() {
  const {
    user,
    hasFirebaseConfig,
    needsPasswordSetup,
    setAccountPassword,
    refreshSecurityState,
  } = useAuth();
  const [identity, setIdentity] = useState<UserIdentityProfileRecord | null>(null);
  const [authenticator, setAuthenticator] = useState<AuthenticatorSettingsRecord | null>(null);
  const [draft, setDraft] = useState<AuthenticatorEnrollmentDraft | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [actionCode, setActionCode] = useState("");
  const [passwordValue, setPasswordValue] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordInfo, setPasswordInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [profile, settings] = await Promise.all([
        fetchCurrentUserIdentityProfile(user.uid),
        fetchAuthenticatorSettings(user.uid),
      ]);
      setIdentity(profile);
      setAuthenticator(settings);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load security settings.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function startEnrollment() {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const nextDraft = await initiateAuthenticatorEnrollment(user.uid);
      setDraft(nextDraft);
      setInfo("Authenticator setup key generated. Add it in your app and verify.");
      await load();
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "Unable to start authenticator setup.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnrollment(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await confirmAuthenticatorEnrollment({
        userUid: user.uid,
        code: verifyCode,
      });
      setDraft(null);
      setVerifyCode("");
      setInfo("Authenticator enabled.");
      await refreshSecurityState();
      await load();
    } catch (confirmError) {
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : "Unable to confirm authenticator setup.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function disableAuthenticator() {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await disableAuthenticatorForUser({
        userUid: user.uid,
        code: actionCode,
      });
      setActionCode("");
      setDraft(null);
      setInfo("Authenticator disabled.");
      await refreshSecurityState();
      await load();
    } catch (disableError) {
      setError(
        disableError instanceof Error
          ? disableError.message
          : "Unable to disable authenticator.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function regenerateBackupCodes() {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const nextCodes = await regenerateAuthenticatorBackupCodes({
        userUid: user.uid,
        code: actionCode,
      });
      setInfo(`Backup codes regenerated. New first code: ${nextCodes[0]}`);
      setActionCode("");
      await load();
    } catch (regenError) {
      setError(
        regenError instanceof Error
          ? regenError.message
          : "Unable to regenerate backup codes.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!hasFirebaseConfig) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        Firebase config missing in `.env.local`.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        Loading security settings...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Security Center</h1>
        <p className="mt-2 text-sm text-muted">
          Configure authenticator-based login protection and view identity verification status.
        </p>
        <p className="mt-3 text-xs text-muted">
          Identity status: {identity?.isIdentityVerified ? "Verified" : "Pending admin review"}
        </p>
      </div>

      {info && (
        <div className="rounded-2xl border border-brand/40 bg-brand/10 p-3 text-sm">{info}</div>
      )}
      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Login methods</h2>
        <p className="mt-1 text-sm text-muted">
          Add password login for this account. Gmail login will continue to work.
        </p>
        <p className="mt-2 text-xs text-muted">
          Current providers:{" "}
          {user?.providerData.length
            ? user.providerData.map((provider) => provider.providerId).join(", ")
            : "Not available"}
        </p>
        {needsPasswordSetup && (
          <p className="mt-2 rounded-xl border border-brand/35 bg-brand/10 px-3 py-2 text-xs">
            Password setup is pending for this account.
          </p>
        )}
        {passwordInfo && (
          <p className="mt-2 rounded-xl border border-brand/35 bg-brand/10 px-3 py-2 text-xs">
            {passwordInfo}
          </p>
        )}
        {passwordError && (
          <p className="mt-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {passwordError}
          </p>
        )}
        <form
          className="mt-4 grid gap-3 md:max-w-xl md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            setPasswordError(null);
            setPasswordInfo(null);
            const nextPassword = passwordValue.trim();
            if (nextPassword.length < 8) {
              setPasswordError("Password must be at least 8 characters.");
              return;
            }
            if (nextPassword !== passwordConfirm.trim()) {
              setPasswordError("Passwords do not match.");
              return;
            }
            setPasswordBusy(true);
            void setAccountPassword(nextPassword)
              .then(() => {
                setPasswordValue("");
                setPasswordConfirm("");
                setPasswordInfo("Password saved. Email + password login is ready.");
              })
              .catch((submitError: unknown) => {
                const message =
                  submitError instanceof Error
                    ? submitError.message
                    : "Unable to set password right now.";
                if (message.toLowerCase().includes("requires-recent-login")) {
                  setPasswordError("Sign in again, then retry password setup.");
                  return;
                }
                setPasswordError(message);
              })
              .finally(() => {
                setPasswordBusy(false);
              });
          }}
        >
          <label className="space-y-1">
            <span className="text-sm">New password</span>
            <input
              type="password"
              value={passwordValue}
              onChange={(event) => setPasswordValue(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
              placeholder="Minimum 8 characters"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm">Confirm password</span>
            <input
              type="password"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
              placeholder="Re-enter password"
            />
          </label>
          <button
            type="submit"
            disabled={passwordBusy}
            className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70 md:col-span-2 md:w-fit"
          >
            {passwordBusy ? "Saving password..." : "Save password"}
          </button>
        </form>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Authenticator MFA</h2>
        <p className="mt-1 text-sm text-muted">
          Status: {authenticator?.enabled ? "Enabled" : "Disabled"} | Backup codes remaining{" "}
          {authenticator?.backupCodesRemaining ?? 0}
        </p>

        {!authenticator?.enabled && (
          <div className="mt-4 space-y-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void startEnrollment()}
              className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
            >
              Generate setup key
            </button>

            {draft && (
              <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
                <p>Manual setup key:</p>
                <p className="mt-1 break-all font-mono text-xs">{draft.secret}</p>
                <p className="mt-3 text-xs text-muted">OTP URI</p>
                <p className="break-all font-mono text-xs">{draft.otpauthUri}</p>
                <p className="mt-3 text-xs text-muted">
                  Save backup codes now (you can use them once each):
                </p>
                <div className="mt-2 grid gap-1 text-xs">
                  {draft.backupCodes.map((code) => (
                    <p key={code} className="font-mono">
                      {code}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {draft && (
              <form onSubmit={confirmEnrollment} className="flex flex-wrap gap-2">
                <input
                  value={verifyCode}
                  onChange={(event) => setVerifyCode(event.target.value)}
                  placeholder="Enter 6-digit code"
                  className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
                >
                  Enable authenticator
                </button>
              </form>
            )}
          </div>
        )}

        {authenticator?.enabled && (
          <div className="mt-4 space-y-3">
            <input
              value={actionCode}
              onChange={(event) => setActionCode(event.target.value)}
              placeholder="Current 6-digit code or backup code"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void regenerateBackupCodes()}
                className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
              >
                Regenerate backup codes
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void disableAuthenticator()}
                className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
              >
                Disable authenticator
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
