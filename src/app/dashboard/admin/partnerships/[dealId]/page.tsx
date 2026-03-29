import Link from "next/link";
import { RequireAdmin } from "@/components/auth/require-admin";
import { RequireAuth } from "@/components/auth/require-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { PartnershipDealThread } from "@/components/partnerships/partnership-deal-thread";

export default async function AdminPartnershipDealPage({
  params,
}: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await params;

  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <RequireAdmin>
          <main className="mx-auto w-full max-w-5xl px-4 pb-8 pt-10">
            <Link
              href="/dashboard/admin/partnerships"
              className="mb-4 inline-flex rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40"
            >
              Back to admin partnerships
            </Link>
            <PartnershipDealThread dealId={dealId} adminMode />
          </main>
        </RequireAdmin>
      </RequireAuth>
    </div>
  );
}
