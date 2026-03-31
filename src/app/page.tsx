import Link from "next/link";
import {
  ArrowRight,
  BadgePercent,
  Building2,
  Search,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { HomeBusinessShowcase, type HomeShowcaseData } from "@/components/home/home-business-showcase";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getCachedHomeShowcase } from "@/lib/server/public-cache";

export const revalidate = 300;

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
    <div className="noise-bg">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 pb-8 pt-10">
        <section className="rounded-3xl border border-border bg-white p-8">
          <p className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-brand-strong">
            <ShieldCheck size={14} />
            Verified business marketplace
          </p>
          <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            Find trusted businesses, buy safely, and get clear membership discounts.
          </h1>
          <p className="mt-4 max-w-3xl text-sm text-muted">
            Customers can check verified business details and purchase with confidence.
            Business owners can list their company, verify documents, and build public trust.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <article className="rounded-2xl border border-border bg-surface p-5">
              <p className="inline-flex rounded-xl bg-brand/10 p-2 text-brand">
                <UserCheck size={16} />
              </p>
              <h2 className="mt-3 text-lg font-semibold tracking-tight">For customers</h2>
              <p className="mt-2 text-sm text-muted">
                See verified businesses, check products/services, and use Verifier membership
                for discount benefits.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/directory"
                  className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
                >
                  Explore businesses
                </Link>
                <Link
                  href="/pricing"
                  className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40"
                >
                  View membership plans
                </Link>
              </div>
            </article>
            <article className="rounded-2xl border border-border bg-surface p-5">
              <p className="inline-flex rounded-xl bg-brand/10 p-2 text-brand">
                <Building2 size={16} />
              </p>
              <h2 className="mt-3 text-lg font-semibold tracking-tight">For business owners</h2>
              <p className="mt-2 text-sm text-muted">
                List business details, complete verification, publish products/services,
                and improve trust for online and offline buyers.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/dashboard/business/onboarding"
                  className="inline-flex items-center gap-2 rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
                >
                  List your business
                  <ArrowRight size={14} />
                </Link>
                <Link
                  href="/dashboard/business/products"
                  className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40"
                >
                  Add products/services
                </Link>
              </div>
            </article>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-2xl border border-border bg-white p-4 text-sm">
            <p className="font-semibold">Only verified businesses</p>
            <p className="mt-1 text-muted">Public trust details and verification checklist.</p>
          </article>
          <article className="rounded-2xl border border-border bg-white p-4 text-sm">
            <p className="font-semibold">Secure payments and records</p>
            <p className="mt-1 text-muted">Track orders, refunds, and dispute history in one place.</p>
          </article>
          <article className="rounded-2xl border border-border bg-white p-4 text-sm">
            <p className="font-semibold">Ticket support workflow</p>
            <p className="mt-1 text-muted">Customer, business, and admin can resolve issues transparently.</p>
          </article>
          <article className="rounded-2xl border border-border bg-white p-4 text-sm">
            <p className="font-semibold">Public deposit visibility</p>
            <p className="mt-1 text-muted">Pro business deposits improve buyer confidence.</p>
          </article>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-border bg-white p-6">
            <p className="inline-flex rounded-xl bg-brand/10 p-2 text-brand">
              <BadgePercent size={16} />
            </p>
            <h2 className="mt-3 text-lg font-semibold tracking-tight">
              Verifier customer membership
            </h2>
            <p className="mt-2 text-sm text-muted">
              Membership users receive platform discount benefits on participating verified stores.
            </p>
            <ol className="mt-3 space-y-2 text-sm text-muted">
              <li>1. Purchase membership plan.</li>
              <li>2. Sign in with your verifier account during checkout.</li>
              <li>3. Discount applies based on your membership configuration.</li>
            </ol>
            <Link
              href="/dashboard/membership/customer"
              className="mt-4 inline-flex rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40"
            >
              Manage membership
            </Link>
          </article>
          <article className="rounded-2xl border border-border bg-white p-6">
            <p className="inline-flex rounded-xl bg-brand/10 p-2 text-brand">
              <Search size={16} />
            </p>
            <h2 className="mt-3 text-lg font-semibold tracking-tight">
              How to list your business
            </h2>
            <p className="mt-2 text-sm text-muted">
              Keep onboarding simple so buyers trust your profile quickly.
            </p>
            <ol className="mt-3 space-y-2 text-sm text-muted">
              <li>1. Submit business details, documents, and contact proofs.</li>
              <li>2. Complete verification review and trust checks.</li>
              <li>3. Publish profile, products/services, and start receiving leads.</li>
            </ol>
            <Link
              href="/dashboard/business/onboarding"
              className="mt-4 inline-flex rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40"
            >
              Start onboarding
            </Link>
          </article>
        </section>

        <HomeBusinessShowcase initialData={showcase} />
      </main>
      <SiteFooter />
    </div>
  );
}
