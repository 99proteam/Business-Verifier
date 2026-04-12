import Link from "next/link";
import { RequireAdmin } from "@/components/auth/require-admin";
import { SiteHeader } from "@/components/layout/site-header";
import { ADMIN_LINKS } from "@/lib/constants";

export default function AdminLandingPage() {
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-4 pb-8 pt-10">
        <RequireAdmin>
          <section className="glass rounded-3xl p-6">
            <h1 className="text-2xl font-semibold tracking-tight">Admin Control Center</h1>
            <p className="mt-2 text-sm text-muted">
              Main platform admin panel for verification, disputes, payments, operations,
              and audit controls.
            </p>
          </section>

          <section className="mt-4 grid gap-3 md:grid-cols-2">
            {ADMIN_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-2xl border border-border bg-white p-4 text-sm transition hover:border-brand/40"
              >
                <p className="font-medium">{link.label}</p>
                <p className="mt-1 text-xs text-muted">{link.href}</p>
              </Link>
            ))}
          </section>
        </RequireAdmin>
      </main>
    </div>
  );
}

