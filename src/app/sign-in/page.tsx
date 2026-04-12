import { Suspense } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { SignInPanel } from "./sign-in-panel";

function SignInLoadingFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="rounded-2xl border border-border bg-white p-8 shadow-md w-full max-w-md">
        <div className="h-6 w-40 rounded-lg bg-slate-100 shimmer mb-4" />
        <div className="h-4 w-full rounded-lg bg-slate-100 shimmer mb-2" />
        <div className="h-4 w-3/4 rounded-lg bg-slate-100 shimmer mb-6" />
        <div className="h-12 w-full rounded-xl bg-slate-100 shimmer" />
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <Suspense fallback={<SignInLoadingFallback />}>
        <SignInPanel />
      </Suspense>
    </div>
  );
}
