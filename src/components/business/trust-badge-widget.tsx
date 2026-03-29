"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BusinessTrustBadgeRecord,
  fetchPublicBusinessTrustBadgeByBusinessId,
} from "@/lib/firebase/repositories";

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function TrustBadgeWidget({ businessId }: { businessId: string }) {
  const [row, setRow] = useState<BusinessTrustBadgeRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      const badge = await fetchPublicBusinessTrustBadgeByBusinessId(businessId);
      if (mounted) {
        setRow(badge);
        setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [businessId]);

  if (loading) {
    return <div className="p-3 text-xs text-muted">Loading trust badge...</div>;
  }

  if (!row) {
    return <div className="p-3 text-xs text-danger">Business trust profile unavailable.</div>;
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-3 text-foreground">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{row.businessName}</p>
          <p className="mt-0.5 text-xs text-muted">
            {row.city}, {row.country}
          </p>
        </div>
        <span className="rounded-full bg-brand/15 px-2 py-1 text-xs text-brand-strong">
          Trust {row.trustScore}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted">
        {row.certificateSerial ? `Certificate ${row.certificateSerial}` : "Certificate pending"}
      </p>
      <p className="mt-1 text-xs text-muted">
        Locked deposit {formatINR(row.totalLockedDeposit)} | Available {formatINR(row.totalAvailableDeposit)}
      </p>
      <Link
        href={`/business/${row.businessSlug}`}
        className="mt-3 inline-flex rounded-lg bg-brand px-2 py-1 text-xs font-medium text-white transition hover:bg-brand-strong"
      >
        View full trust profile
      </Link>
    </div>
  );
}
