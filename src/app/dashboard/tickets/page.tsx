import { RequireAuth } from "@/components/auth/require-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { TicketInbox } from "@/components/tickets/ticket-inbox";

export default function TicketsPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-5xl px-4 pb-8 pt-10">
          <TicketInbox />
        </main>
      </RequireAuth>
    </div>
  );
}
