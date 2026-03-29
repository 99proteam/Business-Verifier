import { AdminAuditPanel } from "@/components/admin/admin-audit-panel";
import { RequireAdmin } from "@/components/auth/require-admin";
import { RequireAuth } from "@/components/auth/require-auth";
import { SiteHeader } from "@/components/layout/site-header";

export default function AdminAuditPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <RequireAdmin>
          <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
            <AdminAuditPanel />
          </main>
        </RequireAdmin>
      </RequireAuth>
    </div>
  );
}
