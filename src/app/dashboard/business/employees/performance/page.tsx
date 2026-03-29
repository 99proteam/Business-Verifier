import { RequireAuth } from "@/components/auth/require-auth";
import { EmployeePerformanceManager } from "@/components/business/employee-performance-manager";
import { SiteHeader } from "@/components/layout/site-header";

export default function BusinessEmployeePerformancePage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
          <EmployeePerformanceManager />
        </main>
      </RequireAuth>
    </div>
  );
}
