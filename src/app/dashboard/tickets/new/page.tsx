import { RequireAuth } from "@/components/auth/require-auth";
import { TicketForm } from "@/components/forms/ticket-form";
import { SiteHeader } from "@/components/layout/site-header";

export default function NewTicketPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-4xl px-4 pb-8 pt-10">
          <TicketForm />
        </main>
      </RequireAuth>
    </div>
  );
}
