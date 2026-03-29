import { RequireAuth } from "@/components/auth/require-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { BusinessGroupManager } from "@/components/groups/business-group-manager";

export default function BusinessGroupsPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-5xl px-4 pb-8 pt-10">
          <BusinessGroupManager />
        </main>
      </RequireAuth>
    </div>
  );
}
