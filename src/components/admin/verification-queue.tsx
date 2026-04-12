"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  MapPin,
  Phone,
  RefreshCw,
  Shield,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  adminUpdateBusinessVerificationChecklist,
  BusinessApplicationRecord,
  fetchBusinessApplications,
  isVerificationChecklistComplete,
  issueCertificateForApplication,
  VerificationChecklist,
} from "@/lib/firebase/repositories";

function emptyChecklist(): VerificationChecklist {
  return {
    mobileVerified: false,
    addressVerified: false,
    bankAccountVerified: false,
    businessInfoVerified: false,
    publicDocumentsVerified: false,
  };
}

const checklistItems: { key: keyof VerificationChecklist; label: string; icon: React.ElementType }[] = [
  { key: "mobileVerified", label: "Mobile Verified", icon: Phone },
  { key: "addressVerified", label: "Address Verified", icon: MapPin },
  { key: "bankAccountVerified", label: "Bank Account Verified", icon: Shield },
  { key: "businessInfoVerified", label: "Business Info Verified", icon: Building2 },
  { key: "publicDocumentsVerified", label: "Public Documents Verified", icon: FileText },
];

export function VerificationQueue() {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<BusinessApplicationRecord[]>([]);
  const [checklistState, setChecklistState] = useState<Record<string, VerificationChecklist>>({});
  const [notesState, setNotesState] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    if (!hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const queue = await fetchBusinessApplications("pending");
      setRows(queue);
      setChecklistState(
        Object.fromEntries(
          queue.map((row) => [row.id, row.verificationChecklist ?? emptyChecklist()]),
        ),
      );
      setNotesState(
        Object.fromEntries(queue.map((row) => [row.id, row.verificationNotes ?? ""])),
      );
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to load verification queue.",
      });
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  function updateChecklist(applicationId: string, key: keyof VerificationChecklist, value: boolean) {
    setChecklistState((previous) => ({
      ...previous,
      [applicationId]: {
        ...emptyChecklist(),
        ...(previous[applicationId] ?? emptyChecklist()),
        [key]: value,
      },
    }));
  }

  const saveChecklist = async (applicationId: string) => {
    if (!user) {
      setMessage({ type: "error", text: "Please sign in first." });
      return;
    }
    const checklist = checklistState[applicationId] ?? emptyChecklist();
    setBusyId(`checklist_${applicationId}`);
    setMessage(null);
    try {
      await adminUpdateBusinessVerificationChecklist({
        applicationId,
        adminUid: user.uid,
        checklist,
        notes: notesState[applicationId] ?? "",
      });
      setMessage({ type: "success", text: "Verification checklist saved successfully." });
      await loadQueue();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to save verification checklist.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const approve = async (applicationId: string) => {
    if (!user) {
      setMessage({ type: "error", text: "Please sign in first." });
      return;
    }
    const checklist = checklistState[applicationId] ?? emptyChecklist();
    if (!isVerificationChecklistComplete(checklist)) {
      setMessage({ type: "error", text: "Complete all checklist items and save before issuing certificate." });
      return;
    }
    setBusyId(`approve_${applicationId}`);
    setMessage(null);
    try {
      await adminUpdateBusinessVerificationChecklist({
        applicationId,
        adminUid: user.uid,
        checklist,
        notes: notesState[applicationId] ?? "",
      });
      const cert = await issueCertificateForApplication(applicationId, user.uid);
      setMessage({ type: "success", text: `Certificate issued: ${cert.serial}` });
      await loadQueue();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to approve application.",
      });
    } finally {
      setBusyId(null);
    }
  };

  if (!hasFirebaseConfig) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4">
        <AlertTriangle size={18} className="shrink-0 text-danger mt-0.5" />
        <div>
          <p className="font-medium text-sm text-danger">Firebase Not Configured</p>
          <p className="text-xs text-danger/80 mt-0.5">Add <code className="font-mono">.env.local</code> values before loading the admin queue.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((n) => (
          <div key={n} className="rounded-2xl border border-border bg-white p-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-6 w-48 rounded-lg shimmer" />
              <div className="h-9 w-36 rounded-xl shimmer" />
            </div>
            <div className="h-4 w-64 rounded-lg shimmer" />
            <div className="grid grid-cols-2 gap-2 mt-3">
              {[1, 2, 3, 4].map((i) => <div key={i} className="h-4 w-full rounded-lg shimmer" />)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <section className="space-y-5">
      {/* Status message */}
      {message && (
        <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
          message.type === "success"
            ? "border-brand/30 bg-brand/5 text-brand-strong"
            : "border-danger/30 bg-danger/5 text-danger"
        }`}>
          {message.type === "success"
            ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
            : <XCircle size={16} className="shrink-0 mt-0.5" />
          }
          <p className="text-sm">{message.text}</p>
        </div>
      )}

      {/* Refresh + count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {rows.length > 0 ? (
            <span><span className="font-semibold text-foreground">{rows.length}</span> applications pending review</span>
          ) : (
            "No pending applications"
          )}
        </p>
        <button
          type="button"
          onClick={() => void loadQueue()}
          className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted transition hover:bg-slate-50 hover:text-foreground"
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      {!rows.length && (
        <div className="rounded-2xl border border-border bg-white p-12 text-center">
          <CheckCircle2 size={36} className="mx-auto text-brand mb-3" />
          <p className="font-semibold text-foreground">All caught up!</p>
          <p className="text-sm text-muted mt-1">No pending verification applications at this time.</p>
        </div>
      )}

      {rows.map((row) => {
        const checklist = checklistState[row.id] ?? row.verificationChecklist ?? emptyChecklist();
        const checklistComplete = isVerificationChecklistComplete(checklist);
        const completedItems = Object.values(checklist).filter(Boolean).length;
        const totalItems = Object.keys(emptyChecklist()).length;

        return (
          <article key={row.id} className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
            {/* Application header */}
            <div className="flex flex-wrap items-start justify-between gap-4 p-6 border-b border-border">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand font-bold text-lg">
                  {row.businessName[0]?.toUpperCase() ?? "B"}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">{row.businessName}</h2>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted capitalize">
                      <Building2 size={10} />
                      {row.mode}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted capitalize">
                      {row.stage}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                      <MapPin size={10} />
                      {row.city}, {row.country}
                    </span>
                    {row.wantsProPlan && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 border border-purple-200 px-2 py-0.5 text-xs text-purple-700 font-medium">
                        Pro Plan
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Progress indicator */}
                <div className="text-right">
                  <p className="text-xs text-muted">Checklist</p>
                  <p className={`text-sm font-bold ${checklistComplete ? "text-brand" : "text-amber-600"}`}>
                    {completedItems}/{totalItems}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busyId === `approve_${row.id}` || !checklistComplete}
                  onClick={() => void approve(row.id)}
                  className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <BadgeCheck size={16} />
                  {busyId === `approve_${row.id}` ? "Issuing..." : "Issue Certificate"}
                </button>
              </div>
            </div>

            {/* Business details */}
            <div className="p-6 border-b border-border">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Business Information</p>
              <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { label: "Category", value: row.category },
                  { label: "Years in Field", value: `${row.yearsInField} years` },
                  { label: "Support Email", value: row.supportEmail },
                  { label: "Support Phone", value: row.supportPhone },
                  { label: "Address", value: row.address },
                  { label: "Bank Account (last 4)", value: row.bankAccountLast4 },
                  ...(row.wantsProPlan ? [
                    { label: "Initial Deposit", value: `₹${row.proDepositAmount ?? 0}` },
                    { label: "Lock Months", value: `${row.proDepositLockMonths ?? 6} months` },
                  ] : []),
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</p>
                    <p className="text-sm text-foreground mt-0.5">{value || "—"}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Documents */}
            <div className="p-6 border-b border-border bg-slate-50">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={15} className="text-muted" />
                <p className="text-xs font-semibold text-muted uppercase tracking-wider">Public Documents</p>
              </div>
              <p className="text-sm text-foreground mb-3">{row.publicDocumentsSummary || "No summary provided."}</p>
              <div className="flex flex-wrap gap-2">
                {(row.publicDocumentUrls ?? []).map((url, index) => (
                  <Link
                    key={`${row.id}_doc_${index}`}
                    href={url}
                    target="_blank"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium transition hover:border-brand/40 hover:text-brand"
                  >
                    <FileText size={12} />
                    Document {index + 1}
                  </Link>
                ))}
                {!row.publicDocumentUrls?.length && (
                  <span className="text-xs text-danger flex items-center gap-1.5">
                    <AlertTriangle size={12} />
                    No document files uploaded yet.
                  </span>
                )}
              </div>
            </div>

            {/* Verification checklist */}
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <ClipboardCheck size={15} className="text-brand" />
                <p className="text-sm font-semibold text-foreground">Verification Checklist</p>
                <div className="ml-auto flex items-center gap-2">
                  {checklistComplete ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand-strong">
                      <CheckCircle2 size={11} />
                      Ready for approval
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                      <AlertTriangle size={11} />
                      {totalItems - completedItems} items remaining
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {checklistItems.map(({ key, label, icon: Icon }) => {
                  const checked = checklist[key];
                  return (
                    <label
                      key={key}
                      className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition ${
                        checked
                          ? "border-brand/30 bg-brand/5"
                          : "border-border bg-slate-50 hover:border-brand/20"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => updateChecklist(row.id, key, event.target.checked)}
                        className="sr-only"
                      />
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        checked ? "bg-brand text-white" : "bg-slate-200 text-slate-400"
                      }`}>
                        <Icon size={14} />
                      </span>
                      <span className={`text-xs font-medium ${checked ? "text-brand-strong" : "text-muted"}`}>
                        {label}
                      </span>
                      {checked && <CheckCircle2 size={13} className="ml-auto text-brand shrink-0" />}
                    </label>
                  );
                })}
              </div>

              {/* Admin notes */}
              <textarea
                rows={2}
                value={notesState[row.id] ?? ""}
                onChange={(event) =>
                  setNotesState((previous) => ({
                    ...previous,
                    [row.id]: event.target.value,
                  }))
                }
                placeholder="Add admin notes (optional)..."
                className="mt-4 w-full rounded-xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 placeholder:text-muted/60"
              />

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  disabled={busyId === `checklist_${row.id}`}
                  onClick={() => void saveChecklist(row.id)}
                  className="flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-medium transition hover:border-brand/40 hover:bg-brand/5 hover:text-brand-strong disabled:opacity-50"
                >
                  <ClipboardCheck size={14} />
                  {busyId === `checklist_${row.id}` ? "Saving..." : "Save Checklist"}
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
