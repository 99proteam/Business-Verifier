import Link from "next/link";
import { ArrowRight, BadgeIndianRupee, ShieldCheck, Ticket } from "lucide-react";
import { BusinessTabs } from "@/components/home/business-tabs";
import { ModuleGrid } from "@/components/home/module-grid";
import { PublicAdBanner } from "@/components/ads/public-ad-banner";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export default function Home() {
  return (
    <div className="noise-bg">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 pb-8 pt-12">
        <section className="grid items-center gap-8 md:grid-cols-2">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium text-brand-strong">
              <ShieldCheck size={14} />
              Trust layer for online + offline commerce
            </p>
            <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
              Build a trusted business identity, protect customers, and scale with
              confidence.
            </h1>
            <p className="mt-5 max-w-xl text-base text-muted">
              Business Verifier combines business certification, support tickets,
              deposit-backed trust, escrow refunds, and public transparency in one
              modern SaaS platform.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/dashboard/business/onboarding"
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-strong"
              >
                Start verification
                <ArrowRight size={15} />
              </Link>
              <Link
                href="/pricing"
                className="rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium transition hover:border-brand/40"
              >
                View SaaS plans
              </Link>
            </div>
          </div>

          <div className="glass rounded-3xl p-6 md:p-7">
            <h2 className="text-lg font-semibold tracking-tight">Platform quick facts</h2>
            <div className="mt-5 grid gap-3">
              <div className="rounded-2xl border border-border bg-surface p-4">
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Ticket size={16} />
                  Support & dispute
                </p>
                <p className="mt-1 text-sm">
                  Ticket-first resolution with mandatory evidence and admin escalation
                  controls.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-surface p-4">
                <p className="flex items-center gap-2 text-sm text-muted">
                  <BadgeIndianRupee size={16} />
                  Wallet + escrow
                </p>
                <p className="mt-1 text-sm">
                  Refund windows, locked deposits, withdrawals, and full audit history.
                </p>
              </div>
            </div>
          </div>
        </section>

        <ModuleGrid />
        <PublicAdBanner placement="home_banner" />
        <BusinessTabs />
      </main>
      <SiteFooter />
    </div>
  );
}
