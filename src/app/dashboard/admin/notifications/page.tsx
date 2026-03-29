import { RequireAdmin } from "@/components/auth/require-admin";
import { RequireAuth } from "@/components/auth/require-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { AdminNotificationPanel } from "@/components/notifications/admin-notification-panel";

export default function AdminNotificationsPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <RequireAdmin>
          <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
            <AdminNotificationPanel />
          </main>
        </RequireAdmin>
      </RequireAuth>
    </div>
  );
}
