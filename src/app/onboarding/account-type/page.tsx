import { Suspense } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { AccountTypeOnboardingPanel } from "@/app/onboarding/account-type/account-type-onboarding-panel";

export default function AccountTypeOnboardingPage() {
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 pb-8 pt-10">
        <Suspense
          fallback={
            <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
              Loading account setup...
            </div>
          }
        >
          <AccountTypeOnboardingPanel />
        </Suspense>
      </main>
    </div>
  );
}
