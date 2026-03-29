import { RequireAuth } from "@/components/auth/require-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { CustomerReviewsDashboard } from "@/components/reviews/customer-reviews-dashboard";

export default function ReviewsPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
          <CustomerReviewsDashboard />
        </main>
      </RequireAuth>
    </div>
  );
}
