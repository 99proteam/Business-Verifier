import { Suspense } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { VerifyMfaPanel } from "./verify-mfa-panel";

function LoadingFallback() {
  return (
    <div className="glass mx-auto w-full max-w-md rounded-3xl p-7">
      <h1 className="text-2xl font-semibold tracking-tight">Loading verification</h1>
      <p className="mt-2 text-sm text-muted">Preparing authenticator check...</p>
    </div>
  );
}

export default function VerifyMfaPage() {
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto flex min-h-[70vh] w-full max-w-6xl items-center px-4 py-8">
        <Suspense fallback={<LoadingFallback />}>
          <VerifyMfaPanel />
        </Suspense>
      </main>
    </div>
  );
}
