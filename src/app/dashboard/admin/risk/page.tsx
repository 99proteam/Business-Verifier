import { RequireAdmin } from "@/components/auth/require-admin";
import { RequireAuth } from "@/components/auth/require-auth";
import { AdminRiskOperationsPanel } from "@/components/admin/admin-risk-operations-panel";
import { SiteHeader } from "@/components/layout/site-header";

export default function AdminRiskOperationsPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <RequireAuth>
        <RequireAdmin>
          <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-8">
            <AdminRiskOperationsPanel />
          </main>
        </RequireAdmin>
      </RequireAuth>
    </div>
  );
}
