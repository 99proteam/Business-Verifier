import { RequireAuth } from "@/components/auth/require-auth";
import { ProDepositManager } from "@/components/business/pro-deposit-manager";
import { SiteHeader } from "@/components/layout/site-header";

export default function BusinessDepositPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
          <ProDepositManager />
        </main>
      </RequireAuth>
    </div>
  );
}
