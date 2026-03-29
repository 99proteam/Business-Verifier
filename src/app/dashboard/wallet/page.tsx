import { RequireAuth } from "@/components/auth/require-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { WalletDashboard } from "@/components/wallet/wallet-dashboard";

export default function WalletPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-5xl px-4 pb-8 pt-10">
          <WalletDashboard />
        </main>
      </RequireAuth>
    </div>
  );
}
