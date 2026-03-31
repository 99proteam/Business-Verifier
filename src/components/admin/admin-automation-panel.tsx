"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  AutomationJobRunRecord,
  fetchAutomationJobRuns,
  generateInvoicesForAllBusinesses,
  releaseDueEscrowOrders,
  releaseMaturedProDeposits,
  runBillingMaintenance,
} from "@/lib/firebase/repositories";

export function AdminAutomationPanel() {
  const { user, hasFirebaseConfig } = useAuth();
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [monthKey, setMonthKey] = useState("");
  const [automationSecret, setAutomationSecret] = useState("");
  const [exportSecret, setExportSecret] = useState("");
  const [geoSecret, setGeoSecret] = useState("");
  const [cronToken, setCronToken] = useState("");
  const [runs, setRuns] = useState<AutomationJobRunRecord[]>([]);

  const loadRuns = useCallback(async () => {
    try {
      setRuns(await fetchAutomationJobRuns(80));
    } catch {
      setRuns([]);
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  async function runInvoices() {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const ids = await generateInvoicesForAllBusinesses();
      setInfo(`Generated ${ids.length} invoice(s) for current month.`);
      await loadRuns();
    } catch (runError) {
      setError(
        runError instanceof Error ? runError.message : "Unable to generate invoices.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function runEscrowRelease() {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await releaseDueEscrowOrders({
        adminUid: user.uid,
        adminName: user.displayName ?? "Admin",
      });
      setInfo(`Escrow release: due ${result.due}, released ${result.released}.`);
      await loadRuns();
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : "Unable to release escrow entries.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function runDepositRelease() {
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
        `Deposit release: checked ${result.checked}, released ${result.released}, businesses ${result.businessesUpdated}.`,
      );
      await loadRuns();
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : "Unable to release matured deposits.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function runBilling() {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await runBillingMaintenance({
        adminUid: user.uid,
      });
      setInfo(
        `Billing maintenance: overdue ${result.overdueMarked}, late fees ${result.lateFeesApplied}, reminders ${result.remindersSent}.`,
      );
      await loadRuns();
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : "Unable to run billing maintenance.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function runAllAutomation() {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const response = await fetch("/api/automation/run-all", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cron-secret": automationSecret,
        },
        body: JSON.stringify({
          adminUid: user.uid,
          adminName: user.displayName ?? "Admin",
          monthKey: monthKey || undefined,
        }),
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok || !payload.ok) {
        throw new Error(String(payload.error ?? "Unable to run automation bundle."));
      }
      setInfo("Run-all automation completed.");
      await loadRuns();
    } catch (runError) {
      setError(
        runError instanceof Error ? runError.message : "Unable to run full automation.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function exportReconciliation(format: "json" | "csv") {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const response = await fetch("/api/admin/reconciliation/export", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-export-secret": exportSecret,
        },
        body: JSON.stringify({
          monthKey: monthKey || undefined,
          format,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(String(payload.error ?? "Unable to export reconciliation report."));
      }
      if (format === "json") {
        const payload = (await response.json()) as Record<string, unknown>;
        setInfo(
          `Reconciliation JSON generated for ${String(
            monthKey || "all",
          )}. Rows: ${String((payload.report as Record<string, unknown>)?.summary ? "available" : "n/a")}.`,
        );
      } else {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `reconciliation-${monthKey || "all"}.csv`;
        anchor.click();
        window.URL.revokeObjectURL(url);
        setInfo("Reconciliation CSV downloaded.");
      }
    } catch (exportError) {
      setError(
        exportError instanceof Error ? exportError.message : "Unable to export report.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function importGeoCatalog() {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const response = await fetch("/api/admin/geo/import", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-geo-secret": geoSecret,
        },
        body: JSON.stringify({
          adminUid: user.uid,
          source: "admin_panel",
        }),
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok || !payload.ok) {
        throw new Error(String(payload.error ?? "Unable to import geo catalog."));
      }
      const imported = payload.imported as Record<string, unknown>;
      setInfo(
        `Geo catalog imported: countries ${String(imported.countries ?? 0)}, cities ${String(
          imported.cities ?? 0,
        )}.`,
      );
    } catch (importError) {
      setError(
        importError instanceof Error ? importError.message : "Unable to import geo catalog.",
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

  return (
    <div className="space-y-4">
      <section className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Automation monitor</h1>
        <p className="mt-2 text-sm text-muted">
          Manual and scheduled automation controls for invoices, escrow release, deposits, billing, and catalog sync.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <input
            type="month"
            value={monthKey}
            onChange={(event) => setMonthKey(event.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
            placeholder="Month key"
          />
          <input
            type="password"
            value={automationSecret}
            onChange={(event) => setAutomationSecret(event.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
            placeholder="Automation cron secret"
          />
          <button
            type="button"
            onClick={() => void runAllAutomation()}
            disabled={busy}
            className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
          >
            Run all automation bundle
          </button>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <button
            type="button"
            onClick={() => void runInvoices()}
            disabled={busy}
            className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
          >
            Run invoice generation
          </button>
          <button
            type="button"
            onClick={() => void runEscrowRelease()}
            disabled={busy}
            className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
          >
            Run escrow release
          </button>
          <button
            type="button"
            onClick={() => void runDepositRelease()}
            disabled={busy}
            className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
          >
            Run deposit release
          </button>
          <button
            type="button"
            onClick={() => void runBilling()}
            disabled={busy}
            className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
          >
            Run billing maintenance
          </button>
        </div>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Managed Scheduler Wiring</h2>
        <p className="mt-1 text-xs text-muted">
          Production cron endpoint: <span className="font-mono">/api/cron/system?token=&lt;CRON_PUBLIC_TRIGGER_TOKEN&gt;</span>
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
          <input
            value={cronToken}
            onChange={(event) => setCronToken(event.target.value)}
            type="password"
            placeholder="Cron token"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <a
            href={`/api/cron/system?token=${encodeURIComponent(cronToken)}${monthKey ? `&monthKey=${encodeURIComponent(monthKey)}` : ""}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40"
          >
            Trigger cron endpoint
          </a>
        </div>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Reconciliation exports</h2>
        <p className="mt-1 text-xs text-muted">
          Provide admin export secret to download month-wise finance reconciliation.
        </p>
        <input
          value={exportSecret}
          onChange={(event) => setExportSecret(event.target.value)}
          type="password"
          placeholder="Admin export secret"
          className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void exportReconciliation("json")}
            disabled={busy}
            className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
          >
            Generate JSON
          </button>
          <button
            type="button"
            onClick={() => void exportReconciliation("csv")}
            disabled={busy}
            className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
          >
            Download CSV
          </button>
        </div>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Geo import pipeline</h2>
        <p className="mt-1 text-xs text-muted">
          Trigger global country/city import seed into Firestore catalog.
        </p>
        <input
          value={geoSecret}
          onChange={(event) => setGeoSecret(event.target.value)}
          type="password"
          placeholder="Admin geo import secret"
          className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
        />
        <button
          type="button"
          onClick={() => void importGeoCatalog()}
          disabled={busy}
          className="mt-3 rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
        >
          Run geo import
        </button>
      </section>

      <section className="glass rounded-3xl p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Automation run history</h2>
          <button
            type="button"
            onClick={() => void loadRuns()}
            className="rounded-xl border border-border px-3 py-2 text-xs transition hover:border-brand/40"
          >
            Refresh
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {!runs.length && <p className="text-sm text-muted">No automation runs recorded yet.</p>}
          {runs.map((row) => (
            <article key={row.id} className="rounded-2xl border border-border bg-surface p-3 text-sm">
              <p className="font-medium">
                {row.jobKey} | {row.status}
              </p>
              <p className="text-xs text-muted">{row.summary}</p>
              <p className="text-xs text-muted">
                Source {row.source} | {new Date(row.createdAt).toLocaleString()}
              </p>
            </article>
          ))}
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
    </div>
  );
}
