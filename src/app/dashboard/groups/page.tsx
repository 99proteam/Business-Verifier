import { RequireAuth } from "@/components/auth/require-auth";
import { UserGroupsDashboard } from "@/components/groups/user-groups-dashboard";
import { SiteHeader } from "@/components/layout/site-header";

export default function DashboardGroupsPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-5xl px-4 pb-8 pt-10">
          <UserGroupsDashboard />
        </main>
      </RequireAuth>
    </div>
  );
}
