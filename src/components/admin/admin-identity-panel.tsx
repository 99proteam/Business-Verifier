"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  adminSetUserIdentityVerification,
  fetchIdentityProfilesForAdmin,
  UserIdentityProfileRecord,
} from "@/lib/firebase/repositories";

export function AdminIdentityPanel() {
  const { user } = useAuth();
  const [rows, setRows] = useState<UserIdentityProfileRecord[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchIdentityProfilesForAdmin());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load identity profiles.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      `${row.displayName} ${row.email} ${row.publicId}`.toLowerCase().includes(q),
    );
  }, [query, rows]);

  async function setVerification(row: UserIdentityProfileRecord, verified: boolean) {
    if (!user) return;
    setBusyUid(row.uid);
    setError(null);
    setInfo(null);
    try {
      await adminSetUserIdentityVerification({
        adminUid: user.uid,
        targetUid: row.uid,
        verified,
        note: verified ? "Verified by admin review." : "Verification removed by admin.",
      });
      setInfo(
        `${row.displayName} identity marked as ${verified ? "verified" : "not verified"}.`,
      );
      await load();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to update identity status.",
      );
    } finally {
      setBusyUid(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        Loading identity panel...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Identity Verification</h1>
        <p className="mt-2 text-sm text-muted">
          Partnership chats are allowed only when both participants have verified identity.
        </p>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, email, public ID..."
          className="mt-4 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
        />
      </div>

      {info && (
        <div className="rounded-2xl border border-brand/40 bg-brand/10 p-3 text-sm">{info}</div>
      )}
      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {!filtered.length && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          No users found.
        </div>
      )}

      {filtered.map((row) => (
        <article key={row.uid} className="glass rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{row.displayName}</h2>
            <span
              className={`rounded-full px-2 py-1 text-xs ${
                row.isIdentityVerified
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {row.isIdentityVerified ? "Verified" : "Pending"}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {row.email} | {row.publicId} | role {row.role}
          </p>
          <p className="mt-1 text-xs text-muted">
            Updated {new Date(row.updatedAt).toLocaleString()}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busyUid === row.uid || row.isIdentityVerified}
              onClick={() => void setVerification(row, true)}
              className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
            >
              Verify
            </button>
            <button
              type="button"
              disabled={busyUid === row.uid || !row.isIdentityVerified}
              onClick={() => void setVerification(row, false)}
              className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
            >
              Mark pending
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
