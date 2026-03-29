import { Suspense } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { SignInPanel } from "./sign-in-panel";

function SignInLoadingFallback() {
  return (
    <div className="glass mx-auto w-full max-w-md rounded-3xl p-7">
      <h1 className="text-2xl font-semibold tracking-tight">Loading sign-in</h1>
      <p className="mt-2 text-sm text-muted">Preparing secure Gmail login panel...</p>
    </div>
  );
}

export default function SignInPage() {
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto flex min-h-[70vh] w-full max-w-6xl items-center px-4 py-8">
        <Suspense fallback={<SignInLoadingFallback />}>
          <SignInPanel />
        </Suspense>
      </main>
    </div>
  );
}
