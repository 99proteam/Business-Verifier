import { RequireAuth } from "@/components/auth/require-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { UserNotificationCenter } from "@/components/notifications/user-notification-center";

export default function NotificationsPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-5xl px-4 pb-8 pt-10">
          <UserNotificationCenter />
        </main>
      </RequireAuth>
    </div>
  );
}
