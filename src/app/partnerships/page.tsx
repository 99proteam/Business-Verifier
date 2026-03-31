import { SiteHeader } from "@/components/layout/site-header";
import { PartnershipMarketplace } from "@/components/partnerships/partnership-marketplace";
import { getCachedPartnershipMarketplace } from "@/lib/server/public-cache";

export const revalidate = 180;

export default async function PartnershipsPage() {
  const rows = await getCachedPartnershipMarketplace().catch(() => []);
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
        <PartnershipMarketplace initialRows={rows} />
      </main>
    </div>
  );
}
