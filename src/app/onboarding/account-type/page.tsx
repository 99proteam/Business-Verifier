import { Suspense } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { AccountTypeOnboardingPanel } from "@/app/onboarding/account-type/account-type-onboarding-panel";

export default function AccountTypeOnboardingPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 pb-10 pt-8">
        <Suspense
          fallback={
            <div className="rounded-2xl border border-border bg-white p-8 shadow-sm">
              <div className="h-6 w-48 rounded-lg shimmer mb-3" />
              <div className="h-4 w-64 rounded-lg shimmer" />
            </div>
          }
        >
          <AccountTypeOnboardingPanel />
        </Suspense>
      </main>
    </div>
  );
}
