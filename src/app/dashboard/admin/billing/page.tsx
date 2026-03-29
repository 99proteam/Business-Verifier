import { RequireAdmin } from "@/components/auth/require-admin";
import { RequireAuth } from "@/components/auth/require-auth";
import { AdminBillingPanel } from "@/components/billing/admin-billing-panel";
import { SiteHeader } from "@/components/layout/site-header";

export default function AdminBillingPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <RequireAdmin>
          <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
            <AdminBillingPanel />
          </main>
        </RequireAdmin>
      </RequireAuth>
    </div>
  );
}
