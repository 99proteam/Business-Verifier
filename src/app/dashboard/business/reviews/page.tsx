import { RequireAuth } from "@/components/auth/require-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { BusinessReviewsManager } from "@/components/reviews/business-reviews-manager";

export default function BusinessReviewsPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
          <BusinessReviewsManager />
        </main>
      </RequireAuth>
    </div>
  );
}
