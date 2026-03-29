"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  fetchInvoicesByOwner,
  generateMonthlyInvoiceForBusiness,
  InvoiceRecord,
} from "@/lib/firebase/repositories";

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function BusinessBillingDashboard() {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [monthKey, setMonthKey] = useState(currentMonthKey());

  const load = useCallback(async () => {
    if (!user || !hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchInvoicesByOwner(user.uid));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load billing invoices.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const unpaid = rows.filter((row) => row.status === "generated" || row.status === "overdue");
    const overdue = rows.filter((row) => row.status === "overdue");
    const paid = rows.filter((row) => row.status === "paid");
    return {
      unpaidCount: unpaid.length,
      paidCount: paid.length,
      overdueCount: overdue.length,
      unpaidTotal: unpaid.reduce((sum, row) => sum + row.totalAmount, 0),
      paidTotal: paid.reduce((sum, row) => sum + row.totalAmount, 0),
    };
  }, [rows]);

  async function generateInvoice(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await generateMonthlyInvoiceForBusiness({
        ownerUid: user.uid,
        ownerName: user.displayName ?? "Business",
        monthKey,
      });
      setInfo(`Invoice generated for ${monthKey}.`);
      await load();
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Unable to generate invoice.",
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
        Loading billing dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Business Billing</h1>
        <p className="mt-2 text-sm text-muted">
          Review month-wise platform invoices for commission, API usage, and ads.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Unpaid invoices</p>
            <p className="mt-1 text-xl font-semibold">{stats.unpaidCount}</p>
            <p className="text-xs text-muted">{formatINR(stats.unpaidTotal)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Overdue invoices</p>
            <p className="mt-1 text-xl font-semibold">{stats.overdueCount}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Paid invoices</p>
            <p className="mt-1 text-xl font-semibold">{stats.paidCount}</p>
            <p className="text-xs text-muted">{formatINR(stats.paidTotal)}</p>
          </div>
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

      <form onSubmit={generateInvoice} className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Generate invoice</h2>
        <p className="mt-1 text-xs text-muted">
          This creates one invoice per month if it does not already exist.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={monthKey}
            onChange={(event) => setMonthKey(event.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
          >
            {busy ? "Generating..." : "Generate selected month"}
          </button>
        </div>
      </form>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Invoice history</h2>
        <div className="mt-4 space-y-3">
          {!rows.length && (
            <p className="rounded-2xl border border-border bg-surface p-3 text-sm text-muted">
              No invoices yet.
            </p>
          )}
          {rows.map((row) => (
            <article key={row.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Month {row.monthKey}</p>
                <span className="rounded-full border border-border px-2 py-1 text-xs uppercase">
                  {row.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Generated {new Date(row.createdAt).toLocaleString()} | Due{" "}
                {new Date(row.dueAt).toLocaleDateString()} | Reminders {row.reminderCount}
              </p>
              <div className="mt-3 space-y-2">
                {row.lineItems.map((item) => (
                  <div
                    key={`${row.id}-${item.label}`}
                    className="rounded-xl border border-border px-3 py-2"
                  >
                    <p className="text-xs font-medium">{item.label}</p>
                    <p className="text-xs text-muted">{item.details}</p>
                    <p className="mt-1 text-xs">{formatINR(item.amount)}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm font-semibold">
                Total: {formatINR(row.totalAmount)}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
