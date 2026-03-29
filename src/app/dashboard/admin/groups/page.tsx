import { RequireAdmin } from "@/components/auth/require-admin";
import { RequireAuth } from "@/components/auth/require-auth";
import { AdminGroupsMonitor } from "@/components/groups/admin-groups-monitor";
import { SiteHeader } from "@/components/layout/site-header";

export default function AdminGroupsPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <RequireAdmin>
          <main className="mx-auto w-full max-w-5xl px-4 pb-8 pt-10">
            <AdminGroupsMonitor />
          </main>
        </RequireAdmin>
      </RequireAuth>
    </div>
  );
}
