import Link from "next/link";
import { RequireAuth } from "@/components/auth/require-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { OrderDetails } from "@/components/orders/order-details";

export default async function OrderDetailsPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-5xl px-4 pb-8 pt-10">
          <Link
            href="/dashboard/orders"
            className="mb-4 inline-flex rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40"
          >
            Back to orders
          </Link>
          <OrderDetails orderId={orderId} />
        </main>
      </RequireAuth>
    </div>
  );
}
