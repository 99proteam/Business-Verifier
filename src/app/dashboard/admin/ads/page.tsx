import { AdminAdsPanel } from "@/components/ads/admin-ads-panel";
import { RequireAdmin } from "@/components/auth/require-admin";
import { RequireAuth } from "@/components/auth/require-auth";
import { SiteHeader } from "@/components/layout/site-header";

export default function AdminAdsPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <RequireAdmin>
          <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
            <AdminAdsPanel />
          </main>
        </RequireAdmin>
      </RequireAuth>
    </div>
  );
}
