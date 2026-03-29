"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  FollowedBusinessRecord,
  fetchFollowedBusinessesByUser,
  toggleBusinessFollow,
} from "@/lib/firebase/repositories";

export function FollowedBusinessesDashboard() {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<FollowedBusinessRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
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
      setRows(await fetchFollowedBusinessesByUser(user.uid));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load followed businesses.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function unfollowBusiness(row: FollowedBusinessRecord) {
    if (!user) return;
    setBusyId(row.id);
    setError(null);
    setInfo(null);
    try {
      await toggleBusinessFollow({
        applicationId: row.id,
        followerUid: user.uid,
        followerName: user.displayName ?? "User",
        followerEmail: user.email ?? "",
      });
      setRows((prev) => prev.filter((item) => item.id !== row.id));
      setInfo(`Unfollowed ${row.businessName}.`);
    } catch (unfollowError) {
      setError(
        unfollowError instanceof Error ? unfollowError.message : "Unable to unfollow now.",
      );
    } finally {
      setBusyId(null);
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
        Loading followed businesses...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Following businesses</h1>
        <p className="mt-2 text-sm text-muted">
          Track businesses you follow and open support tickets quickly when needed.
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

      {!rows.length && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          You are not following any businesses yet.
          <div className="mt-3">
            <Link
              href="/directory"
              className="inline-flex rounded-xl border border-border px-3 py-2 text-xs transition hover:border-brand/40"
            >
              Explore directory
            </Link>
          </div>
        </div>
      )}

      {rows.map((row) => (
        <article key={row.id} className="glass rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{row.businessName}</h2>
            <span className="rounded-full bg-brand/10 px-2 py-1 text-xs text-brand-strong">
              Trust {row.trustScore}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            {row.city}, {row.country} | {row.category} | Followers {row.followersCount}
          </p>
          <p className="mt-1 text-xs text-muted">
            Followed on {new Date(row.followedAt).toLocaleString()}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void unfollowBusiness(row)}
              disabled={busyId === row.id}
              className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
            >
              {busyId === row.id ? "Updating..." : "Unfollow"}
            </button>
            <Link
              href={`/dashboard/tickets/new?business=${encodeURIComponent(row.businessName)}`}
              className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
            >
              Raise ticket
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
