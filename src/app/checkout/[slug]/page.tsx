import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { CheckoutView } from "@/components/orders/checkout-view";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

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
        <CheckoutView slug={slug} />
      </main>
    </div>
  );
}
