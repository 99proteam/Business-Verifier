import Link from "next/link";
import {
  BadgeCheck,
  Building2,
  FileText,
  Globe,
  MapPin,
  Package,
  Phone,
  Shield,
  ShieldCheck,
  Star,
  TrendingUp,
  Wrench,
  XCircle,
} from "lucide-react";
import { BusinessQuestionsSection } from "@/components/business/business-questions-section";
import {
  BusinessVerificationTierRecord,
  TrustTimelineEventRecord,
} from "@/lib/firebase/growth-repositories";
import {
  BusinessApplicationRecord,
  BusinessShopSettingsRecord,
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

const checklistItems = [
  { key: "mobileVerified", label: "Mobile", icon: Phone },
  { key: "addressVerified", label: "Address", icon: MapPin },
  { key: "bankAccountVerified", label: "Bank Account", icon: Shield },
  { key: "businessInfoVerified", label: "Business Info", icon: Building2 },
  { key: "publicDocumentsVerified", label: "Documents", icon: FileText },
] as const;

const themeLabels: Record<string, string> = {
  clean_modern: "Clean Modern",
  classic_store: "Classic Store",
  midnight_premium: "Midnight Premium",
  sunrise_market: "Sunrise Market",
  minimal_grid: "Minimal Grid",
};

export function PublicBusinessProfile({
  business,
  badge,
  ledger,
  products,
  services,
  verificationTier,
  trustTimeline = [],
  shop,
  error,
}: {
  business: BusinessApplicationRecord | null;
  badge: BusinessTrustBadgeRecord | null;
  ledger: ProDepositLedgerRecord[];
  products: DigitalProductRecord[];
  services: BusinessServiceRecord[];
  verificationTier?: BusinessVerificationTierRecord | null;
  trustTimeline?: TrustTimelineEventRecord[];
  shop?: BusinessShopSettingsRecord | null;
  error?: string | null;
}) {
  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4">
        <XCircle size={18} className="shrink-0 text-danger mt-0.5" />
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }

  if (!business || !badge) {
    return (
      <div className="rounded-2xl border border-border bg-white p-8 text-center">
        <ShieldCheck size={32} className="mx-auto text-muted mb-3" />
        <p className="font-medium text-foreground">Business trust profile not found</p>
        <p className="text-sm text-muted mt-1">This business may not be listed or verified yet.</p>
      </div>
    );
  }

  const trustScore = badge.trustScore ?? 0;
  const tierLabel =
    verificationTier?.currentTier === "pro_escrow"
      ? "Pro Escrow"
      : verificationTier?.currentTier === "advanced"
        ? "Advanced"
        : "Basic";
  const tierStatus = verificationTier?.status ?? "approved";
  const getTrustColor = (score: number) => {
    if (score >= 80) return { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" };
    if (score >= 60) return { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" };
    return { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" };
  };
  const tc = getTrustColor(trustScore);

  return (
    <div className="space-y-5">

      {/* Business header */}
      <section className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
        {/* Top banner */}
        <div className="bg-gradient-to-r from-slate-900 to-emerald-950 px-6 py-8">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white text-2xl font-black">
              {business.businessName[0]?.toUpperCase() ?? "B"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-white">{business.businessName}</h1>
                {badge.certificateSerial && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                    <BadgeCheck size={12} />
                    Verified
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-2">
                <span className="flex items-center gap-1 text-xs text-slate-300">
                  <MapPin size={11} />
                  {business.city}, {business.country}
                </span>
                <span className="flex items-center gap-1 text-xs text-slate-300">
                  <Star size={11} />
                  {business.category}
                </span>
                <span className="flex items-center gap-1 text-xs text-slate-300">
                  <Globe size={11} />
                  {business.mode}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Business Key: #{business.publicBusinessKey}</p>
            </div>
          </div>
        </div>

        {/* Trust score cards */}
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
          <div className="bg-white p-4 text-center">
            <p className="text-xs text-muted mb-1">Trust Score</p>
            <div className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1 text-lg font-black ${tc.bg} ${tc.text}`}>
              <TrendingUp size={16} />
              {trustScore}
            </div>
          </div>
          <div className="bg-white p-4 text-center">
            <p className="text-xs text-muted mb-1">Certificate</p>
            <p className="text-sm font-semibold text-foreground">
              {badge.certificateSerial ? (
                <span className="text-brand">{badge.certificateSerial}</span>
              ) : (
                <span className="text-amber-600">Pending</span>
              )}
            </p>
          </div>
          <div className="bg-white p-4 text-center">
            <p className="text-xs text-muted mb-1">Locked Deposit</p>
            <p className="text-sm font-semibold text-foreground">{formatINR(badge.totalLockedDeposit)}</p>
          </div>
          <div className="bg-white p-4 text-center">
            <p className="text-xs text-muted mb-1">Available Deposit</p>
            <p className="text-sm font-semibold text-foreground">{formatINR(badge.totalAvailableDeposit)}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
            <BadgeCheck size={18} />
          </span>
          <div>
            <h2 className="font-bold text-foreground">Trust Tier and Timeline</h2>
            <p className="text-xs text-muted">Public trust events and tier progression</p>
          </div>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
            Tier: {tierLabel}
          </span>
          <span className="inline-flex rounded-full border border-border bg-slate-50 px-2.5 py-1 text-xs text-muted capitalize">
            Status: {tierStatus}
          </span>
        </div>
        {!trustTimeline.length ? (
          <div className="rounded-xl border border-border bg-slate-50 p-4 text-sm text-muted">
            No public trust events published yet.
          </div>
        ) : (
          <div className="space-y-2">
            {trustTimeline.slice(0, 8).map((event) => (
              <div key={event.id} className="rounded-xl border border-border bg-slate-50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{event.title}</p>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase text-muted">
                    {event.eventType.replaceAll("_", " ")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">{event.detail}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {new Date(event.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {shop && (
        <section
          className="rounded-2xl border border-border bg-white p-6 shadow-sm"
          style={{
            borderColor: `${shop.themeAccent}40`,
            boxShadow: `0 1px 0 ${shop.themeAccent}20`,
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-foreground">{shop.storeTitle}</h2>
              <p className="mt-1 text-sm text-muted">{shop.storeTagline}</p>
              <p className="mt-2 text-sm text-muted">{shop.storeDescription}</p>
            </div>
            <span
              className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold"
              style={{
                borderColor: `${shop.themeAccent}55`,
                color: shop.themeAccent,
              }}
            >
              Theme: {themeLabels[shop.themeKey] ?? shop.themeKey}
            </span>
          </div>
          <div className="mt-4 grid gap-2 text-xs text-muted md:grid-cols-2">
            <p>Checkout: {shop.allowGuestCheckout ? "Guest + Account" : "Account only"}</p>
            <p>Order flow: {shop.autoAcceptOrders ? "Auto-accept" : "Manual acceptance"}</p>
            <p>Payments: {shop.enableWallet ? "Wallet enabled" : "Wallet disabled"}</p>
            <p>COD: {shop.enableCod ? "Enabled" : "Disabled"}</p>
            <p>Products visible: {shop.publishProducts ? "Yes" : "No"}</p>
            <p>Services visible: {shop.publishServices ? "Yes" : "No"}</p>
            <p>Currency: {shop.currencyMode}</p>
            <p>Custom domain: {shop.customDomain || "Not connected"}</p>
          </div>
        </section>
      )}

      {/* Verification transparency */}
      <section className="rounded-2xl border border-border bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10 text-brand">
            <ShieldCheck size={18} />
          </span>
          <div>
            <h2 className="font-bold text-foreground">Verification Transparency</h2>
            <p className="text-xs text-muted">All checks performed by our team</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {checklistItems.map(({ key, label, icon: Icon }) => {
            const verified = business.verificationChecklist[key];
            return (
              <div
                key={key}
                className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center ${
                  verified ? "border-emerald-200 bg-emerald-50" : "border-border bg-slate-50"
                }`}
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                  verified ? "bg-brand text-white" : "bg-slate-200 text-slate-400"
                }`}>
                  <Icon size={14} />
                </span>
                <p className="text-xs font-medium text-foreground">{label}</p>
                {verified ? (
                  <span className="text-[10px] font-semibold text-brand">Verified</span>
                ) : (
                  <span className="text-[10px] text-muted">Pending</span>
                )}
              </div>
            );
          })}
        </div>

        {business.publicDocumentsSummary && (
          <p className="mt-4 text-sm text-muted leading-relaxed border-t border-border pt-4">
            {business.publicDocumentsSummary}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {(business.publicDocumentUrls ?? []).map((url, index) => (
            <Link
              key={`${business.id}_public_doc_${index}`}
              href={url}
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-slate-50 px-3 py-1.5 text-xs font-medium transition hover:border-brand/40 hover:text-brand"
            >
              <FileText size={12} />
              Document {index + 1}
            </Link>
          ))}
          {!business.publicDocumentUrls?.length && (
            <span className="text-xs text-muted">No public documents published yet.</span>
          )}
        </div>
      </section>

      {/* Products and services */}
      <section className="rounded-2xl border border-border bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
            <Package size={18} />
          </span>
          <div>
            <h2 className="font-bold text-foreground">Products & Services</h2>
            <p className="text-xs text-muted">Listed offerings from this business</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Products */}
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <Package size={14} className="text-blue-600" />
              <h3 className="text-sm font-semibold text-foreground">Products</h3>
              <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                {products.length}
              </span>
            </div>
            {!products.length ? (
              <p className="text-xs text-muted py-2">No products listed yet.</p>
            ) : (
              <div className="space-y-2">
                {products.slice(0, 6).map((product) => (
                  <Link
                    key={product.id}
                    href={`/products/${product.uniqueLinkSlug}`}
                    className="flex items-center justify-between rounded-xl border border-border bg-slate-50 px-3 py-2.5 text-sm transition hover:border-brand/30 hover:bg-brand/5"
                  >
                    <div>
                      <p className="font-medium text-foreground text-xs">{product.title}</p>
                      <p className="text-[11px] text-muted">{product.category}</p>
                    </div>
                    <p className="text-xs font-semibold text-brand">
                      ₹{product.pricingPlans[0]?.price ?? product.price}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Services */}
          <div id="services">
            <div className="flex items-center gap-1.5 mb-3">
              <Wrench size={14} className="text-purple-600" />
              <h3 className="text-sm font-semibold text-foreground">Services</h3>
              <span className="ml-auto rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-600">
                {services.length}
              </span>
            </div>
            {!services.length ? (
              <p className="text-xs text-muted py-2">No services listed yet.</p>
            ) : (
              <div className="space-y-2">
                {services.slice(0, 6).map((service) => (
                  <div
                    key={service.id}
                    className="rounded-xl border border-border bg-slate-50 px-3 py-2.5"
                  >
                    <p className="font-medium text-xs text-foreground">{service.title}</p>
                    <p className="text-[11px] text-muted mt-0.5">
                      {service.category} • {service.currency} {service.startingPrice}
                    </p>
                    <p className="text-[11px] text-muted">{service.serviceMode} • {service.deliveryMode}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Public deposit ledger */}
      <section className="rounded-2xl border border-border bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
            <Shield size={18} />
          </span>
          <div>
            <h2 className="font-bold text-foreground">Public Deposit Ledger</h2>
            <p className="text-xs text-muted">Security deposit timeline visible for trust transparency</p>
          </div>
        </div>

        {!ledger.length ? (
          <div className="rounded-xl border border-border bg-slate-50 p-4 text-center">
            <p className="text-sm text-muted">No deposit entries yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {ledger.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between rounded-xl border border-border bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{formatINR(entry.amount)}</p>
                  <p className="text-xs text-muted capitalize">{entry.source.replaceAll("_", " ")}</p>
                  {entry.note && <p className="text-xs text-muted mt-0.5">{entry.note}</p>}
                </div>
                <div className="text-right">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                    entry.status === "locked"
                      ? "bg-blue-100 text-blue-700"
                      : entry.status === "available"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                  }`}>
                    {entry.status}
                  </span>
                  <p className="text-[10px] text-muted mt-1">
                    {entry.lockUntil
                      ? `Lock until ${new Date(entry.lockUntil).toLocaleDateString()}`
                      : new Date(entry.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Q&A section */}
      <BusinessQuestionsSection
        businessId={business.id}
        businessName={business.businessName}
        conversationMode={business.questionConversationMode}
      />
    </div>
  );
}
