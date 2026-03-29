import { RequireAuth } from "@/components/auth/require-auth";
import { BusinessBillingDashboard } from "@/components/billing/business-billing-dashboard";
import { SiteHeader } from "@/components/layout/site-header";

export default function BusinessBillingPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
          <BusinessBillingDashboard />
        </main>
      </RequireAuth>
    </div>
  );
}
