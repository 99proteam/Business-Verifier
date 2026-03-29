import { RequireAuth } from "@/components/auth/require-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { BusinessNotificationManager } from "@/components/notifications/business-notification-manager";

export default function BusinessNotificationsPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
          <BusinessNotificationManager />
        </main>
      </RequireAuth>
    </div>
  );
}
