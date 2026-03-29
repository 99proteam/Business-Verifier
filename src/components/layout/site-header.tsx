"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, ShieldCheck, User } from "lucide-react";
import { NAV_LINKS, PROFILE_LINKS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";

export function SiteHeader({ className }: { className?: string }) {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!containerRef.current || !target) return;
      if (containerRef.current.contains(target)) return;
      setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  return (
    <header className={cn("sticky top-3 z-40 px-4", className)}>
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between rounded-2xl border border-border bg-surface/95 px-4 py-3 backdrop-blur">
        <Link href="/" className="flex items-center gap-2">
          <span className="rounded-xl bg-accent p-2 text-brand">
            <ShieldCheck size={18} />
          </span>
          <span className="font-semibold tracking-tight">Business Verifier</span>
        </Link>

        <div ref={containerRef} className="relative flex items-center gap-2">
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
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm transition hover:bg-accent"
          >
            <User size={15} />
            Profile
            <Menu size={15} />
          </button>
          {open ? (
            <div className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-border bg-white p-2 shadow-xl">
              <p className="px-2 py-1 text-xs font-medium text-muted">
                {user?.email ?? "Quick links"}
              </p>
              <div className="mt-1">
                {(user ? PROFILE_LINKS : NAV_LINKS).map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-2 py-2 text-sm transition hover:bg-accent"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
              {user ? (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    void signOut();
                  }}
                  className="mt-2 w-full rounded-lg border border-border px-2 py-2 text-left text-sm transition hover:bg-accent"
                >
                  Sign out
                </button>
              ) : (
                <Link
                  href="/sign-in"
                  onClick={() => setOpen(false)}
                  className="mt-2 block rounded-lg border border-border px-2 py-2 text-sm transition hover:bg-accent"
                >
                  Continue to sign in
                </Link>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
