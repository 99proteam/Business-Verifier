"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, ChevronDown, LogOut, Menu, ShieldCheck, User, X } from "lucide-react";
import { NAV_LINKS, resolveRoleNavigation } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";

const publicNavLinks = [
  { label: "Directory", href: "/directory" },
  { label: "Products", href: "/products" },
  { label: "Groups", href: "/groups" },
  { label: "Pricing", href: "/pricing" },
];

export function SiteHeader({ className }: { className?: string }) {
  const { user, signOut, role, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const navLinks = user ? resolveRoleNavigation(role, isAdmin) : NAV_LINKS;
  const desktopNavLinks = user ? navLinks.slice(0, 4) : publicNavLinks;

  const roleLabel = isAdmin
    ? "Admin"
    : role === "business_owner"
      ? "Business"
      : role === "employee"
        ? "Employee"
        : "Customer";

  const roleBadgeColor = isAdmin
    ? "bg-purple-100 text-purple-700"
    : role === "business_owner"
      ? "bg-blue-100 text-blue-700"
      : role === "employee"
        ? "bg-amber-100 text-amber-700"
        : "bg-emerald-100 text-emerald-700";

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-40 transition-all duration-200",
          scrolled ? "py-0" : "py-3 px-4",
          className,
        )}
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-6xl items-center justify-between transition-all duration-200",
            scrolled
              ? "rounded-none border-b border-border bg-white/95 backdrop-blur px-6 py-3 shadow-sm"
              : "rounded-2xl border border-border bg-white/95 backdrop-blur px-5 py-3 shadow-md",
          )}
        >
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white shadow-sm transition group-hover:shadow-md group-hover:scale-105">
              <ShieldCheck size={18} strokeWidth={2.5} />
            </span>
            <span className="font-bold text-foreground tracking-tight text-sm md:text-base">
              Business<span className="text-brand">Verifier</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {desktopNavLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-3 py-2 rounded-lg text-sm font-medium text-muted hover:text-foreground hover:bg-slate-50 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Link
                  href="/dashboard/notifications"
                  className="hidden md:flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted hover:text-foreground hover:bg-slate-50 transition"
                >
                  <Bell size={15} />
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="hidden md:flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium transition hover:bg-slate-50"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/10 text-brand">
                    <User size={13} />
                  </span>
                  <span className="max-w-[120px] truncate text-xs">{user.displayName ?? user.email}</span>
                  <span className={cn("hidden lg:inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold", roleBadgeColor)}>
                    {roleLabel}
                  </span>
                  <ChevronDown size={13} className="text-muted" />
                </button>
              </>
            ) : (
              <Link
                href="/sign-in"
                className="hidden md:inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-strong hover:shadow-md"
              >
                Sign in
              </Link>
            )}

            {/* Mobile menu button */}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex md:hidden items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm transition hover:bg-slate-50"
            >
              <Menu size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Drawer */}
      {open && (
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute right-0 top-0 h-full w-full max-w-xs bg-white shadow-2xl flex flex-col">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-white">
                  <ShieldCheck size={16} />
                </span>
                <span className="font-bold text-sm">BusinessVerifier</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition hover:bg-slate-50"
              >
                <X size={15} />
              </button>
            </div>

            {/* User info */}
            {user && (
              <div className="px-5 py-4 border-b border-border bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 text-brand font-semibold text-sm">
                    {(user.displayName ?? user.email ?? "U")[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{user.displayName ?? "User"}</p>
                    <p className="text-xs text-muted truncate">{user.email}</p>
                  </div>
                </div>
                <span className={cn("mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", roleBadgeColor)}>
                  {roleLabel}
                </span>
              </div>
            )}

            {/* Nav links */}
            <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
              {navLinks.slice(0, 20).map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-brand/5 hover:text-brand"
                >
                  {link.label}
                </Link>
              ))}
              {user && (
                <Link
                  href="/onboarding/account-type"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition hover:bg-slate-50"
                >
                  Switch account type
                </Link>
              )}
            </nav>

            {/* Footer actions */}
            <div className="p-4 border-t border-border space-y-2">
              {!user ? (
                <Link
                  href="/sign-in"
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong"
                >
                  Sign in to your account
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    void signOut();
                  }}
                  className="flex w-full items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted transition hover:bg-slate-50 hover:text-danger"
                >
                  <LogOut size={15} />
                  Sign out
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
