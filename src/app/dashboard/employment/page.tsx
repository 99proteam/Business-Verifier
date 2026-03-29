import { RequireAuth } from "@/components/auth/require-auth";
import { EmployeeAssignmentsDashboard } from "@/components/business/employee-assignments-dashboard";
import { SiteHeader } from "@/components/layout/site-header";

export default function DashboardEmploymentPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-5xl px-4 pb-8 pt-10">
          <EmployeeAssignmentsDashboard />
        </main>
      </RequireAuth>
    </div>
  );
}
