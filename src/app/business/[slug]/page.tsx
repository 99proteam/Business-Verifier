import { SiteHeader } from "@/components/layout/site-header";
import { PublicBusinessProfile } from "@/components/business/public-business-profile";
import { getCachedBusinessProfileBundle } from "@/lib/server/public-cache";

export const revalidate = 300;

export default async function PublicBusinessProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let profileError: string | null = null;
  let bundle: Awaited<ReturnType<typeof getCachedBusinessProfileBundle>> = {
    business: null,
    badge: null,
    ledger: [],
  };
  try {
    bundle = await getCachedBusinessProfileBundle(slug);
  } catch (error) {
    profileError =
      error instanceof Error ? error.message : "Unable to load business trust profile.";
  }

  return (
    <div>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
        <PublicBusinessProfile
          business={bundle.business}
          badge={bundle.badge}
          ledger={bundle.ledger}
          error={profileError}
        />
      </main>
    </div>
  );
}
