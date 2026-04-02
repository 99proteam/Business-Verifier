"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  fetchCurrentUserIdentityProfile,
  fetchUserNotifications,
  markUserNotificationAsSpam,
  regenerateCurrentUserPublicId,
  UserNotificationRecord,
} from "@/lib/firebase/repositories";

export function UserNotificationCenter() {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<UserNotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState(false);
  const [publicId, setPublicId] = useState("");
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
      const [notifications, profile] = await Promise.all([
        fetchUserNotifications(user.uid),
        fetchCurrentUserIdentityProfile(user.uid),
      ]);
      setRows(notifications);
      setPublicId(profile.publicId);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load notifications.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markSpam(notificationId: string) {
    if (!user) return;
    setBusyId(notificationId);
    setError(null);
    setInfo(null);
    try {
      await markUserNotificationAsSpam(user.uid, notificationId);
      setInfo("Notification marked as spam.");
      await load();
    } catch (spamError) {
      setError(
        spamError instanceof Error
          ? spamError.message
          : "Unable to mark spam right now.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function regeneratePublicId() {
    if (!user) return;
    setRegeneratingId(true);
    setError(null);
    setInfo(null);
    try {
      const nextPublicId = await regenerateCurrentUserPublicId(user.uid);
      setPublicId(nextPublicId);
      setInfo(`Your notification ID was regenerated: ${nextPublicId}. Old ID is now revoked.`);
    } catch (regenError) {
      setError(
        regenError instanceof Error
          ? regenError.message
          : "Unable to regenerate notification ID.",
      );
    } finally {
      setRegeneratingId(false);
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
        Loading notifications...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Notification Center</h1>
        <p className="mt-2 text-sm text-muted">
          Receive offers, updates, general notices, and emergency alerts.
        </p>
        <div className="mt-3 rounded-xl border border-border bg-surface p-3">
          <p className="text-xs text-muted">Your unique notification ID</p>
          <p className="mt-1 text-sm font-semibold">{publicId || "Loading..."}</p>
          <p className="mt-1 text-xs text-muted">
            Share this ID with trusted systems to receive updates. Regenerating revokes old ID immediately.
          </p>
          <button
            type="button"
            onClick={() => void regeneratePublicId()}
            disabled={regeneratingId}
            className="mt-2 rounded-xl border border-border px-3 py-2 text-xs transition hover:border-brand/40 disabled:opacity-70"
          >
            {regeneratingId ? "Regenerating..." : "Regenerate ID"}
          </button>
        </div>
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
          No notifications yet.
        </div>
      )}

      {rows.map((row) => (
        <article key={row.id} className="glass rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{row.title}</p>
            <span className="text-xs uppercase text-muted">{row.category}</span>
          </div>
          <p className="mt-2 text-sm">{row.message}</p>
          <p className="mt-1 text-xs text-muted">
            {new Date(row.createdAt).toLocaleString()} | Endpoint {row.endpointId}
          </p>
          <button
            type="button"
            disabled={row.isSpam || busyId === row.id}
            onClick={() => void markSpam(row.id)}
            className="mt-3 rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
          >
            {row.isSpam ? "Marked as spam" : "Mark as spam"}
          </button>
        </article>
      ))}
    </div>
  );
}
