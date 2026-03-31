import Link from "next/link";
import { BusinessServiceRecord } from "@/lib/firebase/repositories";

export function ServiceMarketplaceGrid({ rows }: { rows: BusinessServiceRecord[] }) {
  return (
    <section className="glass rounded-3xl p-6">
      <h2 className="text-2xl font-semibold tracking-tight">Service Listings</h2>
      <p className="mt-2 text-sm text-muted">
        Explore services published by verified businesses.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {!rows.length && (
          <article className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted md:col-span-2 lg:col-span-3">
            No services listed yet.
          </article>
        )}
        {rows.map((row) => (
          <article key={row.id} className="rounded-2xl border border-border bg-surface p-4">
            <h3 className="font-semibold">{row.title}</h3>
            <p className="mt-1 text-xs text-muted">by {row.ownerName}</p>
            <p className="mt-2 text-sm text-muted">{row.description}</p>
            <p className="mt-2 text-sm">
              <span className="font-semibold">
                {row.currency} {row.startingPrice}
              </span>{" "}
              | {row.category}
            </p>
            <p className="mt-1 text-xs text-muted">
              {row.serviceMode} | {row.deliveryMode} | Trust {row.ownerTrustScore}
            </p>
            {typeof row.stockAvailable === "number" ? (
              <p className="mt-1 text-xs text-muted">Stock {row.stockAvailable}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {row.ownerBusinessSlug ? (
                <Link
                  href={`/business/${row.ownerBusinessSlug}#services`}
                  className="rounded-lg border border-border px-2 py-1 text-xs transition hover:border-brand/40"
                >
                  View business profile
                </Link>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
