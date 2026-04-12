import { RequireAuth } from "@/components/auth/require-auth";
import { BusinessWidgetManager } from "@/components/business/business-widget-manager";
import { SiteHeader } from "@/components/layout/site-header";

export default function BusinessWidgetsPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
          <BusinessWidgetManager />
        </main>
      </RequireAuth>
    </div>
  );
}
