import Link from "next/link";
import {
  DigitalProductRecord,
} from "@/lib/firebase/repositories";
import { ProductReviewsSection } from "@/components/reviews/product-reviews-section";

export function ProductDetailsView({
  product,
  error,
}: {
  product: DigitalProductRecord | null;
  error?: string | null;
}) {
  if (error) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        {error}
      </div>
    );
  }

  if (!product) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        Product not found.
      </div>
    );
  }

  return (
    <>
      <article className="glass rounded-3xl p-6">
        <h1 className="text-3xl font-semibold tracking-tight">{product.title}</h1>
        <p className="mt-2 text-sm text-muted">by {product.ownerName}</p>
        <p className="mt-4 text-sm text-muted">{product.description}</p>
        <p className="mt-4 text-lg font-semibold">
          Starting at INR {product.pricingPlans[0]?.price ?? product.price}
        </p>
        <p className="mt-1 text-sm text-muted">
          Category {product.category} | Favorites {product.favoritesCount}
        </p>
        <p className="mt-1 text-sm text-muted">
          Sales {product.salesCount} | Refunds {product.refundCount} | Rating{" "}
          {product.averageRating}/5 ({product.reviewsCount})
        </p>
        <p className="mt-1 text-sm text-muted">
          Owner trust {product.ownerTrustScore} |{" "}
          {product.ownerCertificateSerial
            ? `Certificate ${product.ownerCertificateSerial}`
            : "Certificate pending"}
        </p>
        {product.noRefund && (
          <p className="mt-4 inline-flex rounded-full bg-danger/10 px-2 py-1 text-xs text-danger">
            No Refund Product
          </p>
        )}
        <div className="mt-5 space-y-2">
          <p className="text-xs text-muted">Pricing plans</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {product.pricingPlans.map((plan) => (
              <Link
                key={plan.key}
                href={`/checkout/${product.uniqueLinkSlug}?plan=${encodeURIComponent(plan.key)}`}
                className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40"
              >
                {plan.name} | {plan.billingCycle.replace("_", " ")} | INR {plan.price}
              </Link>
            ))}
          </div>
        </div>
        {product.ownerBusinessSlug && (
          <Link
            href={`/business/${product.ownerBusinessSlug}`}
            className="mt-4 inline-flex rounded-xl border border-border px-4 py-2 text-sm transition hover:border-brand/40"
          >
            View business trust profile
          </Link>
        )}
      </article>

      <ProductReviewsSection productId={product.id} productTitle={product.title} />
    </>
  );
}
