import { RequireAdmin } from "@/components/auth/require-admin";
import { RequireAuth } from "@/components/auth/require-auth";
import { VerificationQueue } from "@/components/admin/verification-queue";
import { SiteHeader } from "@/components/layout/site-header";

export default function AdminVerificationPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <RequireAdmin>
          <main className="mx-auto w-full max-w-5xl px-4 pb-8 pt-10">
            <div className="mb-6 glass rounded-3xl p-6">
              <h1 className="text-3xl font-semibold tracking-tight">
                Admin Verification Queue
              </h1>
              <p className="mt-2 text-sm text-muted">
                Review pending business applications and issue certificates directly from
                this queue.
              </p>
            </div>

            <VerificationQueue />
          </main>
        </RequireAdmin>
      </RequireAuth>
    </div>
  );
}
