"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  BusinessApplicationRecord,
  fetchBusinessApplications,
  issueCertificateForApplication,
} from "@/lib/firebase/repositories";

export function VerificationQueue() {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<BusinessApplicationRecord[]>([]);
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

  const approve = async (applicationId: string) => {
    if (!user) {
      setMessage("Please sign in first.");
      return;
    }

    setBusyId(applicationId);
    setMessage(null);
    try {
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

      {rows.map((row) => (
        <article key={row.id} className="glass rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{row.businessName}</h2>
              <p className="text-sm text-muted">
                {row.mode} • {row.stage} • {row.city}, {row.country}
              </p>
            </div>
            <button
              type="button"
              disabled={busyId === row.id}
              onClick={() => approve(row.id)}
              className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-70"
            >
              {busyId === row.id ? "Issuing..." : "Approve + issue certificate"}
            </button>
          </div>

          <div className="mt-3 grid gap-2 text-sm text-muted md:grid-cols-2">
            <p>Category: {row.category}</p>
            <p>Years in field: {row.yearsInField}</p>
            <p>Support: {row.supportEmail}</p>
            <p>Pro plan: {row.wantsProPlan ? "Yes" : "No"}</p>
            {row.wantsProPlan && (
              <>
                <p>Initial deposit: INR {row.proDepositAmount ?? 0}</p>
                <p>Lock months: {row.proDepositLockMonths ?? 6}</p>
              </>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
