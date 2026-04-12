import { ArrowRight, BadgeCheck, CheckCircle2, ShieldCheck, Zap } from "lucide-react";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { MEMBERSHIP_PLANS } from "@/lib/constants";
import { formatINR } from "@/lib/utils";

const planAccents = [
  {
    gradient: "from-slate-50 to-slate-100",
    badge: "bg-slate-100 text-slate-600",
    button: "bg-slate-800 hover:bg-slate-900 text-white",
    border: "border-slate-200",
    iconBg: "bg-slate-200 text-slate-600",
  },
  {
    gradient: "from-emerald-50 to-teal-50",
    badge: "bg-brand/10 text-brand-strong",
    button: "bg-brand hover:bg-brand-strong text-white shadow-md",
    border: "border-emerald-200",
    iconBg: "bg-brand/15 text-brand",
    featured: true,
  },
  {
    gradient: "from-blue-50 to-indigo-50",
    badge: "bg-indigo-100 text-indigo-700",
    button: "bg-indigo-600 hover:bg-indigo-700 text-white",
    border: "border-blue-200",
    iconBg: "bg-indigo-100 text-indigo-600",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero */}
      <div className="border-b border-border bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand-strong">
            <Zap size={12} />
            Simple, Transparent Pricing
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Choose Your Plan
          </h1>
          <p className="mt-3 text-sm text-muted max-w-lg mx-auto leading-relaxed">
            Flexible membership plans for customers and business owners.
            Start free, upgrade when you need more.
          </p>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl px-4 py-12">

        {/* Plans grid */}
        <div className="grid gap-6 md:grid-cols-3 mb-14">
          {MEMBERSHIP_PLANS.map((plan, index) => {
            const accent = planAccents[index % planAccents.length];
            return (
              <article
                key={plan.id}
                className={`relative rounded-2xl border ${accent.border} bg-gradient-to-br ${accent.gradient} p-7 shadow-sm transition hover:shadow-md card-hover flex flex-col`}
              >
                {accent.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white shadow-sm">
                      <BadgeCheck size={12} />
                      Most Popular
                    </span>
                  </div>
                )}

                <div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${accent.badge}`}>
                    {plan.type === "customer_verifier" ? "Customer Plan" : "Business Plan"}
                  </span>
                  <h2 className="mt-3 text-xl font-bold tracking-tight text-foreground">{plan.name}</h2>

                  <div className="mt-4 flex items-end gap-1">
                    <span className="text-3xl font-black text-foreground">{formatINR(plan.monthlyPrice)}</span>
                    <span className="text-sm text-muted mb-1">/month</span>
                  </div>
                  <p className="text-xs text-muted mt-1">
                    or <span className="font-medium">{formatINR(plan.yearlyPrice)}</span> yearly (save ~17%)
                  </p>

                  <ul className="mt-5 space-y-2.5 flex-1">
                    {plan.benefits.map((benefit) => (
                      <li key={benefit} className="flex items-start gap-2.5 text-sm text-foreground">
                        <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-brand" />
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Link
                  href={plan.type === "customer_verifier" ? "/dashboard/membership/customer" : "/dashboard/business/membership"}
                  className={`mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${accent.button}`}
                >
                  Get Started
                  <ArrowRight size={14} />
                </Link>
              </article>
            );
          })}
        </div>

        {/* FAQ / Trust section */}
        <div className="rounded-2xl border border-border bg-white p-8 shadow-sm">
          <div className="text-center mb-8">
            <span className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand-strong">
              <ShieldCheck size={12} />
              All Plans Include
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: ShieldCheck, title: "Verified Business Access", desc: "Browse and interact with manually verified businesses only." },
              { icon: BadgeCheck, title: "Trust Certificate Viewing", desc: "Check digital trust certificates and serial numbers." },
              { icon: Zap, title: "Escrow-Protected Orders", desc: "Payments held safely until delivery is confirmed." },
              { icon: CheckCircle2, title: "Dispute Resolution", desc: "File tickets and get admin-mediated resolutions." },
              { icon: BadgeCheck, title: "Review System", desc: "Read and write proof-backed customer reviews." },
              { icon: ShieldCheck, title: "Secure Authentication", desc: "Gmail-based sign-in with optional MFA support." },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                    <Icon size={16} />
                  </span>
                  <div>
                    <p className="font-semibold text-sm text-foreground">{item.title}</p>
                    <p className="text-xs text-muted mt-0.5 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
