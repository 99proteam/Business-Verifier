import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Globe,
  Search,
  ShieldCheck,
  Star,
  TrendingUp,
  UserCheck,
  Zap,
} from "lucide-react";
import { HomeBusinessShowcase, type HomeShowcaseData } from "@/components/home/home-business-showcase";
import { HomeGlobalSearch } from "@/components/home/home-global-search";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getCachedHomeShowcase } from "@/lib/server/public-cache";

export const revalidate = 300;

const stats = [
  { label: "Verified Businesses", value: "500+", icon: BadgeCheck },
  { label: "Happy Customers", value: "12K+", icon: UserCheck },
  { label: "Countries Covered", value: "40+", icon: Globe },
  { label: "Avg. Trust Score", value: "94%", icon: TrendingUp },
];

const features = [
  {
    icon: ShieldCheck,
    title: "Verified Businesses Only",
    description: "Every business goes through a rigorous verification checklist — mobile, address, bank, and documents.",
    color: "bg-emerald-50 text-emerald-600",
  },
  {
    icon: Star,
    title: "Proof-backed Reviews",
    description: "Customers can only leave reviews with purchase proof, ensuring genuine and trustworthy feedback.",
    color: "bg-amber-50 text-amber-600",
  },
  {
    icon: Zap,
    title: "Instant Trust Certificates",
    description: "Once approved, businesses receive a digital trust certificate with a unique serial number.",
    color: "bg-blue-50 text-blue-600",
  },
  {
    icon: Building2,
    title: "Secure Escrow Orders",
    description: "Payments held in escrow until delivery is confirmed, protecting both buyers and sellers.",
    color: "bg-purple-50 text-purple-600",
  },
];

const howItWorks = [
  {
    step: "01",
    title: "Search the Directory",
    description: "Browse or search verified businesses by name, category, city, or country.",
  },
  {
    step: "02",
    title: "Check Trust Score",
    description: "View verification checklist, trust score, certificate serial, and deposit amounts.",
  },
  {
    step: "03",
    title: "Buy with Confidence",
    description: "Order products/services knowing your payment is escrow-protected.",
  },
];

export default async function Home() {
  const fallbackShowcase: HomeShowcaseData = {
    settings: {
      businessMode: "both" as const,
      businessLimit: 20,
      newBusinessWindowDays: 30,
      enabledModules: [
        "new_business_sidebar",
        "recommended_business",
        "images_redirect",
        "videos_url",
      ],
      imageItems: [],
      videoItems: [],
    },
    businesses: [],
    offeringsByBusiness: {},
  };
  const showcase = await getCachedHomeShowcase().catch(() => fallbackShowcase);

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="flex flex-col">
        {/* ── Hero Section ── */}
        <section className="bg-slate-50 px-5 pt-8 md:px-8 md:pt-10">
          <div className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900">
            {/* Decorative circles */}
            <div className="pointer-events-none absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-emerald-500/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-32 -left-32 h-[400px] w-[400px] rounded-full bg-teal-400/8 blur-3xl" />

            <div className="relative px-6 py-14 md:px-10 md:py-16 lg:px-12 lg:py-20">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 trust-pulse" />
              Trusted Business Verification Platform
            </div>

            <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl lg:text-6xl">
              Discover Verified Businesses
              <br />
              <span className="text-emerald-400">You Can Trust</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base text-slate-300 md:text-lg">
              Check business credentials, trust scores, and certificates in seconds.
              Every listed business is verified — so you can buy, connect, and transact with confidence.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/directory"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/40 transition hover:bg-emerald-400 hover:shadow-emerald-900/60"
              >
                <Search size={16} />
                Search Businesses
              </Link>
              <Link
                href="/dashboard/business/onboarding"
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
              >
                Verify Your Business
                <ArrowRight size={15} />
              </Link>
            </div>

            {/* Trust indicators */}
            <div className="mt-10 flex flex-wrap items-center gap-5">
              {[
                "SSL Secured",
                "Document Verification",
                "Escrow Protection",
                "Dispute Resolution",
              ].map((item) => (
                <div key={item} className="flex items-center gap-1.5 text-xs text-slate-400">
                  <CheckCircle2 size={13} className="text-emerald-500" />
                  {item}
                </div>
              ))}
            </div>
            </div>
          </div>
        </section>

        {/* ── Stats Bar ── */}
        <section className="border-b border-border bg-white">
          <div className="mx-auto w-full max-w-6xl px-4 py-8">
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className="flex flex-col items-center text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand mb-2">
                      <Icon size={18} />
                    </div>
                    <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-xs text-muted mt-0.5">{stat.label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <div className="mx-auto w-full max-w-6xl px-4 py-12 flex flex-col gap-14">

          {/* ── Global Search ── */}
          <section>
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold tracking-tight">Find Any Verified Business</h2>
              <p className="mt-2 text-sm text-muted">Search across businesses, products, services, groups, and partnerships</p>
            </div>
            <HomeGlobalSearch />
          </section>

          {/* ── For Customers + Business Owners ── */}
          <section className="grid gap-5 md:grid-cols-2">
            {/* Customers card */}
            <article className="relative overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50 p-7">
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-100 opacity-60" />
              <div className="relative">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-white shadow-sm">
                  <UserCheck size={20} />
                </span>
                <h2 className="mt-4 text-xl font-bold tracking-tight text-foreground">For Customers</h2>
                <p className="mt-2 text-sm text-muted leading-relaxed">
                  Verify any business before buying. Check trust scores, read proof-backed reviews,
                  and buy with escrow protection.
                </p>
                <ul className="mt-4 space-y-2">
                  {[
                    "View full verification checklist",
                    "Read genuine, proof-backed reviews",
                    "Get membership discounts",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-foreground">
                      <CheckCircle2 size={14} className="shrink-0 text-brand" />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link
                    href="/directory"
                    className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-strong"
                  >
                    Explore Businesses
                  </Link>
                  <Link
                    href="/pricing"
                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-medium transition hover:border-brand/40 hover:bg-brand/5"
                  >
                    View Membership Plans
                  </Link>
                </div>
              </div>
            </article>

            {/* Business owners card */}
            <article className="relative overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-7">
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-blue-100 opacity-60" />
              <div className="relative">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                  <Building2 size={20} />
                </span>
                <h2 className="mt-4 text-xl font-bold tracking-tight text-foreground">For Business Owners</h2>
                <p className="mt-2 text-sm text-muted leading-relaxed">
                  Get your business verified, build public trust, list products/services,
                  and receive orders from verified customers.
                </p>
                <ul className="mt-4 space-y-2">
                  {[
                    "Get a verified trust certificate",
                    "Publish products & services",
                    "Manage reviews and disputes",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-foreground">
                      <CheckCircle2 size={14} className="shrink-0 text-indigo-600" />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link
                    href="/dashboard/business/onboarding"
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                  >
                    List Your Business
                    <ArrowRight size={14} />
                  </Link>
                  <Link
                    href="/dashboard/business/products"
                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-medium transition hover:border-indigo-300 hover:bg-indigo-50"
                  >
                    Add Products / Services
                  </Link>
                </div>
              </div>
            </article>
          </section>

          {/* ── How It Works ── */}
          <section>
            <div className="text-center mb-8">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand-strong">
                <Zap size={12} />
                Simple & Transparent
              </span>
              <h2 className="mt-3 text-2xl font-bold tracking-tight">How It Works for Customers</h2>
              <p className="mt-2 text-sm text-muted max-w-lg mx-auto">
                Three simple steps to find and buy from a verified business
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {howItWorks.map((step, index) => (
                <article
                  key={step.step}
                  className="relative rounded-2xl border border-border bg-white p-6 shadow-sm card-hover"
                >
                  <div className="flex items-start gap-4">
                    <span className="flex-shrink-0 text-3xl font-black text-brand/20">{step.step}</span>
                    {index < howItWorks.length - 1 && (
                      <div className="hidden md:block absolute top-1/2 -right-3 z-10 text-border">
                        <ArrowRight size={20} />
                      </div>
                    )}
                  </div>
                  <h3 className="mt-2 font-bold text-base text-foreground">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted leading-relaxed">{step.description}</p>
                </article>
              ))}
            </div>
          </section>

          {/* ── Platform Features ── */}
          <section>
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold tracking-tight">Platform-Grade Trust Features</h2>
              <p className="mt-2 text-sm text-muted">Built to protect every stakeholder in the transaction</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <article key={feature.title} className="rounded-2xl border border-border bg-white p-5 shadow-sm card-hover">
                    <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${feature.color}`}>
                      <Icon size={18} />
                    </span>
                    <h3 className="mt-3 font-semibold text-sm text-foreground">{feature.title}</h3>
                    <p className="mt-1.5 text-xs text-muted leading-relaxed">{feature.description}</p>
                  </article>
                );
              })}
            </div>
          </section>

          {/* ── Membership CTA ── */}
          <section className="grid gap-5 md:grid-cols-2">
            <article className="rounded-2xl border border-border bg-white p-7 shadow-sm">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
                <BadgeCheck size={18} />
              </span>
              <h2 className="mt-4 text-lg font-bold tracking-tight">Verifier Customer Membership</h2>
              <p className="mt-2 text-sm text-muted leading-relaxed">
                Membership users receive exclusive discount benefits when purchasing from participating verified businesses.
              </p>
              <ol className="mt-4 space-y-2">
                {[
                  "Purchase a membership plan",
                  "Sign in during checkout",
                  "Discount automatically applied",
                ].map((item, index) => (
                  <li key={item} className="flex items-center gap-3 text-sm">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                      {index + 1}
                    </span>
                    {item}
                  </li>
                ))}
              </ol>
              <Link
                href="/dashboard/membership/customer"
                className="mt-5 inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium transition hover:border-brand/40 hover:bg-brand/5 hover:text-brand-strong"
              >
                Manage Membership
                <ArrowRight size={13} />
              </Link>
            </article>

            <article className="rounded-2xl border border-border bg-white p-7 shadow-sm">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                <Building2 size={18} />
              </span>
              <h2 className="mt-4 text-lg font-bold tracking-tight">How to Get Your Business Listed</h2>
              <p className="mt-2 text-sm text-muted leading-relaxed">
                Quick onboarding process. Our team manually reviews every application to ensure quality.
              </p>
              <ol className="mt-4 space-y-2">
                {[
                  "Submit business details, docs & contacts",
                  "Team completes verification checks",
                  "Publish profile & start receiving leads",
                ].map((item, index) => (
                  <li key={item} className="flex items-center gap-3 text-sm">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">
                      {index + 1}
                    </span>
                    {item}
                  </li>
                ))}
              </ol>
              <Link
                href="/dashboard/business/onboarding"
                className="mt-5 inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
              >
                Start Onboarding
                <ArrowRight size={13} />
              </Link>
            </article>
          </section>

          {/* ── Business Showcase ── */}
          <HomeBusinessShowcase initialData={showcase} />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
