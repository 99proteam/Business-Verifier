"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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

export function VerificationQueue() {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<BusinessApplicationRecord[]>([]);
  const [checklistState, setChecklistState] = useState<Record<string, VerificationChecklist>>(
    {},
  );
  const [notesState, setNotesState] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
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
      setMessage(
        error instanceof Error ? error.message : "Unable to load verification queue.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  function updateChecklist(
    applicationId: string,
    key: keyof VerificationChecklist,
    value: boolean,
  ) {
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
      setMessage("Please sign in first.");
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
      setMessage("Verification checklist saved.");
      await loadQueue();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to save verification checklist right now.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const approve = async (applicationId: string) => {
    if (!user) {
      setMessage("Please sign in first.");
      return;
    }
    const checklist = checklistState[applicationId] ?? emptyChecklist();
    if (!isVerificationChecklistComplete(checklist)) {
      setMessage("Complete all checklist items and save checklist before certificate issuance.");
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
      setMessage(`Certificate issued: ${cert.serial}`);
      await loadQueue();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to approve application right now.",
      );
    } finally {
      setBusyId(null);
    }
  };

  if (!hasFirebaseConfig) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        Firebase is not configured. Add `.env.local` values before loading admin queue.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        Loading verification queue...
      </div>
    );
  }

  return (
    <section className="space-y-4">
      {message && (
        <div className="rounded-2xl border border-brand/40 bg-brand/10 p-3 text-sm">
          {message}
        </div>
      )}

      {!rows.length && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          No pending applications at the moment.
        </div>
      )}

      {rows.map((row) => {
        const checklist = checklistState[row.id] ?? row.verificationChecklist ?? emptyChecklist();
        const checklistComplete = isVerificationChecklistComplete(checklist);
        return (
          <article key={row.id} className="glass rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">{row.businessName}</h2>
                <p className="text-sm text-muted">
                  {row.mode} | {row.stage} | {row.city}, {row.country}
                </p>
              </div>
              <button
                type="button"
                disabled={busyId === `approve_${row.id}` || !checklistComplete}
                onClick={() => approve(row.id)}
                className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-70"
              >
                {busyId === `approve_${row.id}` ? "Issuing..." : "Approve + issue certificate"}
              </button>
            </div>

            <div className="mt-3 grid gap-2 text-sm text-muted md:grid-cols-2">
              <p>Category: {row.category}</p>
              <p>Years in field: {row.yearsInField}</p>
              <p>Support email: {row.supportEmail}</p>
              <p>Support phone: {row.supportPhone}</p>
              <p>Address: {row.address}</p>
              <p>Bank account last 4: {row.bankAccountLast4}</p>
              <p>Pro plan: {row.wantsProPlan ? "Yes" : "No"}</p>
              {row.wantsProPlan && (
                <>
                  <p>Initial deposit: INR {row.proDepositAmount ?? 0}</p>
                  <p>Lock months: {row.proDepositLockMonths ?? 6}</p>
                </>
              )}
            </div>

            <div className="mt-3 rounded-2xl border border-border bg-surface p-3">
              <p className="text-xs text-muted">Public document summary</p>
              <p className="mt-1 text-sm">{row.publicDocumentsSummary || "Not provided"}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(row.publicDocumentUrls ?? []).map((url, index) => (
                  <Link
                    key={`${row.id}_doc_${index}`}
                    href={url}
                    target="_blank"
                    className="rounded-lg border border-border px-2 py-1 text-xs transition hover:border-brand/40"
                  >
                    Document {index + 1}
                  </Link>
                ))}
                {!row.publicDocumentUrls?.length && (
                  <span className="text-xs text-danger">No document files uploaded yet.</span>
                )}
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-border bg-surface p-3">
              <p className="text-sm font-medium">Verification checklist</p>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checklist.mobileVerified}
                    onChange={(event) =>
                      updateChecklist(row.id, "mobileVerified", event.target.checked)
                    }
                  />
                  Mobile verified
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checklist.addressVerified}
                    onChange={(event) =>
                      updateChecklist(row.id, "addressVerified", event.target.checked)
                    }
                  />
                  Address verified
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checklist.bankAccountVerified}
                    onChange={(event) =>
                      updateChecklist(row.id, "bankAccountVerified", event.target.checked)
                    }
                  />
                  Bank account verified
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checklist.businessInfoVerified}
                    onChange={(event) =>
                      updateChecklist(row.id, "businessInfoVerified", event.target.checked)
                    }
                  />
                  Business info verified
                </label>
                <label className="flex items-center gap-2 text-sm md:col-span-2">
                  <input
                    type="checkbox"
                    checked={checklist.publicDocumentsVerified}
                    onChange={(event) =>
                      updateChecklist(row.id, "publicDocumentsVerified", event.target.checked)
                    }
                  />
                  Public documents verified
                </label>
              </div>
              <textarea
                rows={2}
                value={notesState[row.id] ?? ""}
                onChange={(event) =>
                  setNotesState((previous) => ({
                    ...previous,
                    [row.id]: event.target.value,
                  }))
                }
                placeholder="Optional admin notes..."
                className="mt-3 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busyId === `checklist_${row.id}`}
                  onClick={() => void saveChecklist(row.id)}
                  className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
                >
                  {busyId === `checklist_${row.id}` ? "Saving..." : "Save checklist"}
                </button>
                <span
                  className={`text-xs ${checklistComplete ? "text-brand-strong" : "text-danger"}`}
                >
                  {checklistComplete
                    ? "Checklist complete - ready for certificate issuance."
                    : "Checklist incomplete - approval disabled."}
                </span>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
