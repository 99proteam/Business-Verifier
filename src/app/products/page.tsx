import { SiteHeader } from "@/components/layout/site-header";
import { MarketplaceGrid } from "@/components/products/marketplace-grid";

export default function ProductsPage() {
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
        <MarketplaceGrid />
      </main>
    </div>
  );
}
