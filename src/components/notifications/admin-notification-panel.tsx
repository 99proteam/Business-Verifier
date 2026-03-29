"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  adminUpdateEndpointStatus,
  fetchAdminNotificationEndpoints,
  fetchNotificationApiCharges,
  NotificationEndpointRecord,
  NotificationEndpointStatus,
  updateNotificationApiCharges,
} from "@/lib/firebase/repositories";

export function AdminNotificationPanel() {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<NotificationEndpointRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [monthlyBaseFee, setMonthlyBaseFee] = useState("99");
  const [per1000MessagesFee, setPer1000MessagesFee] = useState("25");

  const load = useCallback(async () => {
    if (!hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [endpoints, charges] = await Promise.all([
        fetchAdminNotificationEndpoints(),
        fetchNotificationApiCharges(),
      ]);
      setRows(endpoints);
      setMonthlyBaseFee(String(charges.monthlyBaseFee));
      setPer1000MessagesFee(String(charges.per1000MessagesFee));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load admin notifications panel.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(endpointId: string, status: NotificationEndpointStatus) {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await adminUpdateEndpointStatus({
        endpointId,
        adminUid: user.uid,
        status,
      });
      setInfo(`Endpoint updated to ${status}.`);
      await load();
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Unable to update endpoint status.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveCharges(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await updateNotificationApiCharges({
        adminUid: user.uid,
        monthlyBaseFee: Number(monthlyBaseFee),
        per1000MessagesFee: Number(per1000MessagesFee),
      });
      setInfo("Notification API charges updated.");
      await load();
    } catch (chargeError) {
      setError(
        chargeError instanceof Error
          ? chargeError.message
          : "Unable to update API charges.",
      );
    } finally {
      setBusy(false);
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
        Loading admin notification panel...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Notification Controls</h1>
        <p className="mt-2 text-sm text-muted">
          Review endpoint abuse signals, block/unblock senders, and configure API charges.
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

      <form onSubmit={saveCharges} className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Notification API charges</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <input
            value={monthlyBaseFee}
            onChange={(event) => setMonthlyBaseFee(event.target.value)}
            type="number"
            placeholder="Monthly base fee"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={per1000MessagesFee}
            onChange={(event) => setPer1000MessagesFee(event.target.value)}
            type="number"
            placeholder="Per 1000 messages fee"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
        >
          Save charges
        </button>
      </form>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Endpoints</h2>
        <div className="mt-4 space-y-3">
          {!rows.length && <p className="text-sm text-muted">No endpoints found.</p>}
          {rows.map((row) => (
            <article key={row.id} className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-sm font-medium">
                {row.label} | {row.ownerName}
              </p>
              <p className="text-xs text-muted">
                Status {row.status} | Sent {row.sentCount} | Spam reports {row.spamReports}
              </p>
              <p className="mt-1 text-xs text-muted">Endpoint ID: {row.id}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void setStatus(row.id, "active")}
                  className="rounded-xl border border-border px-3 py-2 text-xs transition hover:border-brand/40 disabled:opacity-70"
                >
                  Mark active
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void setStatus(row.id, "spam_review")}
                  className="rounded-xl border border-border px-3 py-2 text-xs transition hover:border-brand/40 disabled:opacity-70"
                >
                  Mark spam review
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void setStatus(row.id, "blocked")}
                  className="rounded-xl border border-danger/40 px-3 py-2 text-xs text-danger transition hover:bg-danger/10 disabled:opacity-70"
                >
                  Block endpoint
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
