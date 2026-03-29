import { RequireAdmin } from "@/components/auth/require-admin";
import { RequireAuth } from "@/components/auth/require-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { AdminWalletPanel } from "@/components/wallet/admin-wallet-panel";

export default function AdminWalletPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <RequireAdmin>
          <main className="mx-auto w-full max-w-5xl px-4 pb-8 pt-10">
            <AdminWalletPanel />
          </main>
        </RequireAdmin>
      </RequireAuth>
    </div>
  );
}
