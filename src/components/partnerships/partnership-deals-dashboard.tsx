"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  fetchCurrentUserIdentityProfile,
  fetchPartnershipDealsByParticipant,
  PartnershipDealRecord,
  UserIdentityProfileRecord,
} from "@/lib/firebase/repositories";

export function PartnershipDealsDashboard() {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<PartnershipDealRecord[]>([]);
  const [identity, setIdentity] = useState<UserIdentityProfileRecord | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "open" | "agreement_reached" | "completed" | "cancelled"
  >("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [deals, profile] = await Promise.all([
        fetchPartnershipDealsByParticipant(user.uid),
        fetchCurrentUserIdentityProfile(user.uid),
      ]);
      setRows(deals);
      setIdentity(profile);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load partnership deals.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return rows;
    return rows.filter((row) => row.status === statusFilter);
  }, [rows, statusFilter]);

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
        Loading partnership deals...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">My Partnership Deals</h1>
        <p className="mt-2 text-sm text-muted">
          Track open chats, agreement amounts, and final 2% platform fee settlements.
        </p>
        {identity && !identity.isIdentityVerified && (
          <p className="mt-3 rounded-xl border border-amber-400/40 bg-amber-100 p-3 text-xs text-amber-800">
            Your identity is not verified. New partnership chat messages are blocked until
            verification is complete.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {(
            ["all", "open", "agreement_reached", "completed", "cancelled"] as const
          ).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-xl px-3 py-2 text-xs transition ${
                statusFilter === status
                  ? "bg-brand text-white"
                  : "border border-border bg-surface hover:border-brand/40"
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {!filtered.length && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          No partnership deals found for current filter.
        </div>
      )}

      {filtered.map((row) => (
        <article key={row.id} className="glass rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{row.listingBusinessName}</h2>
            <span className="rounded-full bg-brand/10 px-2 py-1 text-xs text-brand-strong">
              {row.status}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">Category: {row.partnershipCategory ?? "General"}</p>
          <p className="mt-1 text-xs text-muted">
            Range INR {row.partnershipAmountMin ?? 0} - INR {row.partnershipAmountMax ?? 0}
          </p>
          <p className="mt-1 text-xs text-muted">
            Agreed INR {row.agreedAmount ?? 0} | Fee {row.platformFeePercent}% (INR{" "}
            {row.platformFeeAmount})
          </p>
          <p className="mt-1 text-xs text-muted">
            Fee status {row.feeStatus} | Updated {new Date(row.updatedAt).toLocaleString()}
          </p>
          <Link
            href={`/dashboard/partnerships/${row.id}`}
            className="mt-3 inline-flex rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
          >
            Open deal chat
          </Link>
        </article>
      ))}
    </div>
  );
}
