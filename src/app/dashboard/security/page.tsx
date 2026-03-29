import { RequireAuth } from "@/components/auth/require-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { SecuritySettings } from "@/components/security/security-settings";

export default function DashboardSecurityPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-5xl px-4 pb-8 pt-10">
          <SecuritySettings />
        </main>
      </RequireAuth>
    </div>
  );
}
