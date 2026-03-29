import { RequireAuth } from "@/components/auth/require-auth";
import { BusinessEmployeeManager } from "@/components/business/business-employee-manager";
import { SiteHeader } from "@/components/layout/site-header";

export default function BusinessEmployeesPage() {
  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-5xl px-4 pb-8 pt-10">
          <BusinessEmployeeManager />
        </main>
      </RequireAuth>
    </div>
  );
}
