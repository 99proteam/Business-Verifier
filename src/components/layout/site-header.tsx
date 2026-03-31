"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, ShieldCheck, User, X } from "lucide-react";
import { NAV_LINKS, resolveRoleNavigation } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";

export function SiteHeader({ className }: { className?: string }) {
  const { user, signOut, role, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const links = user ? resolveRoleNavigation(role, isAdmin) : NAV_LINKS;

  return (
    <>
      <header className={cn("sticky top-3 z-40 px-4", className)}>
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between rounded-2xl border border-border bg-surface/95 px-4 py-3 backdrop-blur">
          <Link href="/" className="flex items-center gap-2">
            <span className="rounded-xl bg-accent p-2 text-brand">
              <ShieldCheck size={18} />
            </span>
            <span className="font-semibold tracking-tight">Business Verifier</span>
          </Link>

          <div className="flex items-center gap-2">
            {!user ? (
              <Link
                href="/sign-in"
                className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
              >
                Sign in
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm transition hover:bg-accent"
            >
              <Menu size={15} />
              Menu
            </button>
          </div>
        </div>
      </header>

      {open ? (
        <div className="fixed inset-0 z-[60] bg-black/25">
          <button
            type="button"
            aria-label="Close menu"
            className="h-full w-full"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute right-0 top-0 h-full w-full max-w-sm border-l border-border bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="inline-flex items-center gap-2 text-sm font-medium">
                <User size={14} />
                {user?.email ?? "Quick links"}
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-border p-2 transition hover:bg-accent"
              >
                <X size={14} />
              </button>
            </div>

            <div className="mt-4 max-h-[calc(100vh-120px)] space-y-1 overflow-y-auto pr-1">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg border border-transparent px-3 py-2 text-sm transition hover:border-border hover:bg-accent"
                >
                  {link.label}
                </Link>
              ))}
              {user ? (
                <Link
                  href="/onboarding/account-type"
                  onClick={() => setOpen(false)}
                  className="block rounded-lg border border-transparent px-3 py-2 text-sm transition hover:border-border hover:bg-accent"
                >
                  Switch account type
                </Link>
              ) : null}
            </div>

            {user ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  void signOut();
                }}
                className="mt-4 w-full rounded-lg border border-border px-3 py-2 text-left text-sm transition hover:bg-accent"
              >
                Sign out
              </button>
            ) : (
              <Link
                href="/sign-in"
                onClick={() => setOpen(false)}
                className="mt-4 block rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-accent"
              >
                Continue to sign in
              </Link>
            )}
          </aside>
        </div>
      ) : null}
    </>
  );
}

