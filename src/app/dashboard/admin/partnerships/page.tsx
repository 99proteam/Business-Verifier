import { RequireAdmin } from "@/components/auth/require-admin";
import { RequireAuth } from "@/components/auth/require-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { AdminPartnershipMonitor } from "@/components/partnerships/admin-partnership-monitor";

export default function AdminPartnershipsPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <RequireAdmin>
          <main className="mx-auto w-full max-w-5xl px-4 pb-8 pt-10">
            <AdminPartnershipMonitor />
          </main>
        </RequireAdmin>
      </RequireAuth>
    </div>
  );
}
