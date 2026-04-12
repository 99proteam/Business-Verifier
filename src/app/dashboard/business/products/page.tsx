import { RequireAuth } from "@/components/auth/require-auth";
import { ShopCommerceControls } from "@/components/business/shop-commerce-controls";
import { ShopBuilder } from "@/components/business/shop-builder";
import { SiteHeader } from "@/components/layout/site-header";
import { ProductManager } from "@/components/products/product-manager";

export default function BusinessProductsPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-5xl px-4 pb-8 pt-10">
          <div className="space-y-6">
            <ProductManager />
            <ShopBuilder />
            <ShopCommerceControls />
          </div>
        </main>
      </RequireAuth>
    </div>
  );
}
