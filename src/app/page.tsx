import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
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
  };
  const showcase = await getCachedHomeShowcase().catch(() => fallbackShowcase);
  return (
    <div className="noise-bg">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 pb-8 pt-10">
        <section className="rounded-3xl border border-border bg-white p-8">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-brand-strong">
              <ShieldCheck size={14} />
              Verified business marketplace
            </p>
            <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
              Simple trust and safer buying for online and offline businesses.
            </h1>
            <p className="mt-4 max-w-2xl text-sm text-muted">
              Verify business profiles, check trust details, and raise support tickets from one place.
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
                href="/directory"
                className="rounded-xl border border-border bg-white px-4 py-3 text-sm font-medium transition hover:border-brand/40"
              >
                View listed businesses
              </Link>
            </div>
          </div>
        </section>

        <HomeBusinessShowcase initialData={showcase} />
      </main>
      <SiteFooter />
    </div>
  );
}
