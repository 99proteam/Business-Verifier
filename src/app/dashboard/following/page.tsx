import { RequireAuth } from "@/components/auth/require-auth";
import { FollowedBusinessesDashboard } from "@/components/business/followed-businesses-dashboard";
import { SiteHeader } from "@/components/layout/site-header";

export default function DashboardFollowingPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-5xl px-4 pb-8 pt-10">
          <FollowedBusinessesDashboard />
        </main>
      </RequireAuth>
    </div>
  );
}
