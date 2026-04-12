"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  adminReviewTierRequest,
  analyzeTicketEvidence,
  DisputeSlaBreachRecord,
  DisputeSlaPolicyRecord,
  evaluateDisputeSlaBreaches,
  fetchDisputeSlaBreaches,
  fetchDisputeSlaPolicy,
  fetchMerchantRiskProfiles,
  fetchOpenDisputeTickets,
  fetchPendingTierRequests,
  fetchTicketEvidenceAssessments,
  MerchantRiskProfileRecord,
  refreshAllMerchantRiskProfiles,
  refreshMerchantRiskProfile,
  TicketEvidenceAssessmentRecord,
  updateDisputeSlaPolicy,
  BusinessVerificationTierRecord,
} from "@/lib/firebase/growth-repositories";
import { SupportTicketRecord } from "@/lib/firebase/repositories";

const fieldClass =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15";

export function AdminRiskOperationsPanel() {
  const { user, hasFirebaseConfig } = useAuth();
  const [policy, setPolicy] = useState<DisputeSlaPolicyRecord | null>(null);
  const [breaches, setBreaches] = useState<DisputeSlaBreachRecord[]>([]);
  const [riskProfiles, setRiskProfiles] = useState<MerchantRiskProfileRecord[]>([]);
  const [tierRequests, setTierRequests] = useState<BusinessVerificationTierRecord[]>([]);
  const [tickets, setTickets] = useState<SupportTicketRecord[]>([]);
  const [assessments, setAssessments] = useState<TicketEvidenceAssessmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [firstResponseHours, setFirstResponseHours] = useState("24");
  const [adminEscalationHours, setAdminEscalationHours] = useState("48");
  const [autoRefundHours, setAutoRefundHours] = useState("96");

  const load = useCallback(async () => {
    if (!user || !hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [policyRow, breachRows, riskRows, tierRows, ticketRows, assessmentRows] =
        await Promise.all([
          fetchDisputeSlaPolicy(),
          fetchDisputeSlaBreaches(80),
          fetchMerchantRiskProfiles(100),
          fetchPendingTierRequests(80),
          fetchOpenDisputeTickets(80),
          fetchTicketEvidenceAssessments(80),
        ]);
      setPolicy(policyRow);
      setBreaches(breachRows);
      setRiskProfiles(riskRows);
      setTierRequests(tierRows);
      setTickets(ticketRows);
      setAssessments(assessmentRows);
      setFirstResponseHours(String(policyRow.firstResponseHours));
      setAdminEscalationHours(String(policyRow.adminEscalationHours));
      setAutoRefundHours(String(policyRow.autoRefundHours));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load risk operations.");
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function savePolicy(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await updateDisputeSlaPolicy({
        adminUid: user.uid,
        firstResponseHours: Number(firstResponseHours),
        adminEscalationHours: Number(adminEscalationHours),
        autoRefundHours: Number(autoRefundHours),
      });
      setInfo("SLA policy updated.");
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save SLA policy.");
    } finally {
      setBusy(false);
    }
  }

  async function runSlaEvaluation() {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const rows = await evaluateDisputeSlaBreaches(user.uid, 180);
      setInfo(`SLA evaluation complete: ${rows.length} breach record(s) updated.`);
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to run SLA evaluation.");
    } finally {
      setBusy(false);
    }
  }

  if (!hasFirebaseConfig) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        Firebase config missing. Add `NEXT_PUBLIC_FIREBASE_*` values first.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Risk Operations</h1>
        <p className="mt-2 text-sm text-muted">
          Manage tier approvals, SLA disputes, evidence scoring, and merchant risk intelligence.
        </p>
      </section>

      {loading && (
        <p className="rounded-2xl border border-border bg-surface p-3 text-sm text-muted">
          Loading risk operations...
        </p>
      )}
      {info && <p className="rounded-2xl border border-brand/40 bg-brand/10 p-3 text-sm">{info}</p>}
      {error && (
        <p className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={savePolicy} className="glass rounded-3xl p-6 space-y-3">
          <h2 className="text-sm font-semibold">3. SLA Dispute Engine</h2>
          <p className="text-xs text-muted">
            Current SLA: {policy?.firstResponseHours ?? 24}h response, {policy?.adminEscalationHours ?? 48}h escalation, {policy?.autoRefundHours ?? 96}h auto-refund.
          </p>
          <input value={firstResponseHours} onChange={(event) => setFirstResponseHours(event.target.value)} type="number" min={1} placeholder="First response SLA (hours)" className={fieldClass} />
          <input value={adminEscalationHours} onChange={(event) => setAdminEscalationHours(event.target.value)} type="number" min={1} placeholder="Admin escalation SLA (hours)" className={fieldClass} />
          <input value={autoRefundHours} onChange={(event) => setAutoRefundHours(event.target.value)} type="number" min={1} placeholder="Auto-refund SLA (hours)" className={fieldClass} />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white">Save SLA</button>
            <button type="button" disabled={busy} onClick={() => void runSlaEvaluation()} className="rounded-xl border border-border px-3 py-2 text-xs">Evaluate now</button>
          </div>
          <div className="max-h-32 space-y-2 overflow-y-auto pr-1">
            {breaches.slice(0, 6).map((row) => (
              <div key={row.id} className="rounded-xl border border-border bg-surface p-2 text-xs">
                <p className="font-medium">{row.ticketId} | {row.breachStage}</p>
                <p className="text-muted">{row.businessName} | {row.ageHours}h</p>
              </div>
            ))}
          </div>
        </form>

        <section className="glass rounded-3xl p-6 space-y-3">
          <h2 className="text-sm font-semibold">1. Tier Request Approvals</h2>
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {tierRequests.map((row) => (
              <div key={row.id} className="rounded-xl border border-border bg-surface p-2 text-xs">
                <p className="font-medium">{row.businessName}</p>
                <p className="text-muted">
                  {row.currentTier} {"->"} {row.requestedTier}
                </p>
                {row.requestedNote && <p className="text-muted">{row.requestedNote}</p>}
                <div className="mt-1 flex gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => user && adminReviewTierRequest({
                      businessId: row.businessId,
                      decision: "approved",
                      adminUid: user.uid,
                      adminName: user.displayName ?? "Admin",
                    }).then(load)}
                    className="rounded-lg border border-border px-2 py-1"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => user && adminReviewTierRequest({
                      businessId: row.businessId,
                      decision: "rejected",
                      adminUid: user.uid,
                      adminName: user.displayName ?? "Admin",
                      reason: "Needs additional verification documents",
                    }).then(load)}
                    className="rounded-lg border border-danger/40 px-2 py-1 text-danger"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
            {!tierRequests.length && (
              <p className="rounded-xl border border-border bg-surface p-2 text-xs text-muted">
                No pending tier requests.
              </p>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="glass rounded-3xl p-6 space-y-3">
          <h2 className="text-sm font-semibold">4. AI Evidence Checker (Heuristic)</h2>
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {tickets.slice(0, 10).map((ticket) => (
              <div key={ticket.id} className="rounded-xl border border-border bg-surface p-2 text-xs">
                <p className="font-medium">{ticket.title}</p>
                <p className="text-muted">{ticket.businessName} | proofs {ticket.evidenceUrls.length}</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => user && analyzeTicketEvidence({
                    ticketId: ticket.id,
                    adminUid: user.uid,
                    adminName: user.displayName ?? "Admin",
                  }).then(load)}
                  className="mt-1 rounded-lg border border-border px-2 py-1"
                >
                  Analyze evidence
                </button>
              </div>
            ))}
          </div>
          <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
            {assessments.slice(0, 6).map((row) => (
              <div key={row.id} className="rounded-xl border border-border bg-surface p-2 text-xs">
                <p className="font-medium">{row.ticketId} | score {row.evidenceScore} | {row.confidence}</p>
                <p className="text-muted">{row.recommendation}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="glass rounded-3xl p-6 space-y-3">
          <h2 className="text-sm font-semibold">5. Merchant Risk Scoreboard</h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => user && refreshAllMerchantRiskProfiles(100).then(load)}
            className="rounded-xl border border-border px-3 py-2 text-xs"
          >
            Refresh all risk profiles
          </button>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {riskProfiles.map((row) => (
              <div key={row.id} className="rounded-xl border border-border bg-surface p-2 text-xs">
                <p className="font-medium">{row.businessName}</p>
                <p className="text-muted">
                  Risk {row.riskScore} ({row.riskBand}) | Refund {row.refundRatePercent}% | Open tickets {row.openTickets}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => refreshMerchantRiskProfile(row.ownerUid).then(load)}
                  className="mt-1 rounded-lg border border-border px-2 py-1"
                >
                  Recompute
                </button>
              </div>
            ))}
            {!riskProfiles.length && (
              <p className="rounded-xl border border-border bg-surface p-2 text-xs text-muted">
                No risk profiles yet.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
