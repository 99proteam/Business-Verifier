"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  adminAdjustWalletBalance,
  fetchAdminPayouts,
  fetchAdminWithdrawalRequests,
  fetchWithdrawalSettings,
  PayoutRecord,
  updateWithdrawalSettings,
  WithdrawalRequestRecord,
} from "@/lib/firebase/repositories";

export function AdminWalletPanel() {
  const { user, hasFirebaseConfig } = useAuth();
  const [requests, setRequests] = useState<WithdrawalRequestRecord[]>([]);
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [targetUid, setTargetUid] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("100");
  const [adjustMode, setAdjustMode] = useState<"credit" | "debit">("credit");
  const [adjustReason, setAdjustReason] = useState("");

  const [feePercent, setFeePercent] = useState("2");
  const [flatFee, setFlatFee] = useState("10");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [settings, rows] = await Promise.all([
        fetchWithdrawalSettings(),
        fetchAdminWithdrawalRequests(),
      ]);
      const payoutRows = await fetchAdminPayouts();
      setFeePercent(String(settings.withdrawalFeePercent));
      setFlatFee(String(settings.withdrawalFlatFee));
      setRequests(rows);
      setPayouts(payoutRows);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load admin wallet panel.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitAdjustment(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    const amount = Number(adjustAmount);
    if (!targetUid.trim() || amount <= 0 || !adjustReason.trim()) {
      setError("Target UID, amount, and reason are required.");
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await adminAdjustWalletBalance({
        adminUid: user.uid,
        targetUid: targetUid.trim(),
        amount,
        mode: adjustMode,
        reason: adjustReason.trim(),
      });
      setInfo("Wallet adjustment completed.");
      setAdjustReason("");
      await load();
    } catch (adjustError) {
      setError(
        adjustError instanceof Error
          ? adjustError.message
          : "Unable to adjust wallet right now.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveFees(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await updateWithdrawalSettings({
        adminUid: user.uid,
        feePercent: Number(feePercent),
        flatFee: Number(flatFee),
      });
      setInfo("Withdrawal settings updated.");
      await load();
    } catch (settingsError) {
      setError(
        settingsError instanceof Error
          ? settingsError.message
          : "Unable to update settings.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function reviewRequest(
    requestId: string,
    action: "approve" | "decline",
  ) {
    if (!user) return;
    const note = reviewNotes[requestId]?.trim() || (action === "approve" ? "Approved" : "Declined");
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/payouts/withdrawals/review", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          adminUid: user.uid,
          requestId,
          action,
          note,
        }),
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok || !payload.ok) {
        throw new Error(String(payload.error ?? "Unable to review request."));
      }
      setInfo(`Withdrawal request ${action}d.`);
      await load();
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "Unable to review withdrawal request.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function executePayout(requestId: string) {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/payouts/withdrawals/execute", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          requestId,
          adminUid: user.uid,
        }),
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok || !payload.ok) {
        throw new Error(String(payload.error ?? "Unable to execute payout."));
      }
      setInfo("Payout execution triggered.");
      await load();
    } catch (payoutError) {
      setError(
        payoutError instanceof Error ? payoutError.message : "Unable to execute payout.",
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
        Loading admin wallet panel...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Wallet Controls</h1>
        <p className="mt-2 text-sm text-muted">
          Adjust user balances, configure withdrawal charges, and review payout requests.
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

      <form onSubmit={submitAdjustment} className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Manual wallet add/debit</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            value={targetUid}
            onChange={(event) => setTargetUid(event.target.value)}
            placeholder="Target user UID"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={adjustAmount}
            onChange={(event) => setAdjustAmount(event.target.value)}
            placeholder="Amount"
            type="number"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <select
            value={adjustMode}
            onChange={(event) => setAdjustMode(event.target.value as "credit" | "debit")}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          >
            <option value="credit">Credit</option>
            <option value="debit">Debit</option>
          </select>
          <input
            value={adjustReason}
            onChange={(event) => setAdjustReason(event.target.value)}
            placeholder="Reason"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
        >
          Apply adjustment
        </button>
      </form>

      <form onSubmit={saveFees} className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Withdrawal charge settings</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            value={feePercent}
            onChange={(event) => setFeePercent(event.target.value)}
            type="number"
            placeholder="Fee percent"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={flatFee}
            onChange={(event) => setFlatFee(event.target.value)}
            type="number"
            placeholder="Flat fee INR"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-xl border border-border px-4 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
        >
          Save settings
        </button>
      </form>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Withdrawal requests</h2>
        <div className="mt-4 space-y-3">
          {!requests.length && <p className="text-sm text-muted">No requests found.</p>}
          {requests.map((row) => (
            <article key={row.id} className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-sm font-medium">
                {row.ownerEmail} | INR {row.amount} | Net INR {row.netAmount}
              </p>
              <p className="text-xs text-muted">
                Status {row.status} | {row.country} | {row.method}
              </p>
              <p className="text-xs text-muted">
                Payout status {row.payoutStatus ?? "n/a"}{" "}
                {row.payoutReference ? `| Ref ${row.payoutReference}` : ""}
              </p>
              <p className="mt-1 text-xs text-muted">
                {new Date(row.createdAt).toLocaleString()}
              </p>
              <textarea
                value={reviewNotes[row.id] ?? ""}
                onChange={(event) =>
                  setReviewNotes((prev) => ({ ...prev, [row.id]: event.target.value }))
                }
                rows={2}
                placeholder="Admin note / decline reason..."
                className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none"
              />
              {row.status === "pending" && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void reviewRequest(row.id, "approve")}
                    className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void reviewRequest(row.id, "decline")}
                    className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
                  >
                    Decline
                  </button>
                </div>
              )}
              {row.status === "approved" &&
                row.payoutStatus !== "success" &&
                row.payoutStatus !== "processing" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void executePayout(row.id)}
                    className="mt-2 rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
                  >
                    Execute payout now
                  </button>
                )}
            </article>
          ))}
        </div>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Payout log</h2>
        <div className="mt-4 space-y-2">
          {!payouts.length && <p className="text-sm text-muted">No payout records yet.</p>}
          {payouts.map((row) => (
            <article key={row.id} className="rounded-2xl border border-border bg-surface p-3 text-sm">
              <p>
                {row.ownerName} | INR {row.amount} | {row.status}
              </p>
              <p className="text-xs text-muted">
                {row.provider} | {row.providerPayoutId ?? "No provider ref"} |{" "}
                {new Date(row.createdAt).toLocaleString()}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
