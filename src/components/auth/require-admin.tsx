"use client";

import { useMemo } from "react";
import { useAuth } from "@/components/providers/auth-provider";

function getAdminEmails() {
  const raw = process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const adminEmails = useMemo(() => getAdminEmails(), []);
  const currentEmail = user?.email?.toLowerCase() ?? "";
  const isAdmin = adminEmails.includes(currentEmail);

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="glass rounded-2xl px-6 py-4 text-sm text-muted">
          Checking admin access...
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-danger/40 bg-danger/10 p-5 text-sm text-danger">
        Access denied. This module is only for admin accounts listed in
        `NEXT_PUBLIC_ADMIN_EMAILS`.
      </div>
    );
  }

  return <>{children}</>;
}
