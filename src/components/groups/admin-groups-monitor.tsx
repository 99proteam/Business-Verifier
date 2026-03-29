"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchAdminGroupsOverview, GroupRecord } from "@/lib/firebase/repositories";

export function AdminGroupsMonitor() {
  const [rows, setRows] = useState<GroupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        setRows(await fetchAdminGroupsOverview());
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load group overview.",
        );
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        Loading groups...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Group Monitor</h1>
        <p className="mt-2 text-sm text-muted">
          Review groups, verify messaging mode, and inspect community activity.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {rows.map((group) => (
        <article key={group.id} className="glass rounded-2xl p-5">
          <h2 className="text-lg font-semibold tracking-tight">{group.title}</h2>
          <p className="mt-1 text-sm text-muted">{group.description}</p>
          <p className="mt-2 text-xs text-muted">
            Owner {group.ownerName} | Members {group.membersCount} |{" "}
            {group.adminOnlyMessaging ? "Admin-only chat" : "Public chat"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/groups/${group.id}`}
              className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40"
            >
              Open public thread
            </Link>
            <Link
              href={`/dashboard/admin/groups/${group.id}`}
              className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
            >
              Open admin thread
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
