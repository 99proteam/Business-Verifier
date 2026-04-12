"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  addComplianceDocument,
  ComplianceDocumentRecord,
  ComplianceProfileRecord,
  createBusinessTrustTimelineEvent,
  createCrmCampaign,
  createCrmLead,
  createReferralInvite,
  createScopedIntegrationApiKey,
  CrmCampaignRecord,
  CrmLeadRecord,
  CrmSegmentRecord,
  fetchBusinessTrustTimelineByOwner,
  fetchBusinessVerificationTierByOwner,
  fetchComplianceDocumentsByOwner,
  fetchComplianceProfileByOwner,
  fetchCrmCampaignsByOwner,
  fetchCrmLeadsByOwner,
  fetchCrmSegmentsByOwner,
  fetchReferralInvitesByOwner,
  fetchReferralProgramByOwner,
  fetchScopedIntegrationApiKeys,
  fetchWidgetConversionAnalyticsByOwner,
  ReferralInviteRecord,
  ReferralProgramRecord,
  requestBusinessVerificationTier,
  revokeScopedIntegrationApiKey,
  rotateScopedIntegrationApiKey,
  ScopedIntegrationApiKeyRecord,
  TrustTimelineEventRecord,
  upsertComplianceProfile,
  upsertCrmSegment,
  upsertReferralProgram,
  VerificationTierKey,
  WidgetConversionAnalyticsRecord,
} from "@/lib/firebase/growth-repositories";

const fieldClass =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15";

export function BusinessGrowthSuite() {
  const { user, hasFirebaseConfig } = useAuth();
  const [tier, setTier] = useState<Awaited<ReturnType<typeof fetchBusinessVerificationTierByOwner>>>(null);
  const [timeline, setTimeline] = useState<TrustTimelineEventRecord[]>([]);
  const [apiKeys, setApiKeys] = useState<ScopedIntegrationApiKeyRecord[]>([]);
  const [widget, setWidget] = useState<WidgetConversionAnalyticsRecord | null>(null);
  const [leads, setLeads] = useState<CrmLeadRecord[]>([]);
  const [segments, setSegments] = useState<CrmSegmentRecord[]>([]);
  const [campaigns, setCampaigns] = useState<CrmCampaignRecord[]>([]);
  const [referralProgram, setReferralProgram] = useState<ReferralProgramRecord | null>(null);
  const [referralInvites, setReferralInvites] = useState<ReferralInviteRecord[]>([]);
  const [complianceProfile, setComplianceProfile] = useState<ComplianceProfileRecord | null>(null);
  const [complianceDocs, setComplianceDocs] = useState<ComplianceDocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);

  const [tierRequest, setTierRequest] = useState<VerificationTierKey>("advanced");
  const [tierNote, setTierNote] = useState("");
  const [timelineType, setTimelineType] = useState<"verification" | "compliance" | "refund_resolution" | "certificate" | "milestone">("milestone");
  const [timelineTitle, setTimelineTitle] = useState("");
  const [timelineDetail, setTimelineDetail] = useState("");
  const [apiLabel, setApiLabel] = useState("Primary integration key");
  const [apiScopes, setApiScopes] = useState("auth.verify,notifications.send,bookings.read");
  const [apiExpiry, setApiExpiry] = useState("");

  const [leadName, setLeadName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadSource, setLeadSource] = useState("website");
  const [leadNote, setLeadNote] = useState("");
  const [segmentName, setSegmentName] = useState("");
  const [segmentCriteria, setSegmentCriteria] = useState("");
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignMessage, setCampaignMessage] = useState("");
  const [campaignSegmentId, setCampaignSegmentId] = useState("");

  const [referralActive, setReferralActive] = useState(true);
  const [referralCommission, setReferralCommission] = useState("10");
  const [referralBonus, setReferralBonus] = useState("200");
  const [referralInviteEmail, setReferralInviteEmail] = useState("");

  const [complianceCountry, setComplianceCountry] = useState("IN");
  const [complianceType, setComplianceType] = useState("private_limited");
  const [kycStatus, setKycStatus] = useState<ComplianceProfileRecord["kycStatus"]>("pending");
  const [kybStatus, setKybStatus] = useState<ComplianceProfileRecord["kybStatus"]>("pending");
  const [complianceNotes, setComplianceNotes] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [docType, setDocType] = useState("kyc");
  const [docUrl, setDocUrl] = useState("");

  const scopes = useMemo(
    () => apiScopes.split(",").map((entry) => entry.trim()).filter(Boolean),
    [apiScopes],
  );

  const load = useCallback(async () => {
    if (!user || !hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [
        tierRow,
        timelineRows,
        keyRows,
        widgetStats,
        leadRows,
        segmentRows,
        campaignRows,
        referralRow,
        inviteRows,
        complianceRow,
        documentRows,
      ] = await Promise.all([
        fetchBusinessVerificationTierByOwner(user.uid),
        fetchBusinessTrustTimelineByOwner(user.uid, 40),
        fetchScopedIntegrationApiKeys(user.uid, 40),
        fetchWidgetConversionAnalyticsByOwner(user.uid, 30),
        fetchCrmLeadsByOwner(user.uid, 80),
        fetchCrmSegmentsByOwner(user.uid, 30),
        fetchCrmCampaignsByOwner(user.uid, 30),
        fetchReferralProgramByOwner(user.uid),
        fetchReferralInvitesByOwner(user.uid, 50),
        fetchComplianceProfileByOwner(user.uid),
        fetchComplianceDocumentsByOwner(user.uid, 40),
      ]);
      setTier(tierRow);
      setTimeline(timelineRows);
      setApiKeys(keyRows);
      setWidget(widgetStats);
      setLeads(leadRows);
      setSegments(segmentRows);
      setCampaigns(campaignRows);
      setReferralProgram(referralRow);
      setReferralInvites(inviteRows);
      setComplianceProfile(complianceRow);
      setComplianceDocs(documentRows);
      if (referralRow) {
        setReferralActive(referralRow.active);
        setReferralCommission(String(referralRow.commissionPercent));
        setReferralBonus(String(referralRow.signupBonusInr));
      }
      if (complianceRow) {
        setComplianceCountry(complianceRow.countryCode || "IN");
        setComplianceType(complianceRow.businessType || "private_limited");
        setKycStatus(complianceRow.kycStatus);
        setKybStatus(complianceRow.kybStatus);
        setComplianceNotes(complianceRow.notes ?? "");
      }
      if (segmentRows.length) {
        setCampaignSegmentId(segmentRows[0].id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load growth suite.");
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function requestTier(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await requestBusinessVerificationTier({
        ownerUid: user.uid,
        requestedTier: tierRequest,
        note: tierNote || undefined,
      });
      setInfo("Tier request submitted for admin review.");
      setTierNote("");
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit tier request.");
    } finally {
      setBusy(false);
    }
  }

  async function createTimelineEvent(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await createBusinessTrustTimelineEvent({
        ownerUid: user.uid,
        createdByUid: user.uid,
        createdByName: user.displayName ?? "Business Owner",
        eventType: timelineType,
        title: timelineTitle,
        detail: timelineDetail,
        visibility: "public",
      });
      setInfo("Timeline event added.");
      setTimelineTitle("");
      setTimelineDetail("");
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save timeline event.");
    } finally {
      setBusy(false);
    }
  }

  async function createApiKey(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    setNewKeyValue(null);
    try {
      const created = await createScopedIntegrationApiKey({
        ownerUid: user.uid,
        label: apiLabel,
        scopes,
        expiresAt: apiExpiry || undefined,
      });
      setInfo("API key created. Copy it now.");
      setNewKeyValue(created.keyValue);
      setApiLabel("Primary integration key");
      setApiScopes("auth.verify,notifications.send,bookings.read");
      setApiExpiry("");
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create API key.");
    } finally {
      setBusy(false);
    }
  }

  async function onCreateLead(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await createCrmLead({
        ownerUid: user.uid,
        name: leadName,
        email: leadEmail,
        source: leadSource,
        note: leadNote || undefined,
      });
      setInfo("Lead created.");
      setLeadName("");
      setLeadEmail("");
      setLeadSource("website");
      setLeadNote("");
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create lead.");
    } finally {
      setBusy(false);
    }
  }

  async function onCreateSegment(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const id = await upsertCrmSegment({
        ownerUid: user.uid,
        name: segmentName,
        criteria: segmentCriteria,
        active: true,
      });
      setInfo("CRM segment saved.");
      setSegmentName("");
      setSegmentCriteria("");
      setCampaignSegmentId(id);
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save segment.");
    } finally {
      setBusy(false);
    }
  }

  async function onCreateCampaign(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await createCrmCampaign({
        ownerUid: user.uid,
        title: campaignTitle,
        message: campaignMessage,
        targetSegmentId: campaignSegmentId || undefined,
        status: "draft",
      });
      setInfo("Campaign saved as draft.");
      setCampaignTitle("");
      setCampaignMessage("");
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save campaign.");
    } finally {
      setBusy(false);
    }
  }

  async function saveReferralProgram(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await upsertReferralProgram({
        ownerUid: user.uid,
        active: referralActive,
        commissionPercent: Number(referralCommission),
        signupBonusInr: Number(referralBonus),
      });
      setInfo("Referral program saved.");
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save referral settings.");
    } finally {
      setBusy(false);
    }
  }

  async function inviteReferral(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const code = await createReferralInvite({
        ownerUid: user.uid,
        inviteeEmail: referralInviteEmail,
      });
      setInfo(`Referral invite created: ${code}`);
      setReferralInviteEmail("");
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create invite.");
    } finally {
      setBusy(false);
    }
  }

  async function saveComplianceProfile(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await upsertComplianceProfile({
        ownerUid: user.uid,
        countryCode: complianceCountry,
        businessType: complianceType,
        kycStatus,
        kybStatus,
        notes: complianceNotes || undefined,
      });
      setInfo("Compliance profile updated.");
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to update compliance profile.");
    } finally {
      setBusy(false);
    }
  }

  async function addComplianceDoc(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await addComplianceDocument({
        ownerUid: user.uid,
        title: docTitle,
        documentType: docType,
        url: docUrl,
      });
      setInfo("Compliance document submitted.");
      setDocTitle("");
      setDocType("kyc");
      setDocUrl("");
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit document.");
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
        <h1 className="text-2xl font-semibold tracking-tight">Business Growth Suite</h1>
        <p className="mt-2 text-sm text-muted">
          Verification tiers, trust timeline, API keys, widget conversion, CRM, referrals, and compliance center.
        </p>
      </section>

      {loading && (
        <p className="rounded-2xl border border-border bg-surface p-3 text-sm text-muted">
          Loading growth suite...
        </p>
      )}
      {info && <p className="rounded-2xl border border-brand/40 bg-brand/10 p-3 text-sm">{info}</p>}
      {error && (
        <p className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
      {newKeyValue && (
        <p className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
          New API key: <span className="font-mono">{newKeyValue}</span>
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={requestTier} className="glass rounded-3xl p-6 space-y-3">
          <h2 className="text-sm font-semibold">1. Verification Tier Request</h2>
          <p className="text-xs text-muted">
            Current tier: <b>{tier?.currentTier ?? "basic"}</b> | Status: <b>{tier?.status ?? "approved"}</b>
          </p>
          <select
            value={tierRequest}
            onChange={(event) => setTierRequest(event.target.value as VerificationTierKey)}
            className={fieldClass}
          >
            <option value="advanced">Advanced</option>
            <option value="pro_escrow">Pro Escrow</option>
          </select>
          <textarea
            value={tierNote}
            onChange={(event) => setTierNote(event.target.value)}
            rows={2}
            placeholder="Reason for tier upgrade"
            className={fieldClass}
          />
          <button type="submit" disabled={busy} className="rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white">
            Submit tier request
          </button>
        </form>

        <form onSubmit={createTimelineEvent} className="glass rounded-3xl p-6 space-y-3">
          <h2 className="text-sm font-semibold">2. Public Trust Timeline</h2>
          <select
            value={timelineType}
            onChange={(event) => setTimelineType(event.target.value as typeof timelineType)}
            className={fieldClass}
          >
            <option value="milestone">Milestone</option>
            <option value="verification">Verification</option>
            <option value="compliance">Compliance</option>
            <option value="certificate">Certificate</option>
            <option value="refund_resolution">Refund resolution</option>
          </select>
          <input value={timelineTitle} onChange={(event) => setTimelineTitle(event.target.value)} placeholder="Event title" className={fieldClass} />
          <textarea value={timelineDetail} onChange={(event) => setTimelineDetail(event.target.value)} rows={2} placeholder="Event detail" className={fieldClass} />
          <button type="submit" disabled={busy} className="rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white">
            Add timeline event
          </button>
          <div className="max-h-36 space-y-2 overflow-y-auto pr-1">
            {timeline.slice(0, 6).map((item) => (
              <div key={item.id} className="rounded-xl border border-border bg-surface p-2 text-xs">
                <p className="font-medium">{item.title}</p>
                <p className="text-muted">{item.eventType} | {new Date(item.createdAt).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </form>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={createApiKey} className="glass rounded-3xl p-6 space-y-3">
          <h2 className="text-sm font-semibold">6. API Key Management v2</h2>
          <input value={apiLabel} onChange={(event) => setApiLabel(event.target.value)} placeholder="Key label" className={fieldClass} />
          <input value={apiScopes} onChange={(event) => setApiScopes(event.target.value)} placeholder="Scopes comma separated" className={fieldClass} />
          <input type="date" value={apiExpiry} onChange={(event) => setApiExpiry(event.target.value)} className={fieldClass} />
          <button type="submit" disabled={busy} className="rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white">
            Create API key
          </button>
          <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
            {apiKeys.map((row) => (
              <div key={row.id} className="rounded-xl border border-border bg-surface p-2 text-xs">
                <p className="font-medium">{row.label}</p>
                <p className="text-muted">{row.active ? "active" : "revoked"} | scopes: {row.scopes.join(", ")}</p>
                <p className="font-mono text-[11px]">{row.keyValue ? `${row.keyValue.slice(0, 12)}...` : "-"}</p>
                <div className="mt-1 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => user && rotateScopedIntegrationApiKey({ ownerUid: user.uid, keyId: row.id }).then((value) => { setNewKeyValue(value); void load(); })}
                    className="rounded-lg border border-border px-2 py-1"
                  >
                    Rotate
                  </button>
                  <button
                    type="button"
                    onClick={() => user && revokeScopedIntegrationApiKey({ ownerUid: user.uid, keyId: row.id }).then(() => load())}
                    className="rounded-lg border border-danger/40 px-2 py-1 text-danger"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        </form>

        <section className="glass rounded-3xl p-6 space-y-3">
          <h2 className="text-sm font-semibold">7. Widget Conversion Analytics</h2>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-xl border border-border bg-surface p-2">
              <p className="text-muted">Impressions</p>
              <p className="font-semibold">{widget?.totalImpressions ?? 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-2">
              <p className="text-muted">Clicks</p>
              <p className="font-semibold">{widget?.totalClicks ?? 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-2">
              <p className="text-muted">Orders</p>
              <p className="font-semibold">{widget?.totalOrders ?? 0}</p>
            </div>
          </div>
          <p className="text-xs text-muted">CTR {widget?.ctrPercent ?? 0}% | Click-to-order {widget?.clickToOrderPercent ?? 0}%</p>
          <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
            {widget?.daily.slice(0, 8).map((row) => (
              <div key={row.dateKey} className="rounded-xl border border-border bg-surface p-2 text-xs">
                <p className="font-medium">{row.dateKey}</p>
                <p className="text-muted">Imp {row.impressions} | Clicks {row.clicks} | Orders {row.orders}</p>
              </div>
            ))}
            {!widget && <p className="text-xs text-muted">No widget data yet.</p>}
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="glass rounded-3xl p-6 space-y-3">
          <h2 className="text-sm font-semibold">8. CRM Leads and Campaigns</h2>
          <form onSubmit={onCreateLead} className="grid gap-2">
            <input value={leadName} onChange={(event) => setLeadName(event.target.value)} placeholder="Lead name" className={fieldClass} />
            <input value={leadEmail} onChange={(event) => setLeadEmail(event.target.value)} placeholder="Lead email" className={fieldClass} />
            <input value={leadSource} onChange={(event) => setLeadSource(event.target.value)} placeholder="Source (website/ad/referral)" className={fieldClass} />
            <input value={leadNote} onChange={(event) => setLeadNote(event.target.value)} placeholder="Lead note (optional)" className={fieldClass} />
            <button type="submit" disabled={busy} className="rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white">Add lead</button>
          </form>
          <div className="max-h-32 space-y-2 overflow-y-auto pr-1">
            {leads.slice(0, 5).map((lead) => (
              <div key={lead.id} className="rounded-xl border border-border bg-surface p-2 text-xs">
                <p className="font-medium">{lead.name} ({lead.status})</p>
                <p className="text-muted">{lead.email} | {lead.source}</p>
              </div>
            ))}
          </div>

          <form onSubmit={onCreateSegment} className="grid gap-2 pt-2 border-t border-border">
            <input value={segmentName} onChange={(event) => setSegmentName(event.target.value)} placeholder="Segment name" className={fieldClass} />
            <input value={segmentCriteria} onChange={(event) => setSegmentCriteria(event.target.value)} placeholder="Criteria" className={fieldClass} />
            <button type="submit" disabled={busy} className="rounded-xl border border-border px-3 py-2 text-xs">Save segment</button>
          </form>

          <form onSubmit={onCreateCampaign} className="grid gap-2 pt-2 border-t border-border">
            <input value={campaignTitle} onChange={(event) => setCampaignTitle(event.target.value)} placeholder="Campaign title" className={fieldClass} />
            <textarea value={campaignMessage} onChange={(event) => setCampaignMessage(event.target.value)} rows={2} placeholder="Campaign message" className={fieldClass} />
            <select value={campaignSegmentId} onChange={(event) => setCampaignSegmentId(event.target.value)} className={fieldClass}>
              <option value="">All customers</option>
              {segments.map((segment) => (
                <option key={segment.id} value={segment.id}>{segment.name}</option>
              ))}
            </select>
            <button type="submit" disabled={busy} className="rounded-xl border border-border px-3 py-2 text-xs">Save campaign</button>
          </form>
          <div className="max-h-28 space-y-2 overflow-y-auto pr-1">
            {campaigns.slice(0, 4).map((campaign) => (
              <div key={campaign.id} className="rounded-xl border border-border bg-surface p-2 text-xs">
                <p className="font-medium">{campaign.title}</p>
                <p className="text-muted">{campaign.status}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="glass rounded-3xl p-6 space-y-3">
          <h2 className="text-sm font-semibold">9. Referral and Affiliate Program</h2>
          <form onSubmit={saveReferralProgram} className="grid gap-2">
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={referralActive} onChange={(event) => setReferralActive(event.target.checked)} />
              Program active
            </label>
            <input value={referralCommission} onChange={(event) => setReferralCommission(event.target.value)} type="number" min={0} placeholder="Commission %" className={fieldClass} />
            <input value={referralBonus} onChange={(event) => setReferralBonus(event.target.value)} type="number" min={0} placeholder="Signup bonus INR" className={fieldClass} />
            <button type="submit" disabled={busy} className="rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white">Save referral settings</button>
          </form>
          <p className="text-xs text-muted">
            Current: {referralProgram ? `${referralProgram.commissionPercent}% + INR ${referralProgram.signupBonusInr}` : "Not configured"}
          </p>
          <form onSubmit={inviteReferral} className="grid gap-2 border-t border-border pt-2">
            <input value={referralInviteEmail} onChange={(event) => setReferralInviteEmail(event.target.value)} placeholder="Invitee email" className={fieldClass} />
            <button type="submit" disabled={busy} className="rounded-xl border border-border px-3 py-2 text-xs">Generate invite code</button>
          </form>
          <div className="max-h-32 space-y-2 overflow-y-auto pr-1">
            {referralInvites.slice(0, 6).map((invite) => (
              <div key={invite.id} className="rounded-xl border border-border bg-surface p-2 text-xs">
                <p className="font-mono">{invite.code}</p>
                <p className="text-muted">{invite.inviteeEmail} | {invite.status}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="glass rounded-3xl p-6 space-y-3">
        <h2 className="text-sm font-semibold">10. Compliance Center (KYC/KYB)</h2>
        {complianceProfile && (
          <p className="text-xs text-muted">
            Current profile: {complianceProfile.countryCode} | KYC {complianceProfile.kycStatus} | KYB {complianceProfile.kybStatus}
          </p>
        )}
        <form onSubmit={saveComplianceProfile} className="grid gap-2 md:grid-cols-2">
          <input value={complianceCountry} onChange={(event) => setComplianceCountry(event.target.value.toUpperCase())} placeholder="Country code" className={fieldClass} />
          <input value={complianceType} onChange={(event) => setComplianceType(event.target.value)} placeholder="Business type" className={fieldClass} />
          <select value={kycStatus} onChange={(event) => setKycStatus(event.target.value as ComplianceProfileRecord["kycStatus"])} className={fieldClass}>
            <option value="pending">KYC pending</option>
            <option value="submitted">KYC submitted</option>
            <option value="verified">KYC verified</option>
            <option value="rejected">KYC rejected</option>
          </select>
          <select value={kybStatus} onChange={(event) => setKybStatus(event.target.value as ComplianceProfileRecord["kybStatus"])} className={fieldClass}>
            <option value="pending">KYB pending</option>
            <option value="submitted">KYB submitted</option>
            <option value="verified">KYB verified</option>
            <option value="rejected">KYB rejected</option>
          </select>
          <textarea value={complianceNotes} onChange={(event) => setComplianceNotes(event.target.value)} rows={2} placeholder="Compliance notes" className={`${fieldClass} md:col-span-2`} />
          <button type="submit" disabled={busy} className="rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white md:col-span-2">Save compliance profile</button>
        </form>

        <form onSubmit={addComplianceDoc} className="grid gap-2 border-t border-border pt-3 md:grid-cols-3">
          <input value={docTitle} onChange={(event) => setDocTitle(event.target.value)} placeholder="Document title" className={fieldClass} />
          <input value={docType} onChange={(event) => setDocType(event.target.value)} placeholder="Document type" className={fieldClass} />
          <input value={docUrl} onChange={(event) => setDocUrl(event.target.value)} placeholder="Secure document URL" className={fieldClass} />
          <button type="submit" disabled={busy} className="rounded-xl border border-border px-3 py-2 text-xs md:col-span-3">Submit compliance document</button>
        </form>
        <div className="grid gap-2 md:grid-cols-2">
          {complianceDocs.slice(0, 8).map((doc) => (
            <div key={doc.id} className="rounded-xl border border-border bg-surface p-2 text-xs">
              <p className="font-medium">{doc.title}</p>
              <p className="text-muted">{doc.documentType} | {doc.status}</p>
            </div>
          ))}
          {!complianceDocs.length && (
            <p className="rounded-xl border border-border bg-surface p-2 text-xs text-muted">
              No compliance documents submitted yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
