import { AdminReconciliationPanel } from "@/components/admin/admin-reconciliation-panel";
import { RequireAdmin } from "@/components/auth/require-admin";
import { RequireAuth } from "@/components/auth/require-auth";
import { SiteHeader } from "@/components/layout/site-header";

export default function AdminReconciliationPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <RequireAdmin>
          <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
            <AdminReconciliationPanel />
          </main>
        </RequireAdmin>
      </RequireAuth>
    </div>
  );
}
