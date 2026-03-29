import { RequireAuth } from "@/components/auth/require-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { BusinessMembershipManager } from "@/components/membership/business-membership-manager";

export default function BusinessMembershipPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
          <BusinessMembershipManager />
        </main>
      </RequireAuth>
    </div>
  );
}
