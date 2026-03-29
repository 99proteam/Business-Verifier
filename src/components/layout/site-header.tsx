"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { NAV_LINKS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";

export function SiteHeader({ className }: { className?: string }) {
  const { user, signOut } = useAuth();

  return (
    <header className={cn("sticky top-3 z-40 px-4", className)}>
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between rounded-2xl border border-border bg-surface/95 px-4 py-3 backdrop-blur">
        <Link href="/" className="flex items-center gap-2">
          <span className="rounded-xl bg-brand/15 p-2 text-brand">
            <ShieldCheck size={18} />
          </span>
          <span className="font-semibold tracking-tight">Business Verifier</span>
        </Link>

        <nav className="hidden items-center gap-5 text-sm text-muted md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="rounded-xl border border-border px-3 py-2 text-sm transition hover:bg-brand/10"
              >
                Dashboard
              </Link>
              <button
                type="button"
                onClick={() => signOut()}
                className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/sign-in"
              className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
