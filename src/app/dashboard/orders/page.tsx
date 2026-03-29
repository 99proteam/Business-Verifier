import { RequireAuth } from "@/components/auth/require-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { OrdersList } from "@/components/orders/orders-list";

export default function OrdersPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-5xl px-4 pb-8 pt-10">
          <OrdersList />
        </main>
      </RequireAuth>
    </div>
  );
}
