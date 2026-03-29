import { SiteHeader } from "@/components/layout/site-header";
import { PartnershipMarketplace } from "@/components/partnerships/partnership-marketplace";

export default function PartnershipsPage() {
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
        <PartnershipMarketplace />
      </main>
    </div>
  );
}
