"use client";

import { useEffect, useState } from "react";
import {
  BusinessApplicationRecord,
  BusinessTrustBadgeRecord,
  ProDepositLedgerRecord,
  fetchBusinessBySlug,
  fetchProDepositLedgerByBusinessId,
  fetchPublicBusinessTrustBadgeBySlug,
} from "@/lib/firebase/repositories";

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function PublicBusinessProfile({ slug }: { slug: string }) {
  const [business, setBusiness] = useState<BusinessApplicationRecord | null>(null);
  const [badge, setBadge] = useState<BusinessTrustBadgeRecord | null>(null);
  const [ledger, setLedger] = useState<ProDepositLedgerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const businessRow = await fetchBusinessBySlug(slug);
        if (!businessRow || businessRow.status !== "approved") {
          if (mounted) {
            setBusiness(null);
            setBadge(null);
            setLedger([]);
          }
          return;
        }
        const [badgeRow, ledgerRows] = await Promise.all([
          fetchPublicBusinessTrustBadgeBySlug(slug),
          fetchProDepositLedgerByBusinessId(businessRow.id),
        ]);
        if (!mounted) return;
        setBusiness(businessRow);
        setBadge(badgeRow);
        setLedger(ledgerRows);
      } catch (loadError) {
        if (mounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load trust profile.",
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        Loading trust profile...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        {error}
      </div>
    );
  }

  if (!business || !badge) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        Business trust profile not found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="glass rounded-3xl p-6">
        <h1 className="text-3xl font-semibold tracking-tight">{business.businessName}</h1>
        <p className="mt-2 text-sm text-muted">
          {business.mode} business | {business.city}, {business.country} | {business.category}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Trust score</p>
            <p className="mt-1 text-xl font-semibold">{badge.trustScore}</p>
          </article>
          <article className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Certificate</p>
            <p className="mt-1 text-sm font-medium">
              {badge.certificateSerial ?? "Pending"}
            </p>
          </article>
          <article className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Locked deposit</p>
            <p className="mt-1 text-sm font-medium">{formatINR(badge.totalLockedDeposit)}</p>
          </article>
          <article className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Available deposit</p>
            <p className="mt-1 text-sm font-medium">{formatINR(badge.totalAvailableDeposit)}</p>
          </article>
        </div>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Public deposit ledger</h2>
        <p className="mt-1 text-xs text-muted">
          Security deposit timeline visible for customer trust and dispute readiness.
        </p>
        <div className="mt-4 space-y-3">
          {!ledger.length && (
            <p className="rounded-2xl border border-border bg-surface p-3 text-sm text-muted">
              No deposit entries yet.
            </p>
          )}
          {ledger.map((entry) => (
            <article key={entry.id} className="rounded-2xl border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {formatINR(entry.amount)} | {entry.source.replaceAll("_", " ")}
                </p>
                <span className="rounded-full border border-border px-2 py-1 text-xs uppercase">
                  {entry.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                {entry.lockUntil
                  ? `Lock until ${new Date(entry.lockUntil).toLocaleDateString()}`
                  : `Updated ${new Date(entry.updatedAt).toLocaleDateString()}`}
              </p>
              {entry.note && <p className="mt-1 text-xs text-muted">{entry.note}</p>}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
