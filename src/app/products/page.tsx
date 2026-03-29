import { SiteHeader } from "@/components/layout/site-header";
import { ExternalProductsGrid } from "@/components/products/external-products-grid";
import { MarketplaceGrid } from "@/components/products/marketplace-grid";

export default function ProductsPage() {
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
        <div className="space-y-4">
          <MarketplaceGrid />
          <ExternalProductsGrid />
        </div>
      </main>
    </div>
  );
}
