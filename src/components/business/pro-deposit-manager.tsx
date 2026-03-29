"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  BusinessTrustBadgeRecord,
  ProDepositLedgerRecord,
  businessTopUpProDeposit,
  businessWithdrawAvailableProDeposit,
  fetchOwnedBusinessTrustBadge,
  fetchProDepositLedgerByOwner,
  releaseMaturedProDeposits,
} from "@/lib/firebase/repositories";

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function ProDepositManager() {
  const { user, hasFirebaseConfig } = useAuth();
  const [badge, setBadge] = useState<BusinessTrustBadgeRecord | null>(null);
  const [ledger, setLedger] = useState<ProDepositLedgerRecord[]>([]);
  const [topupAmount, setTopupAmount] = useState("5000");
  const [lockMonths, setLockMonths] = useState("6");
  const [withdrawAmount, setWithdrawAmount] = useState("1000");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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
      const [badgeRow, ledgerRows] = await Promise.all([
        fetchOwnedBusinessTrustBadge(user.uid),
        fetchProDepositLedgerByOwner(user.uid),
      ]);
      setBadge(badgeRow);
      setLedger(ledgerRows);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load deposit manager.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onTopup(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setInfo(null);
    setError(null);
    try {
      await businessTopUpProDeposit({
        ownerUid: user.uid,
        ownerName: user.displayName ?? "Business",
        amount: Number(topupAmount),
        lockMonths: Number(lockMonths),
      });
      setInfo("Pro deposit locked successfully.");
      await load();
    } catch (topupError) {
      setError(
        topupError instanceof Error ? topupError.message : "Unable to top up deposit.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onWithdraw(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setInfo(null);
    setError(null);
    try {
      await businessWithdrawAvailableProDeposit({
        ownerUid: user.uid,
        ownerName: user.displayName ?? "Business",
        amount: Number(withdrawAmount),
      });
      setInfo("Available deposit withdrawn to wallet.");
      await load();
    } catch (withdrawError) {
      setError(
        withdrawError instanceof Error
          ? withdrawError.message
          : "Unable to withdraw available deposit.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function releaseDue() {
    if (!user) return;
    setBusy(true);
    setInfo(null);
    setError(null);
    try {
      const result = await releaseMaturedProDeposits({
        actorUid: user.uid,
        actorRole: "business",
      });
      setInfo(
        `Checked ${result.checked} entries and released ${result.released} matured deposits.`,
      );
      await load();
    } catch (releaseError) {
      setError(
        releaseError instanceof Error
          ? releaseError.message
          : "Unable to process matured deposits.",
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
        Loading Pro deposit manager...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Pro deposit and trust badge</h1>
        <p className="mt-2 text-sm text-muted">
          Manage deposit lock lifecycle and publish your public trust badge widget.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <article className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Locked deposit</p>
            <p className="mt-1 text-lg font-semibold">
              {formatINR(badge?.totalLockedDeposit ?? 0)}
            </p>
          </article>
          <article className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Available deposit</p>
            <p className="mt-1 text-lg font-semibold">
              {formatINR(badge?.totalAvailableDeposit ?? 0)}
            </p>
          </article>
          <article className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Trust score</p>
            <p className="mt-1 text-lg font-semibold">{badge?.trustScore ?? "-"}</p>
          </article>
        </div>
      </section>

      {info && (
        <div className="rounded-2xl border border-brand/40 bg-brand/10 p-3 text-sm">{info}</div>
      )}
      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {badge?.trustBadgeCode && (
        <section className="glass rounded-3xl p-6">
          <h2 className="text-lg font-semibold tracking-tight">Trust badge widget code</h2>
          <textarea
            value={badge.trustBadgeCode}
            readOnly
            rows={4}
            className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs outline-none"
          />
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={onTopup} className="glass rounded-3xl p-6">
          <h2 className="text-lg font-semibold tracking-tight">Lock new deposit amount</h2>
          <div className="mt-3 grid gap-3">
            <input
              type="number"
              value={topupAmount}
              onChange={(event) => setTopupAmount(event.target.value)}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
              placeholder="Amount INR"
            />
            <input
              type="number"
              value={lockMonths}
              onChange={(event) => setLockMonths(event.target.value)}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
              placeholder="Lock months"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
          >
            {busy ? "Processing..." : "Top up deposit"}
          </button>
        </form>

        <form onSubmit={onWithdraw} className="glass rounded-3xl p-6">
          <h2 className="text-lg font-semibold tracking-tight">Withdraw available deposit</h2>
          <input
            type="number"
            value={withdrawAmount}
            onChange={(event) => setWithdrawAmount(event.target.value)}
            className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
            placeholder="Amount INR"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
            >
              {busy ? "Processing..." : "Withdraw"}
            </button>
            <button
              type="button"
              onClick={() => void releaseDue()}
              disabled={busy}
              className="rounded-xl border border-border px-4 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
            >
              Refresh matured locks
            </button>
          </div>
        </form>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Deposit ledger timeline</h2>
        <div className="mt-4 space-y-3">
          {!ledger.length && (
            <p className="rounded-2xl border border-border bg-surface p-3 text-sm text-muted">
              No deposit entries available yet.
            </p>
          )}
          {ledger.map((entry) => (
            <article key={entry.id} className="rounded-2xl border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {formatINR(entry.amount)} | {entry.source.replaceAll("_", " ")}
                </p>
                <span className="rounded-full border border-border px-2 py-1 text-xs uppercase">
                  {entry.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Created {new Date(entry.createdAt).toLocaleString()}
                {entry.lockUntil &&
                  ` | Lock until ${new Date(entry.lockUntil).toLocaleDateString()}`}
              </p>
              {entry.note && <p className="mt-1 text-xs text-muted">{entry.note}</p>}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
