"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  bulkCreateMembershipBusinessTransactions,
  createMembershipBusinessTransaction,
  fetchMembershipBusinessProgram,
  fetchMembershipEconomicsSettings,
  fetchMembershipReportsByBusiness,
  fetchMembershipTransactionsByBusiness,
  MembershipBusinessCycleReportRecord,
  MembershipBusinessProgramRecord,
  MembershipBusinessTransactionRecord,
  MembershipDiscountCheckResult,
  rotateMembershipBusinessApiKey,
  upsertMembershipBusinessProgram,
  validateVerifierMembershipDiscount,
} from "@/lib/firebase/repositories";

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseCsvRows(csvText: string) {
  const rows = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (rows.length <= 1) return [];
  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.split(",").map((item) => item.trim().toLowerCase());
  const idxOrderId = headers.indexOf("order_id");
  const idxAmount = headers.indexOf("amount");
  const idxPublicId = headers.indexOf("customer_public_id");
  const idxDate = headers.indexOf("date");
  if (idxOrderId === -1 || idxAmount === -1) {
    throw new Error("CSV must include `order_id,amount` columns.");
  }

  return dataRows.map((line) => {
    const cols = line.split(",").map((item) => item.trim());
    return {
      externalOrderId: cols[idxOrderId] ?? "",
      transactionValue: Number(cols[idxAmount] ?? 0),
      customerPublicId: idxPublicId >= 0 ? cols[idxPublicId] || undefined : undefined,
      occurredAt: idxDate >= 0 ? cols[idxDate] || undefined : undefined,
    };
  });
}

export function BusinessMembershipManager() {
  const { user, hasFirebaseConfig } = useAuth();
  const [program, setProgram] = useState<MembershipBusinessProgramRecord | null>(null);
  const [transactions, setTransactions] = useState<MembershipBusinessTransactionRecord[]>([]);
  const [reports, setReports] = useState<MembershipBusinessCycleReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [minimumDiscountPercent, setMinimumDiscountPercent] = useState(10);

  const [businessMode, setBusinessMode] = useState<"online" | "offline" | "hybrid">("online");
  const [discountPercent, setDiscountPercent] = useState("10");
  const [monthKey, setMonthKey] = useState(currentMonthKey());

  const [txnSource, setTxnSource] = useState<"online" | "offline">("online");
  const [txnOrderId, setTxnOrderId] = useState("");
  const [txnAmount, setTxnAmount] = useState("500");
  const [txnPublicId, setTxnPublicId] = useState("");
  const [txnDate, setTxnDate] = useState("");

  const [csvSource, setCsvSource] = useState<"online" | "offline">("offline");
  const [csvText, setCsvText] = useState(
    "order_id,amount,customer_public_id,date\nOFF-001,1200,BVU-ABCDEFGH,2026-03-01\nOFF-002,800,,2026-03-02",
  );

  const [simPublicId, setSimPublicId] = useState("");
  const [simAmount, setSimAmount] = useState("1000");
  const [simSource, setSimSource] = useState<"online" | "offline">("online");
  const [simResult, setSimResult] = useState<MembershipDiscountCheckResult | null>(null);

  const load = useCallback(async () => {
    if (!user || !hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [programRow, settingRow, txRows, reportRows] = await Promise.all([
        fetchMembershipBusinessProgram(user.uid),
        fetchMembershipEconomicsSettings(),
        fetchMembershipTransactionsByBusiness(user.uid, monthKey),
        fetchMembershipReportsByBusiness(user.uid),
      ]);
      setProgram(programRow);
      setMinimumDiscountPercent(settingRow.minimumDiscountPercent);
      setTransactions(txRows);
      setReports(reportRows);
      if (programRow) {
        setBusinessMode(programRow.businessMode);
        setDiscountPercent(String(programRow.discountPercent));
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load business membership.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, monthKey, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const transactionStats = useMemo(() => {
    const online = transactions.filter((row) => row.source === "online");
    const offline = transactions.filter((row) => row.source === "offline");
    const eligible = transactions.filter((row) => row.eligibleForScoring);
    return {
      totalCount: transactions.length,
      onlineCount: online.length,
      offlineCount: offline.length,
      eligibleCount: eligible.length,
      eligibleGross: eligible.reduce((sum, row) => sum + row.transactionValue, 0),
    };
  }, [transactions]);

  async function saveProgram(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const next = await upsertMembershipBusinessProgram({
        ownerUid: user.uid,
        ownerName: user.displayName ?? "Business",
        businessMode,
        discountPercent: Number(discountPercent),
      });
      setProgram(next);
      setInfo("Membership business participation saved.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save program.");
    } finally {
      setBusy(false);
    }
  }

  async function rotateApiKey() {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const nextKey = await rotateMembershipBusinessApiKey(user.uid);
      setInfo(`Integration API key rotated. New key: ${nextKey}`);
      await load();
    } catch (rotateError) {
      setError(
        rotateError instanceof Error
          ? rotateError.message
          : "Unable to rotate integration key.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function addTransaction(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const txId = await createMembershipBusinessTransaction({
        businessOwnerUid: user.uid,
        source: txnSource,
        externalOrderId: txnOrderId,
        transactionValue: Number(txnAmount),
        customerPublicId: txnPublicId.trim() || undefined,
        occurredAt: txnDate || undefined,
      });
      setInfo(`Transaction logged: ${txId}`);
      setTxnOrderId("");
      setTxnAmount("500");
      setTxnPublicId("");
      setTxnDate("");
      await load();
    } catch (txError) {
      setError(
        txError instanceof Error ? txError.message : "Unable to log transaction right now.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function importCsv() {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const rows = parseCsvRows(csvText).filter((row) => row.externalOrderId && row.transactionValue > 0);
      const result = await bulkCreateMembershipBusinessTransactions({
        businessOwnerUid: user.uid,
        source: csvSource,
        rows,
      });
      setInfo(
        `CSV import completed. Success ${result.successCount}, failed ${result.failureCount}.`,
      );
      await load();
    } catch (importError) {
      setError(
        importError instanceof Error ? importError.message : "Unable to import CSV transactions.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onCsvFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
  }

  async function simulateDiscount(event: FormEvent) {
    event.preventDefault();
    if (!program) {
      setError("Configure business membership program first.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await validateVerifierMembershipDiscount({
        businessOwnerUid: program.ownerUid,
        integrationApiKey: program.integrationApiKey,
        customerPublicId: simPublicId,
        transactionValue: Number(simAmount),
        source: simSource,
      });
      setSimResult(result);
      setInfo("Discount simulation completed.");
    } catch (simError) {
      setSimResult(null);
      setError(
        simError instanceof Error ? simError.message : "Unable to validate discount right now.",
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
        Loading business membership...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Business Membership Engine</h1>
        <p className="mt-2 text-sm text-muted">
          Configure Verifier Customer discounts, ingest online/offline transactions, and monitor payout eligibility.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Program status</p>
            <p className="mt-1 text-sm font-medium capitalize">{program?.status ?? "not joined"}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Transactions ({monthKey})</p>
            <p className="mt-1 text-sm font-medium">{transactionStats.totalCount}</p>
            <p className="text-xs text-muted">
              Online {transactionStats.onlineCount} | Offline {transactionStats.offlineCount}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Eligible count</p>
            <p className="mt-1 text-sm font-medium">{transactionStats.eligibleCount}</p>
            <p className="text-xs text-muted">Gross INR {transactionStats.eligibleGross}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Minimum discount rule</p>
            <p className="mt-1 text-sm font-medium">{minimumDiscountPercent}% minimum</p>
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

      <form onSubmit={saveProgram} className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Program setup</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <select
            value={businessMode}
            onChange={(event) =>
              setBusinessMode(event.target.value as "online" | "offline" | "hybrid")
            }
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          >
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="hybrid">Hybrid</option>
          </select>
          <input
            value={discountPercent}
            onChange={(event) => setDiscountPercent(event.target.value)}
            type="number"
            placeholder="Discount percent"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
        >
          Save participation
        </button>
        {program && (
          <div className="mt-4 space-y-2 rounded-2xl border border-border bg-surface p-4 text-xs">
            <p>Integration API key: {program.integrationApiKey}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void rotateApiKey()}
              className="rounded-xl border border-border px-3 py-2 text-xs transition hover:border-brand/40 disabled:opacity-70"
            >
              Rotate API key
            </button>
            <textarea
              readOnly
              rows={8}
              className="w-full rounded-xl border border-border bg-white px-3 py-2 text-xs outline-none"
              value={`// Membership validation payload for your backend\n// Call this from your platform with your secured server flow.\n{\n  "businessOwnerUid": "${program.ownerUid}",\n  "integrationApiKey": "${program.integrationApiKey}",\n  "customerPublicId": "BVU-XXXXXXX",\n  "transactionValue": 1500,\n  "source": "${businessMode === "offline" ? "offline" : "online"}"\n}`}
            />
          </div>
        )}
      </form>

      <form onSubmit={addTransaction} className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Add transaction</h2>
        <p className="mt-1 text-xs text-muted">
          Use this for online/offline sales ingestion. Minimum value and monthly thresholds are applied automatically.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <select
            value={txnSource}
            onChange={(event) => setTxnSource(event.target.value as "online" | "offline")}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          >
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
          <input
            value={txnOrderId}
            onChange={(event) => setTxnOrderId(event.target.value)}
            placeholder="External order ID"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={txnAmount}
            onChange={(event) => setTxnAmount(event.target.value)}
            type="number"
            placeholder="Amount"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={txnPublicId}
            onChange={(event) => setTxnPublicId(event.target.value)}
            placeholder="Customer public ID (optional)"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={txnDate}
            onChange={(event) => setTxnDate(event.target.value)}
            type="date"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-xl border border-border px-4 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
        >
          Save transaction
        </button>
      </form>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Offline CSV import</h2>
        <p className="mt-1 text-xs text-muted">
          CSV format: <span className="font-mono">order_id,amount,customer_public_id,date</span>
        </p>
        <div className="mt-3 grid gap-3">
          <select
            value={csvSource}
            onChange={(event) => setCsvSource(event.target.value as "online" | "offline")}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          >
            <option value="offline">Offline import</option>
            <option value="online">Online import</option>
          </select>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void onCsvFileChange(event)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-3 file:py-1 file:text-xs file:font-medium file:text-brand-strong"
          />
          <textarea
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            rows={6}
            className="rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void importCsv()}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
          >
            Import CSV rows
          </button>
        </div>
      </section>

      <form onSubmit={simulateDiscount} className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Discount simulation</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <input
            value={simPublicId}
            onChange={(event) => setSimPublicId(event.target.value)}
            placeholder="Customer public ID"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={simAmount}
            onChange={(event) => setSimAmount(event.target.value)}
            type="number"
            placeholder="Transaction amount"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <select
            value={simSource}
            onChange={(event) => setSimSource(event.target.value as "online" | "offline")}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          >
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-xl border border-border px-4 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
        >
          Validate discount
        </button>
        {simResult && (
          <div className="mt-3 rounded-2xl border border-border bg-surface p-3 text-xs">
            <p>Membership active: {String(simResult.isMembershipActive)}</p>
            <p>Discount: {simResult.discountPercent}%</p>
            <p>Discount amount: INR {simResult.discountAmount}</p>
            <p>Final amount: INR {simResult.finalAmount}</p>
          </div>
        )}
      </form>

      <section className="glass rounded-3xl p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Recent transactions</h2>
          <input
            type="month"
            value={monthKey}
            onChange={(event) => setMonthKey(event.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-xs outline-none"
          />
        </div>
        <div className="mt-4 space-y-2">
          {!transactions.length && <p className="text-sm text-muted">No rows for selected month.</p>}
          {transactions.slice(0, 40).map((row) => (
            <article key={row.id} className="rounded-2xl border border-border bg-surface p-3 text-sm">
              <p className="font-medium">
                {row.externalOrderId} | {row.source} | INR {row.transactionValue}
              </p>
              <p className="text-xs text-muted">
                Membership applied: {String(row.membershipApplied)} | Eligible:{" "}
                {String(row.eligibleForScoring)}
              </p>
              {row.ineligibilityReason && (
                <p className="text-xs text-danger">{row.ineligibilityReason}</p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Distribution reports</h2>
        <div className="mt-3 space-y-2">
          {!reports.length && <p className="text-sm text-muted">No cycle reports yet.</p>}
          {reports.map((report) => (
            <article key={report.id} className="rounded-2xl border border-border bg-surface p-3">
              <p className="text-sm font-medium">
                {report.cycleKey} | Payout INR {report.payoutAmount}
              </p>
              <p className="text-xs text-muted">
                Eligible transactions {report.eligibleTransactions} | Gross INR{" "}
                {report.eligibleGrossValue}
              </p>
              {!!report.missedReasons.length && (
                <p className="mt-1 text-xs text-muted">Notes: {report.missedReasons.join(" ")}</p>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
