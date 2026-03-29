import { CheckCircle2 } from "lucide-react";
import { SiteHeader } from "@/components/layout/site-header";
import { MEMBERSHIP_PLANS } from "@/lib/constants";
import { formatINR } from "@/lib/utils";

export default function PricingPage() {
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
        <section className="glass rounded-3xl p-6 md:p-8">
          <h1 className="text-3xl font-semibold tracking-tight">SaaS Plans</h1>
          <p className="mt-2 text-sm text-muted">
            Initial pricing modules for Verifier Customer and Verifier Business tiers.
            Admin-side controls for commissions and feature toggles will be added next.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {MEMBERSHIP_PLANS.map((plan) => (
              <article key={plan.id} className="rounded-2xl border border-border bg-surface p-5">
                <p className="text-xs uppercase tracking-wide text-brand-strong">
                  {plan.type === "customer_verifier" ? "Customer Plan" : "Business Plan"}
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight">{plan.name}</h2>
                <p className="mt-3 text-sm">
                  <span className="text-2xl font-semibold">{formatINR(plan.monthlyPrice)}</span>
                  /month
                </p>
                <p className="text-sm text-muted">or {formatINR(plan.yearlyPrice)} yearly</p>

                <ul className="mt-4 space-y-2">
                  {plan.benefits.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-brand" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  className="mt-5 w-full rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
                >
                  Choose plan
                </button>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
