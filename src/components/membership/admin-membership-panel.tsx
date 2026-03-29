"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  fetchAdminMembershipApiUsage,
  fetchAdminMembershipPrograms,
  fetchMembershipDistributionCycles,
  fetchMembershipEconomicsSettings,
  fetchMembershipReportsByCycle,
  generateMembershipDistributionCycle,
  MembershipApiUsageBucketRecord,
  MembershipBusinessCycleReportRecord,
  MembershipBusinessProgramRecord,
  MembershipDistributionCycleRecord,
  MembershipEconomicsSettings,
  setMembershipBusinessProgramStatus,
  updateMembershipEconomicsSettings,
} from "@/lib/firebase/repositories";

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function AdminMembershipPanel() {
  const { user, hasFirebaseConfig } = useAuth();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const [settings, setSettings] = useState<MembershipEconomicsSettings | null>(null);
  const [programs, setPrograms] = useState<MembershipBusinessProgramRecord[]>([]);
  const [cycles, setCycles] = useState<MembershipDistributionCycleRecord[]>([]);
  const [reports, setReports] = useState<MembershipBusinessCycleReportRecord[]>([]);
  const [usageRows, setUsageRows] = useState<MembershipApiUsageBucketRecord[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [startMonthKey, setStartMonthKey] = useState(currentMonthKey());
  const [endMonthKey, setEndMonthKey] = useState(currentMonthKey());
  const [cycleKey, setCycleKey] = useState("");

  const load = useCallback(async () => {
    if (!hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [settingsRow, programRows, cycleRows, usageBucketRows] = await Promise.all([
        fetchMembershipEconomicsSettings(),
        fetchAdminMembershipPrograms(),
        fetchMembershipDistributionCycles(),
        fetchAdminMembershipApiUsage(300),
      ]);
      setSettings(settingsRow);
      setPrograms(programRows);
      setCycles(cycleRows);
      setUsageRows(usageBucketRows);
      const cycleId = selectedCycleId || cycleRows[0]?.id;
      if (cycleId) {
        setSelectedCycleId(cycleId);
        setReports(await fetchMembershipReportsByCycle(cycleId));
      } else {
        setReports([]);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load membership admin panel.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, selectedCycleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const activePrograms = programs.filter((row) => row.status === "active");
    const pausedPrograms = programs.filter((row) => row.status === "paused");
    const totalRevenue = cycles.reduce((sum, cycle) => sum + cycle.totalMembershipRevenue, 0);
    const totalApiCalls = usageRows.reduce((sum, row) => sum + row.count, 0);
    return {
      totalPrograms: programs.length,
      activePrograms: activePrograms.length,
      pausedPrograms: pausedPrograms.length,
      cycleCount: cycles.length,
      totalRevenue,
      totalApiCalls,
    };
  }, [cycles, programs, usageRows]);

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!user || !settings) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await updateMembershipEconomicsSettings({
        adminUid: user.uid,
        settings,
      });
      setInfo("Membership economics settings updated.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save settings.");
    } finally {
      setBusy(false);
    }
  }

  async function setProgramStatus(ownerUid: string, status: "active" | "paused") {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await setMembershipBusinessProgramStatus({
        ownerUid,
        adminUid: user.uid,
        status,
      });
      setInfo(`Program ${ownerUid} moved to ${status}.`);
      await load();
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Unable to update program status.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function generateCycle(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await generateMembershipDistributionCycle({
        adminUid: user.uid,
        startMonthKey,
        endMonthKey,
        cycleKey: cycleKey.trim() || undefined,
      });
      setInfo(
        `Cycle ${result.cycleKey} generated. Distributed INR ${result.distributedAmount}.`,
      );
      setCycleKey("");
      await load();
    } catch (cycleError) {
      setError(
        cycleError instanceof Error
          ? cycleError.message
          : "Unable to generate distribution cycle.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function selectCycle(cycleId: string) {
    setSelectedCycleId(cycleId);
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      setReports(await fetchMembershipReportsByCycle(cycleId));
    } catch (reportError) {
      setError(
        reportError instanceof Error ? reportError.message : "Unable to load cycle reports.",
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

  if (loading || !settings) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        Loading admin membership panel...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Membership Economics</h1>
        <p className="mt-2 text-sm text-muted">
          Manage verifier membership policy, business participation, and weighted distribution payouts.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-6">
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Programs</p>
            <p className="mt-1 text-sm font-medium">{stats.totalPrograms}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Active</p>
            <p className="mt-1 text-sm font-medium">{stats.activePrograms}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Paused</p>
            <p className="mt-1 text-sm font-medium">{stats.pausedPrograms}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Distribution cycles</p>
            <p className="mt-1 text-sm font-medium">{stats.cycleCount}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Membership revenue</p>
            <p className="mt-1 text-sm font-medium">INR {stats.totalRevenue}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">API calls tracked</p>
            <p className="mt-1 text-sm font-medium">{stats.totalApiCalls}</p>
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

      <form onSubmit={saveSettings} className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Economics settings</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <input
            value={settings.customerMonthlyPrice}
            onChange={(event) =>
              setSettings((prev) =>
                prev ? { ...prev, customerMonthlyPrice: Number(event.target.value) } : prev,
              )
            }
            type="number"
            placeholder="Customer monthly price"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={settings.customerYearlyPrice}
            onChange={(event) =>
              setSettings((prev) =>
                prev ? { ...prev, customerYearlyPrice: Number(event.target.value) } : prev,
              )
            }
            type="number"
            placeholder="Customer yearly price"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={settings.minimumDiscountPercent}
            onChange={(event) =>
              setSettings((prev) =>
                prev ? { ...prev, minimumDiscountPercent: Number(event.target.value) } : prev,
              )
            }
            type="number"
            placeholder="Minimum discount percent"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={settings.onlineMinTransactions}
            onChange={(event) =>
              setSettings((prev) =>
                prev ? { ...prev, onlineMinTransactions: Number(event.target.value) } : prev,
              )
            }
            type="number"
            placeholder="Online min transactions"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={settings.offlineMinTransactions}
            onChange={(event) =>
              setSettings((prev) =>
                prev ? { ...prev, offlineMinTransactions: Number(event.target.value) } : prev,
              )
            }
            type="number"
            placeholder="Offline min transactions"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={settings.minTransactionValue}
            onChange={(event) =>
              setSettings((prev) =>
                prev ? { ...prev, minTransactionValue: Number(event.target.value) } : prev,
              )
            }
            type="number"
            placeholder="Min transaction value"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={settings.businessSharePercent}
            onChange={(event) =>
              setSettings((prev) =>
                prev ? { ...prev, businessSharePercent: Number(event.target.value) } : prev,
              )
            }
            type="number"
            placeholder="Business share percent"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={settings.maxShareCapPercent}
            onChange={(event) =>
              setSettings((prev) =>
                prev ? { ...prev, maxShareCapPercent: Number(event.target.value) } : prev,
              )
            }
            type="number"
            placeholder="Max share cap percent"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={settings.minimumMonthlyPayout}
            onChange={(event) =>
              setSettings((prev) =>
                prev ? { ...prev, minimumMonthlyPayout: Number(event.target.value) } : prev,
              )
            }
            type="number"
            placeholder="Minimum monthly payout"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={settings.monthlyEligibleGrossCap}
            onChange={(event) =>
              setSettings((prev) =>
                prev ? { ...prev, monthlyEligibleGrossCap: Number(event.target.value) } : prev,
              )
            }
            type="number"
            placeholder="Monthly gross cap"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={settings.maxEligibleGrossValuePerBusiness}
            onChange={(event) =>
              setSettings((prev) =>
                prev
                  ? { ...prev, maxEligibleGrossValuePerBusiness: Number(event.target.value) }
                  : prev,
              )
            }
            type="number"
            placeholder="Cycle gross cap per business"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={settings.cycleReservePercent}
            onChange={(event) =>
              setSettings((prev) =>
                prev ? { ...prev, cycleReservePercent: Number(event.target.value) } : prev,
              )
            }
            type="number"
            placeholder="Cycle reserve percent"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
        >
          Save economics settings
        </button>
      </form>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Generate distribution cycle</h2>
        <form onSubmit={generateCycle} className="mt-3 grid gap-3 md:grid-cols-3">
          <input
            type="month"
            value={startMonthKey}
            onChange={(event) => setStartMonthKey(event.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            type="month"
            value={endMonthKey}
            onChange={(event) => setEndMonthKey(event.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={cycleKey}
            onChange={(event) => setCycleKey(event.target.value)}
            placeholder="Optional cycle key"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl border border-border px-4 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70 md:col-span-3"
          >
            Generate weighted distribution
          </button>
        </form>
        <div className="mt-4 rounded-2xl border border-border bg-surface p-3 text-xs">
          <p className="font-medium">Automation endpoint</p>
          <p className="mt-1">
            POST {appUrl}/api/membership/distribution/run
          </p>
          <p className="mt-1">
            Header: <span className="font-mono">x-cron-secret: &lt;MEMBERSHIP_CRON_SECRET&gt;</span>
          </p>
          <p className="mt-1">
            Body (optional):{" "}
            <span className="font-mono">
              {"{\"startMonthKey\":\"YYYY-MM\",\"endMonthKey\":\"YYYY-MM\",\"cycleKey\":\"optional\"}"}
            </span>
          </p>
        </div>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Business program controls</h2>
        <div className="mt-3 space-y-2">
          {!programs.length && <p className="text-sm text-muted">No business program rows found.</p>}
          {programs.map((program) => (
            <article key={program.id} className="rounded-2xl border border-border bg-surface p-3">
              <p className="text-sm font-medium">
                {program.ownerName} | {program.businessMode} | {program.discountPercent}% discount
              </p>
              <p className="text-xs text-muted">
                Status {program.status} | Payout received INR {program.totalPayoutReceived}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void setProgramStatus(program.ownerUid, "active")}
                  className="rounded-xl border border-border px-3 py-2 text-xs transition hover:border-brand/40 disabled:opacity-70"
                >
                  Mark active
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void setProgramStatus(program.ownerUid, "paused")}
                  className="rounded-xl border border-danger/40 px-3 py-2 text-xs text-danger transition hover:bg-danger/10 disabled:opacity-70"
                >
                  Pause
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Distribution cycles</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {cycles.map((cycle) => (
            <button
              key={cycle.id}
              type="button"
              onClick={() => void selectCycle(cycle.id)}
              className={`rounded-2xl border p-3 text-left text-sm transition ${
                selectedCycleId === cycle.id
                  ? "border-brand/60 bg-brand/10"
                  : "border-border bg-surface hover:border-brand/40"
              }`}
            >
              <p className="font-medium">{cycle.cycleKey}</p>
              <p className="text-xs text-muted">
                Revenue INR {cycle.totalMembershipRevenue} | Distributed INR {cycle.distributedAmount}
              </p>
            </button>
          ))}
        </div>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Membership API usage monitor</h2>
        <div className="mt-3 space-y-2">
          {!usageRows.length && <p className="text-sm text-muted">No API usage buckets yet.</p>}
          {usageRows.slice(0, 80).map((row) => (
            <article key={row.id} className="rounded-2xl border border-border bg-surface p-3 text-sm">
              <p className="font-medium">
                {row.endpoint} | {row.businessOwnerUid}
              </p>
              <p className="text-xs text-muted">
                Calls {row.count} | Window {new Date(row.windowStart).toLocaleString()} ({row.windowMinutes} min)
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Selected cycle reports</h2>
        <div className="mt-3 space-y-2">
          {!reports.length && <p className="text-sm text-muted">No business reports for this cycle.</p>}
          {reports.map((report) => (
            <article key={report.id} className="rounded-2xl border border-border bg-surface p-3">
              <p className="text-sm font-medium">
                {report.ownerName} | Payout INR {report.payoutAmount}
              </p>
              <p className="text-xs text-muted">
                Eligible transactions {report.eligibleTransactions} | Gross INR{" "}
                {report.eligibleGrossValue} | Score {report.score.toFixed(2)}
              </p>
              {!!report.missedReasons.length && (
                <p className="mt-1 text-xs text-muted">Reasons: {report.missedReasons.join(" ")}</p>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
