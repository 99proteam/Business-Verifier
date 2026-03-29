"use client";

import { useState } from "react";

export function AdminReconciliationPanel() {
  const [monthKey, setMonthKey] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);

  async function generateJson() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const response = await fetch("/api/admin/reconciliation/export", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-export-secret": secret,
        },
        body: JSON.stringify({
          monthKey: monthKey || undefined,
          format: "json",
        }),
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok || !payload.ok) {
        throw new Error(String(payload.error ?? "Unable to generate reconciliation report."));
      }
      const report = payload.report as Record<string, unknown>;
      setSummary((report.summary as Record<string, unknown>) ?? null);
      setInfo("Reconciliation JSON generated.");
    } catch (reportError) {
      setError(
        reportError instanceof Error
          ? reportError.message
          : "Unable to generate reconciliation report.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function downloadCsv() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const response = await fetch("/api/admin/reconciliation/export", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-export-secret": secret,
        },
        body: JSON.stringify({
          monthKey: monthKey || undefined,
          format: "csv",
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(String(payload.error ?? "Unable to download CSV."));
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `reconciliation-${monthKey || "all"}.csv`;
      anchor.click();
      window.URL.revokeObjectURL(url);
      setInfo("Reconciliation CSV downloaded.");
    } catch (downloadError) {
      setError(
        downloadError instanceof Error ? downloadError.message : "Unable to download CSV.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Reconciliation exports</h1>
        <p className="mt-2 text-sm text-muted">
          Generate month-wise JSON and CSV reconciliations across orders, invoices,
          withdrawals, payouts, payments, and audit trails.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            type="month"
            value={monthKey}
            onChange={(event) => setMonthKey(event.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder="Admin export secret"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void generateJson()}
            disabled={busy}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
          >
            Generate JSON summary
          </button>
          <button
            type="button"
            onClick={() => void downloadCsv()}
            disabled={busy}
            className="rounded-xl border border-border px-4 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
          >
            Download CSV
          </button>
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

      {summary && (
        <section className="glass rounded-3xl p-6">
          <h2 className="text-lg font-semibold tracking-tight">Summary snapshot</h2>
          <pre className="mt-3 overflow-auto rounded-2xl border border-border bg-surface p-3 text-xs text-muted">
            {JSON.stringify(summary, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}
