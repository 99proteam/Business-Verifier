import Link from "next/link";
import { BusinessTrustBadgeRecord } from "@/lib/firebase/repositories";

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function TrustBadgeWidget({ row }: { row: BusinessTrustBadgeRecord | null }) {
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
