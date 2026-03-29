import Link from "next/link";
import { RequireAuth } from "@/components/auth/require-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { TicketThread } from "@/components/tickets/ticket-thread";

export default async function TicketDetailsPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;

  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-5xl px-4 pb-8 pt-10">
          <Link
            href="/dashboard/tickets"
            className="mb-4 inline-flex rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40"
          >
            Back to tickets
          </Link>
          <TicketThread ticketId={ticketId} />
        </main>
      </RequireAuth>
    </div>
  );
}
