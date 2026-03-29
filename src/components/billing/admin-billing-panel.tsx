"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  adminMarkInvoicePaid,
  fetchBillingSettings,
  fetchAdminInvoices,
  generateInvoicesForAllBusinesses,
  InvoiceRecord,
  runBillingMaintenance,
  updateBillingSettings,
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

export function AdminBillingPanel() {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyInvoiceId, setBusyInvoiceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [invoiceDueDays, setInvoiceDueDays] = useState("10");
  const [lateFeeFlat, setLateFeeFlat] = useState("199");
  const [reminderIntervalDays, setReminderIntervalDays] = useState("4");
  const [refundCaseFee, setRefundCaseFee] = useState("49");
  const [digitalProductMonthlyFee, setDigitalProductMonthlyFee] = useState("25");

  const load = useCallback(async () => {
    if (!hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [invoices, billingSettings] = await Promise.all([
        fetchAdminInvoices(),
        fetchBillingSettings(),
      ]);
      setRows(invoices);
      setInvoiceDueDays(String(billingSettings.invoiceDueDays));
      setLateFeeFlat(String(billingSettings.lateFeeFlat));
      setReminderIntervalDays(String(billingSettings.reminderIntervalDays));
      setRefundCaseFee(String(billingSettings.refundCaseFee));
      setDigitalProductMonthlyFee(String(billingSettings.digitalProductMonthlyFee));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load admin billing panel.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const generated = rows.filter((row) => row.status === "generated");
    const overdue = rows.filter((row) => row.status === "overdue");
    const paid = rows.filter((row) => row.status === "paid");
    return {
      totalInvoices: rows.length,
      generatedCount: generated.length,
      generatedAmount: generated.reduce((sum, row) => sum + row.totalAmount, 0),
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((sum, row) => sum + row.totalAmount, 0),
      paidCount: paid.length,
      paidAmount: paid.reduce((sum, row) => sum + row.totalAmount, 0),
    };
  }, [rows]);

  async function generateAll(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const ids = await generateInvoicesForAllBusinesses(monthKey);
      setInfo(`Generated ${ids.length} invoice(s) for ${monthKey}.`);
      await load();
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Unable to generate invoices.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function markPaid(invoiceId: string) {
    if (!user) return;
    setBusyInvoiceId(invoiceId);
    setError(null);
    setInfo(null);
    try {
      await adminMarkInvoicePaid({
        invoiceId,
        adminUid: user.uid,
      });
      setInfo(`Invoice ${invoiceId} marked as paid.`);
      await load();
    } catch (markError) {
      setError(
        markError instanceof Error ? markError.message : "Unable to mark invoice paid.",
      );
    } finally {
      setBusyInvoiceId(null);
    }
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await updateBillingSettings({
        adminUid: user.uid,
        invoiceDueDays: Number(invoiceDueDays),
        lateFeeFlat: Number(lateFeeFlat),
        reminderIntervalDays: Number(reminderIntervalDays),
        refundCaseFee: Number(refundCaseFee),
        digitalProductMonthlyFee: Number(digitalProductMonthlyFee),
      });
      setInfo("Billing settings updated.");
      await load();
    } catch (settingsError) {
      setError(
        settingsError instanceof Error
          ? settingsError.message
          : "Unable to update billing settings.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function runMaintenance() {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await runBillingMaintenance({
        adminUid: user.uid,
      });
      setInfo(
        `Maintenance complete. Overdue marked ${result.overdueMarked}, late fees ${result.lateFeesApplied}, reminders ${result.remindersSent}.`,
      );
      await load();
    } catch (maintenanceError) {
      setError(
        maintenanceError instanceof Error
          ? maintenanceError.message
          : "Unable to run billing maintenance.",
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
        Loading admin billing panel...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Billing Controls</h1>
        <p className="mt-2 text-sm text-muted">
          Generate monthly invoices and mark collections as paid.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Invoices</p>
            <p className="mt-1 text-xl font-semibold">{stats.totalInvoices}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Generated</p>
            <p className="mt-1 text-xl font-semibold">{stats.generatedCount}</p>
            <p className="text-xs text-muted">{formatINR(stats.generatedAmount)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Overdue</p>
            <p className="mt-1 text-xl font-semibold">{stats.overdueCount}</p>
            <p className="text-xs text-muted">{formatINR(stats.overdueAmount)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Paid</p>
            <p className="mt-1 text-xl font-semibold">{stats.paidCount}</p>
            <p className="text-xs text-muted">{formatINR(stats.paidAmount)}</p>
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

      <form onSubmit={generateAll} className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Generate invoices for all businesses</h2>
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
            {busy ? "Generating..." : "Generate all invoices"}
          </button>
        </div>
      </form>

      <form onSubmit={saveSettings} className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Billing settings</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs text-muted">Invoice due days</span>
            <input
              type="number"
              value={invoiceDueDays}
              onChange={(event) => setInvoiceDueDays(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted">Late fee flat (INR)</span>
            <input
              type="number"
              value={lateFeeFlat}
              onChange={(event) => setLateFeeFlat(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted">Reminder interval days</span>
            <input
              type="number"
              value={reminderIntervalDays}
              onChange={(event) => setReminderIntervalDays(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted">Refund case fee (INR)</span>
            <input
              type="number"
              value={refundCaseFee}
              onChange={(event) => setRefundCaseFee(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted">Digital monthly fee (INR)</span>
            <input
              type="number"
              value={digitalProductMonthlyFee}
              onChange={(event) => setDigitalProductMonthlyFee(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
          >
            {busy ? "Saving..." : "Save billing settings"}
          </button>
          <button
            type="button"
            onClick={() => void runMaintenance()}
            disabled={busy}
            className="rounded-xl border border-border px-4 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
          >
            {busy ? "Running..." : "Run overdue maintenance"}
          </button>
        </div>
      </form>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Invoice register</h2>
        <div className="mt-4 space-y-3">
          {!rows.length && (
            <p className="rounded-2xl border border-border bg-surface p-3 text-sm text-muted">
              No invoices found.
            </p>
          )}
          {rows.map((row) => (
            <article key={row.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {row.ownerName} | {row.monthKey}
                </p>
                <span className="rounded-full border border-border px-2 py-1 text-xs uppercase">
                  {row.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Total {formatINR(row.totalAmount)} | Due {new Date(row.dueAt).toLocaleDateString()} | Reminders {row.reminderCount}
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
              {(row.status === "generated" || row.status === "overdue") && (
                <button
                  type="button"
                  disabled={busyInvoiceId === row.id}
                  onClick={() => void markPaid(row.id)}
                  className="mt-3 rounded-xl border border-border px-3 py-2 text-xs transition hover:border-brand/40 disabled:opacity-70"
                >
                  {busyInvoiceId === row.id ? "Updating..." : "Mark paid"}
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
