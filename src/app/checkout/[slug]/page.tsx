import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { CheckoutView } from "@/components/orders/checkout-view";

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ plan?: string }>;
}) {
  const { slug } = await params;
  const { plan } = await searchParams;

  return (
    <div>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 pb-8 pt-10">
        <Link
          href={`/products/${slug}`}
          className="mb-4 inline-flex rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40"
        >
          Back to product
        </Link>
        <CheckoutView slug={slug} selectedPlanKey={plan} />
      </main>
    </div>
  );
}
