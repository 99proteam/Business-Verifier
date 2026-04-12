import { RequireAuth } from "@/components/auth/require-auth";
import { BusinessGrowthSuite } from "@/components/business/business-growth-suite";
import { SiteHeader } from "@/components/layout/site-header";

export default function BusinessGrowthSuitePage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-8">
          <BusinessGrowthSuite />
        </main>
      </RequireAuth>
    </div>
  );
}
