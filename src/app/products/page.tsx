import { SiteHeader } from "@/components/layout/site-header";
import { ExternalProductsGrid } from "@/components/products/external-products-grid";
import { MarketplaceGrid } from "@/components/products/marketplace-grid";
import { ServiceMarketplaceGrid } from "@/components/products/service-marketplace-grid";
import {
  getCachedExternalProducts,
  getCachedPublicProducts,
  getCachedPublicServices,
} from "@/lib/server/public-cache";

export const revalidate = 300;

export default async function ProductsPage() {
  const [products, services, externalProducts] = await Promise.all([
    getCachedPublicProducts().catch(() => []),
    getCachedPublicServices().catch(() => []),
    getCachedExternalProducts().catch(() => []),
  ]);
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
        <div className="space-y-4">
          <MarketplaceGrid initialRows={products} />
          <ServiceMarketplaceGrid rows={services} />
          <ExternalProductsGrid initialRows={externalProducts} />
        </div>
      </main>
    </div>
  );
}
