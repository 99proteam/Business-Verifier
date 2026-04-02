import Link from "next/link";
import { BusinessQuestionsSection } from "@/components/business/business-questions-section";
import {
  BusinessApplicationRecord,
  BusinessServiceRecord,
  BusinessTrustBadgeRecord,
  DigitalProductRecord,
  ProDepositLedgerRecord,
} from "@/lib/firebase/repositories";

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function PublicBusinessProfile({
  business,
  badge,
  ledger,
  products,
  services,
  error,
}: {
  business: BusinessApplicationRecord | null;
  badge: BusinessTrustBadgeRecord | null;
  ledger: ProDepositLedgerRecord[];
  products: DigitalProductRecord[];
  services: BusinessServiceRecord[];
  error?: string | null;
}) {
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
        <p className="mt-1 text-xs text-muted">Business key: {business.publicBusinessKey}</p>
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

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Listed products and services</h2>
        <p className="mt-1 text-xs text-muted">
          Buyers can review published products and services before making decisions.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <article className="rounded-2xl border border-border bg-surface p-4">
            <h3 className="text-sm font-semibold">Products</h3>
            {!products.length ? (
              <p className="mt-2 text-xs text-muted">No products listed yet.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {products.slice(0, 6).map((product) => (
                  <Link
                    key={product.id}
                    href={`/products/${product.uniqueLinkSlug}`}
                    className="block rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40"
                  >
                    <p className="font-medium">{product.title}</p>
                    <p className="text-xs text-muted">
                      {product.category} | INR {product.pricingPlans[0]?.price ?? product.price}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </article>
          <article id="services" className="rounded-2xl border border-border bg-surface p-4">
            <h3 className="text-sm font-semibold">Services</h3>
            {!services.length ? (
              <p className="mt-2 text-xs text-muted">No services listed yet.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {services.slice(0, 6).map((service) => (
                  <article
                    key={service.id}
                    className="rounded-xl border border-border px-3 py-2 text-sm"
                  >
                    <p className="font-medium">{service.title}</p>
                    <p className="text-xs text-muted">
                      {service.category} | {service.currency} {service.startingPrice}
                    </p>
                    <p className="text-xs text-muted">
                      {service.serviceMode} | {service.deliveryMode}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </article>
        </div>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Verification transparency</h2>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <p>
            Mobile: <b>{business.verificationChecklist.mobileVerified ? "Verified" : "Pending"}</b>
          </p>
          <p>
            Address:{" "}
            <b>{business.verificationChecklist.addressVerified ? "Verified" : "Pending"}</b>
          </p>
          <p>
            Bank account:{" "}
            <b>{business.verificationChecklist.bankAccountVerified ? "Verified" : "Pending"}</b>
          </p>
          <p>
            Business info:{" "}
            <b>{business.verificationChecklist.businessInfoVerified ? "Verified" : "Pending"}</b>
          </p>
          <p className="sm:col-span-2">
            Public documents:{" "}
            <b>
              {business.verificationChecklist.publicDocumentsVerified ? "Verified" : "Pending"}
            </b>
          </p>
        </div>
        <p className="mt-3 text-xs text-muted">
          {business.publicDocumentsSummary || "No public document summary available."}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(business.publicDocumentUrls ?? []).map((url, index) => (
            <Link
              key={`${business.id}_public_doc_${index}`}
              href={url}
              target="_blank"
              className="rounded-lg border border-border px-2 py-1 text-xs transition hover:border-brand/40"
            >
              Public document {index + 1}
            </Link>
          ))}
          {!business.publicDocumentUrls?.length && (
            <span className="text-xs text-muted">No public document files published yet.</span>
          )}
        </div>
      </section>

      <BusinessQuestionsSection
        businessId={business.id}
        businessName={business.businessName}
        conversationMode={business.questionConversationMode}
      />
    </div>
  );
}
