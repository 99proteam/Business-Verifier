import { RequireAuth } from "@/components/auth/require-auth";
import { BusinessAdsManager } from "@/components/ads/business-ads-manager";
import { SiteHeader } from "@/components/layout/site-header";

export default function BusinessAdsPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
          <BusinessAdsManager />
        </main>
      </RequireAuth>
    </div>
  );
}
