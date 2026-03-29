import { RequireAdmin } from "@/components/auth/require-admin";
import { RequireAuth } from "@/components/auth/require-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { AdminTicketInbox } from "@/components/tickets/admin-ticket-inbox";

export default function AdminTicketsPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <RequireAdmin>
          <main className="mx-auto w-full max-w-5xl px-4 pb-8 pt-10">
            <AdminTicketInbox />
          </main>
        </RequireAdmin>
      </RequireAuth>
    </div>
  );
}
