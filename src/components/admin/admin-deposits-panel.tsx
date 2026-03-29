"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  BusinessApplicationRecord,
  adminForfeitBusinessDeposit,
  fetchBusinessApplications,
  releaseMaturedProDeposits,
} from "@/lib/firebase/repositories";

export function AdminDepositsPanel() {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<BusinessApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [businessId, setBusinessId] = useState("");
  const [amount, setAmount] = useState("1000");
  const [note, setNote] = useState("Fraud resolution adjustment");

  const load = useCallback(async () => {
    if (!hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const approved = await fetchBusinessApplications("approved");
      const proBusinesses = approved.filter((row) => row.wantsProPlan);
      setRows(proBusinesses);
      if (!businessId && proBusinesses.length) {
        setBusinessId(proBusinesses[0].id);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load pro businesses.",
      );
    } finally {
      setLoading(false);
    }
  }, [businessId, hasFirebaseConfig]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedBusiness = useMemo(
    () => rows.find((row) => row.id === businessId) ?? null,
    [businessId, rows],
  );

  async function runReleaseDue() {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await releaseMaturedProDeposits({
        actorUid: user.uid,
        actorRole: "admin",
      });
      setInfo(
        `Checked ${result.checked} entries and released ${result.released} matured deposits.`,
      );
      await load();
    } catch (releaseError) {
      setError(
        releaseError instanceof Error
          ? releaseError.message
          : "Unable to process matured locks.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onForfeit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    if (!businessId) {
      setError("Select a business first.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await adminForfeitBusinessDeposit({
        adminUid: user.uid,
        businessId,
        amount: Number(amount),
        note,
      });
      setInfo("Deposit forfeiture applied.");
      await load();
    } catch (forfeitError) {
      setError(
        forfeitError instanceof Error
          ? forfeitError.message
          : "Unable to apply forfeiture.",
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
        Loading admin deposit controls...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Admin deposit controls</h1>
        <p className="mt-2 text-sm text-muted">
          Manage Pro deposit lifecycle, release matured locks, and apply fraud forfeiture
          adjustments when needed.
        </p>
        <button
          type="button"
          onClick={() => void runReleaseDue()}
          disabled={busy}
          className="mt-4 rounded-xl border border-border px-4 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
        >
          {busy ? "Processing..." : "Release all matured deposit locks"}
        </button>
      </section>

      {info && (
        <div className="rounded-2xl border border-brand/40 bg-brand/10 p-3 text-sm">{info}</div>
      )}
      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <form onSubmit={onForfeit} className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Forfeit deposit balance</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <select
            value={businessId}
            onChange={(event) => setBusinessId(event.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          >
            <option value="">Select business</option>
            {rows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.businessName}
              </option>
            ))}
          </select>
          <input
            type="number"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
            placeholder="Amount INR"
          />
        </div>
        <textarea
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          placeholder="Reason for forfeiture"
        />
        {selectedBusiness && (
          <p className="mt-2 text-xs text-muted">
            Selected business deposit: locked INR {selectedBusiness.totalLockedDeposit ?? 0} |
            available INR {selectedBusiness.totalAvailableDeposit ?? 0}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-70"
        >
          {busy ? "Applying..." : "Apply forfeiture"}
        </button>
      </form>
    </div>
  );
}
