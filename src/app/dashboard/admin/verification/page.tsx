import { RequireAdmin } from "@/components/auth/require-admin";
import { RequireAuth } from "@/components/auth/require-auth";
import { VerificationQueue } from "@/components/admin/verification-queue";
import { SiteHeader } from "@/components/layout/site-header";

export default function AdminVerificationPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <RequireAuth>
        <RequireAdmin>
          <main className="mx-auto w-full max-w-5xl px-4 pb-10 pt-8">
            <div className="mb-6 rounded-2xl border border-border bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>
                </span>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-foreground">Verification Queue</h1>
                  <p className="text-sm text-muted">Review pending business applications and issue trust certificates</p>
                </div>
              </div>
            </div>

            <VerificationQueue />
          </main>
        </RequireAdmin>
      </RequireAuth>
    </div>
  );
}
