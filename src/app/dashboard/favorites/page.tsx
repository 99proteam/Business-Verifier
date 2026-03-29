import { RequireAuth } from "@/components/auth/require-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { FavoritesGrid } from "@/components/products/favorites-grid";

export default function DashboardFavoritesPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
          <FavoritesGrid />
        </main>
      </RequireAuth>
    </div>
  );
}
