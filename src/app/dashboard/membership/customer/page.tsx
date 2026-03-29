import { RequireAuth } from "@/components/auth/require-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { CustomerMembershipDashboard } from "@/components/membership/customer-membership-dashboard";

export default function CustomerMembershipPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
          <CustomerMembershipDashboard />
        </main>
      </RequireAuth>
    </div>
  );
}
