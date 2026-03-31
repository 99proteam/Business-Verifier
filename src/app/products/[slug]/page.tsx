import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { ProductDetailsView } from "@/components/products/product-details-view";
import { getCachedProductBySlug } from "@/lib/server/public-cache";

export const revalidate = 300;

export default async function ProductDetailsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let loadError: string | null = null;
  let product: Awaited<ReturnType<typeof getCachedProductBySlug>> = null;
  try {
    product = await getCachedProductBySlug(slug);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to load product.";
  }

  return (
    <div>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 pb-8 pt-10">
        <Link
          href="/products"
          className="mb-4 inline-flex rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40"
        >
          Back to marketplace
        </Link>
        <ProductDetailsView product={product} error={loadError} />
      </main>
    </div>
  );
}
