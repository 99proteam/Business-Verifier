import { RequireAuth } from "@/components/auth/require-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { BusinessOrdersOverview } from "@/components/orders/business-orders-overview";

export default function BusinessOrdersPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-5xl px-4 pb-8 pt-10">
          <BusinessOrdersOverview />
        </main>
      </RequireAuth>
    </div>
  );
}
