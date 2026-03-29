"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  DigitalProductRecord,
  fetchDigitalProductBySlug,
} from "@/lib/firebase/repositories";
import { ProductReviewsSection } from "@/components/reviews/product-reviews-section";

export function ProductDetailsView({ slug }: { slug: string }) {
  const [row, setRow] = useState<DigitalProductRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const product = await fetchDigitalProductBySlug(slug);
        setRow(product);
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "Unable to load product.",
        );
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [slug]);

  return (
    <>
      {loading && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          Loading product...
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {!loading && !error && !row && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          Product not found.
        </div>
      )}

      {row && (
        <>
          <article className="glass rounded-3xl p-6">
            <h1 className="text-3xl font-semibold tracking-tight">{row.title}</h1>
            <p className="mt-2 text-sm text-muted">by {row.ownerName}</p>
            <p className="mt-4 text-sm text-muted">{row.description}</p>
            <p className="mt-4 text-lg font-semibold">INR {row.price}</p>
            <p className="mt-1 text-sm text-muted">
              Category {row.category} | Favorites {row.favoritesCount}
            </p>
            <p className="mt-1 text-sm text-muted">
              Sales {row.salesCount} | Refunds {row.refundCount} | Rating {row.averageRating}/5 (
              {row.reviewsCount})
            </p>
            <p className="mt-1 text-sm text-muted">
              Owner trust {row.ownerTrustScore} |{" "}
              {row.ownerCertificateSerial
                ? `Certificate ${row.ownerCertificateSerial}`
                : "Certificate pending"}
            </p>
            {row.noRefund && (
              <p className="mt-4 inline-flex rounded-full bg-danger/10 px-2 py-1 text-xs text-danger">
                No Refund Product
              </p>
            )}
            <Link
              href={`/checkout/${row.uniqueLinkSlug}`}
              className="mt-6 inline-flex rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
            >
              Purchase with escrow
            </Link>
            {row.ownerBusinessSlug && (
              <Link
                href={`/business/${row.ownerBusinessSlug}`}
                className="mt-3 inline-flex rounded-xl border border-border px-4 py-2 text-sm transition hover:border-brand/40"
              >
                View business trust profile
              </Link>
            )}
          </article>

          <ProductReviewsSection productId={row.id} productTitle={row.title} />
        </>
      )}
    </>
  );
}
