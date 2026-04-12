import Link from "next/link";
import { ShieldCheck, Mail, Globe, ExternalLink } from "lucide-react";

const footerLinks = {
  platform: [
    { label: "Business Directory", href: "/directory" },
    { label: "Products & Services", href: "/products" },
    { label: "Groups", href: "/groups" },
    { label: "Partnerships", href: "/partnerships" },
    { label: "Pricing Plans", href: "/pricing" },
  ],
  business: [
    { label: "Verify Your Business", href: "/dashboard/business/onboarding" },
    { label: "Business Dashboard", href: "/dashboard" },
    { label: "Ads Manager", href: "/dashboard/business/ads" },
    { label: "Employee Manager", href: "/dashboard/business/employees" },
    { label: "Billing", href: "/dashboard/business/billing" },
  ],
  customers: [
    { label: "Sign In", href: "/sign-in" },
    { label: "My Dashboard", href: "/dashboard" },
    { label: "Membership Plans", href: "/dashboard/membership/customer" },
    { label: "My Orders", href: "/dashboard/orders" },
    { label: "Support Tickets", href: "/dashboard/tickets" },
  ],
};

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-white mt-16">
      {/* Main footer */}
      <div className="mx-auto w-full max-w-6xl px-4 py-12">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          {/* Brand column */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2.5 group w-fit">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white shadow-sm">
                <ShieldCheck size={20} strokeWidth={2.5} />
              </span>
              <span className="font-bold text-foreground text-lg">
                Business<span className="text-brand">Verifier</span>
              </span>
            </Link>
            <p className="mt-4 text-sm text-muted leading-relaxed max-w-xs">
              The trusted platform for verifying businesses online. Customers can check business
              credentials and buy with confidence.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <a
                href="#"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted transition hover:border-brand/40 hover:text-brand"
              >
                <ExternalLink size={15} />
              </a>
              <a
                href="#"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted transition hover:border-brand/40 hover:text-brand"
              >
                <Mail size={15} />
              </a>
              <a
                href="#"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted transition hover:border-brand/40 hover:text-brand"
              >
                <Globe size={15} />
              </a>
            </div>
          </div>

          {/* Platform links */}
          <div>
            <h3 className="font-semibold text-sm text-foreground mb-4">Platform</h3>
            <ul className="space-y-2.5">
              {footerLinks.platform.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted transition hover:text-brand"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Business links */}
          <div>
            <h3 className="font-semibold text-sm text-foreground mb-4">For Business</h3>
            <ul className="space-y-2.5">
              {footerLinks.business.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted transition hover:text-brand"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Customer links */}
          <div>
            <h3 className="font-semibold text-sm text-foreground mb-4">For Customers</h3>
            <ul className="space-y-2.5">
              {footerLinks.customers.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted transition hover:text-brand"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Trust banner */}
      <div className="border-t border-border bg-slate-50">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand/10 text-brand">
                <ShieldCheck size={11} />
              </span>
              SSL Secured
            </div>
            <span className="text-border">|</span>
            <p className="text-xs text-muted">© {new Date().getFullYear()} BusinessVerifier. All rights reserved.</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted">
            <Link href="/pricing" className="hover:text-brand transition">Privacy Policy</Link>
            <Link href="/pricing" className="hover:text-brand transition">Terms of Service</Link>
            <Link href="/directory" className="hover:text-brand transition">Verify a Business</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
