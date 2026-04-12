"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";

const trustPoints = [
  { icon: ShieldCheck, text: "Verified businesses you can trust" },
  { icon: BadgeCheck, text: "Digital trust certificates" },
  { icon: Users, text: "Secure escrow-protected orders" },
  { icon: Building2, text: "Transparent dispute resolution" },
];

export function SignInPanel() {
  const { signInWithGoogle, signInWithEmailPassword, hasFirebaseConfig } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const params = useSearchParams();
  const router = useRouter();
  const returnUrl = params.get("returnUrl") || "/dashboard";

  return (
    <div className="flex min-h-[calc(100vh-80px)]">
      <div className="relative hidden flex-col overflow-hidden bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 p-12 lg:flex lg:w-1/2">
        <div className="pointer-events-none absolute -right-32 -top-32 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-teal-400/8 blur-3xl" />

        <div className="relative flex h-full flex-col">
          <Link href="/" className="flex w-fit items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white">
              <ShieldCheck size={20} strokeWidth={2.5} />
            </span>
            <span className="text-lg font-bold text-white">
              Business<span className="text-emerald-400">Verifier</span>
            </span>
          </Link>

          <div className="mb-auto mt-auto pt-16">
            <h2 className="text-3xl font-bold leading-tight text-white">
              Your trusted platform for
              <br />
              <span className="text-emerald-400">verified businesses</span>
            </h2>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
              Sign in to access your secure workspace. Manage verifications,
              orders, disputes, and everything in between.
            </p>

            <ul className="mt-8 space-y-3">
              {trustPoints.map((point) => {
                const Icon = point.icon;
                return (
                  <li
                    key={point.text}
                    className="flex items-center gap-3 text-sm text-slate-300"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                      <Icon size={14} />
                    </span>
                    {point.text}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 size={13} className="text-emerald-500" />
            All data secured with enterprise-grade encryption
          </div>
        </div>
      </div>

      <div className="flex w-full items-center justify-center bg-background px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white">
              <ShieldCheck size={18} />
            </span>
            <span className="font-bold text-foreground">
              Business<span className="text-brand">Verifier</span>
            </span>
          </div>

          <div className="rounded-2xl border border-border bg-white p-8 shadow-lg">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand-strong">
              <ShieldCheck size={13} />
              Secure Authentication
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Welcome back
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Sign in with Gmail or with your email and password. New users will
              be guided through account setup after sign-in.
            </p>

            {!hasFirebaseConfig && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3">
                <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-danger/20">
                  <span className="text-[10px] font-bold text-danger">!</span>
                </div>
                <p className="text-xs text-danger">
                  Firebase environment variables are missing. Copy values into{" "}
                  <code className="font-mono">.env.local</code>.
                </p>
              </div>
            )}

            {error && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3">
                <p className="text-xs text-danger">{error}</p>
              </div>
            )}

            <button
              type="button"
              disabled={loading || emailLoading || !hasFirebaseConfig}
              onClick={async () => {
                setLoading(true);
                setError(null);
                try {
                  await signInWithGoogle();
                  router.push(
                    `/onboarding/account-type?returnUrl=${encodeURIComponent(returnUrl)}`,
                  );
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
              className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl bg-brand px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-strong hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <Mail size={16} />
              )}
              {loading ? "Signing in..." : "Continue with Gmail"}
              {!loading && <ArrowRight size={15} className="ml-auto" />}
            </button>

            <div className="mt-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[11px] uppercase tracking-wide text-muted">
                or
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <form
              className="mt-4 space-y-2.5"
              onSubmit={async (event) => {
                event.preventDefault();
                setError(null);
                setEmailLoading(true);
                try {
                  await signInWithEmailPassword(email, password);
                  router.push(returnUrl);
                } catch (signInError) {
                  setError(
                    signInError instanceof Error
                      ? signInError.message
                      : "Unable to sign in with email/password right now.",
                  );
                } finally {
                  setEmailLoading(false);
                }
              }}
            >
              <label className="block space-y-1">
                <span className="text-xs text-muted">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter password"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
                />
              </label>
              <button
                type="submit"
                disabled={emailLoading || loading || !hasFirebaseConfig}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium transition hover:border-brand/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {emailLoading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />
                ) : (
                  <LockKeyhole size={15} />
                )}
                {emailLoading ? "Signing in..." : "Continue with Email + Password"}
              </button>
            </form>

            <div className="mt-5 space-y-2">
              {[
                "Use Gmail sign-in or email/password login",
                "Google users can add password after sign-in",
                "MFA-protected for sensitive operations",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 text-xs text-muted">
                  <CheckCircle2 size={12} className="shrink-0 text-brand" />
                  {item}
                </div>
              ))}
            </div>

            <p className="mt-5 border-t border-border pt-4 text-center text-xs text-muted">
              Forgot your password?{" "}
              <Link
                href="/forgot-password"
                className="font-medium text-brand hover:underline underline-offset-2"
              >
                Reset password
              </Link>
            </p>

            <div className="mt-3 rounded-xl border border-border bg-slate-50 px-3 py-2 text-xs text-muted">
              Admin access: sign in with your admin email, then open{" "}
              <Link href="/admin" className="text-brand underline underline-offset-2">
                /admin
              </Link>
              .
            </div>
          </div>

          <p className="mt-5 text-center text-xs text-muted">
            <Link href="/" className="inline-flex items-center gap-1 transition hover:text-brand">
              {"<-"} Back to homepage
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

