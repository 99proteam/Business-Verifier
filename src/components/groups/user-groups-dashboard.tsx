"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  fetchGroupsCreatedByUser,
  fetchGroupsJoinedByUser,
  GroupRecord,
} from "@/lib/firebase/repositories";

export function UserGroupsDashboard() {
  const { user, hasFirebaseConfig } = useAuth();
  const [created, setCreated] = useState<GroupRecord[]>([]);
  const [joined, setJoined] = useState<GroupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [createdRows, joinedRows] = await Promise.all([
        fetchGroupsCreatedByUser(user.uid),
        fetchGroupsJoinedByUser(user.uid),
      ]);
      setCreated(createdRows);
      setJoined(joinedRows);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load your groups.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, user]);

  useEffect(() => {
    void load();
  }, [load]);

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
        Loading groups...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">My Groups</h1>
        <p className="mt-2 text-sm text-muted">
          See the groups you created and joined.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Created by you</h2>
        <div className="mt-3 space-y-2">
          {!created.length && <p className="text-sm text-muted">No created groups.</p>}
          {created.map((group) => (
            <article key={group.id} className="rounded-2xl border border-border bg-surface p-3">
              <p className="font-medium">{group.title}</p>
              <p className="text-xs text-muted">Members {group.membersCount}</p>
              <Link
                href={`/groups/${group.id}`}
                className="mt-2 inline-flex rounded-xl border border-border px-2 py-1 text-xs transition hover:border-brand/40"
              >
                Open group
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Joined groups</h2>
        <div className="mt-3 space-y-2">
          {!joined.length && <p className="text-sm text-muted">No joined groups.</p>}
          {joined.map((group) => (
            <article key={group.id} className="rounded-2xl border border-border bg-surface p-3">
              <p className="font-medium">{group.title}</p>
              <p className="text-xs text-muted">Owner {group.ownerName}</p>
              <Link
                href={`/groups/${group.id}`}
                className="mt-2 inline-flex rounded-xl border border-border px-2 py-1 text-xs transition hover:border-brand/40"
              >
                Open group
              </Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
