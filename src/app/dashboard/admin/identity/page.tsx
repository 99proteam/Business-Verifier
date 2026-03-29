import { RequireAdmin } from "@/components/auth/require-admin";
import { RequireAuth } from "@/components/auth/require-auth";
import { AdminIdentityPanel } from "@/components/admin/admin-identity-panel";
import { SiteHeader } from "@/components/layout/site-header";

export default function AdminIdentityPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <RequireAdmin>
          <main className="mx-auto w-full max-w-5xl px-4 pb-8 pt-10">
            <AdminIdentityPanel />
          </main>
        </RequireAdmin>
      </RequireAuth>
    </div>
  );
}
