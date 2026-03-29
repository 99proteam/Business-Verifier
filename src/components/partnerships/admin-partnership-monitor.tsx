"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  fetchAdminPartnershipDeals,
  PartnershipDealRecord,
} from "@/lib/firebase/repositories";

export function AdminPartnershipMonitor() {
  const [rows, setRows] = useState<PartnershipDealRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        setRows(await fetchAdminPartnershipDeals());
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load partnership deals.",
        );
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        Loading partnership monitor...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Partnership Monitor</h1>
        <p className="mt-2 text-sm text-muted">
          Inspect all partnership chats, agreement values, and 2% fee settlement history.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {!rows.length && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          No partnership deals yet.
        </div>
      )}

      {rows.map((row) => (
        <article key={row.id} className="glass rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{row.listingBusinessName}</h2>
            <span className="rounded-full bg-brand/10 px-2 py-1 text-xs text-brand-strong">
              {row.status}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Owner {row.listingOwnerName} | Initiator {row.initiatorName}
          </p>
          <p className="mt-1 text-xs text-muted">
            Agreed INR {row.agreedAmount ?? 0} | Fee INR {row.platformFeeAmount} ({row.feeStatus})
          </p>
          <p className="mt-1 text-xs text-muted">
            Updated {new Date(row.updatedAt).toLocaleString()}
          </p>
          <Link
            href={`/dashboard/admin/partnerships/${row.id}`}
            className="mt-3 inline-flex rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
          >
            Open admin chat
          </Link>
        </article>
      ))}
    </div>
  );
}
