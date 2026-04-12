import { SiteHeader } from "@/components/layout/site-header";
import { PublicBusinessProfile } from "@/components/business/public-business-profile";
import { fetchPublicBusinessShopBySlug } from "@/lib/firebase/repositories";
import { getCachedBusinessProfileBundle } from "@/lib/server/public-cache";

export const revalidate = 300;

export default async function PublicBusinessProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let profileError: string | null = null;
  let shopBundle: Awaited<ReturnType<typeof fetchPublicBusinessShopBySlug>> = null;
  let bundle: Awaited<ReturnType<typeof getCachedBusinessProfileBundle>> = {
    business: null,
    badge: null,
    ledger: [],
    products: [],
    services: [],
    verificationTier: null,
    trustTimeline: [],
  };
  try {
    [bundle, shopBundle] = await Promise.all([
      getCachedBusinessProfileBundle(slug),
      fetchPublicBusinessShopBySlug(slug).catch(() => null),
    ]);
  } catch (error) {
    profileError =
      error instanceof Error ? error.message : "Unable to load business trust profile.";
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-8">
        <PublicBusinessProfile
          business={bundle.business}
          badge={bundle.badge}
          ledger={bundle.ledger}
          products={bundle.products}
          services={bundle.services}
          verificationTier={bundle.verificationTier}
          trustTimeline={bundle.trustTimeline}
          shop={shopBundle?.shop ?? null}
          error={profileError}
        />
      </main>
    </div>
  );
}
