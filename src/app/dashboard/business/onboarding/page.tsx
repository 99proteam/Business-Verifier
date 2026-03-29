import { RequireAuth } from "@/components/auth/require-auth";
import { BusinessOnboardingForm } from "@/components/forms/business-onboarding-form";
import { SiteHeader } from "@/components/layout/site-header";

export default function BusinessOnboardingPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-4xl px-4 pb-8 pt-10">
          <BusinessOnboardingForm />
        </main>
      </RequireAuth>
    </div>
  );
}
