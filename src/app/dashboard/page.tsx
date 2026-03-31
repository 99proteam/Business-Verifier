"use client";

import Link from "next/link";
import {
  Bell,
  CircleDollarSign,
  FileText,
  Handshake,
  IdCard,
  Megaphone,
  ShieldCheck,
  Star,
  Ticket,
  Users,
} from "lucide-react";
import { RequireAuth } from "@/components/auth/require-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { useAuth } from "@/components/providers/auth-provider";

const cards = [
  {
    title: "Business verification onboarding",
    body: "Start verification flow for online/offline business and certificate issuance.",
    href: "/dashboard/business/onboarding",
    icon: ShieldCheck,
  },
  {
    title: "Ticket center",
    body: "Create tickets, chat in thread, escalate to admin, and reopen if needed.",
    href: "/dashboard/tickets",
    icon: Ticket,
  },
  {
    title: "Orders and escrow",
    body: "Track purchased orders, refund windows, and escrow lock/release timeline.",
    href: "/dashboard/orders",
    icon: CircleDollarSign,
  },
  {
    title: "Wallet and withdrawals",
    body: "Top-up wallet, review ledger, and request withdrawals with country details.",
    href: "/dashboard/wallet",
    icon: CircleDollarSign,
  },
  {
    title: "Security center",
    body: "Manage authenticator MFA, backup codes, and account security posture.",
    href: "/dashboard/security",
    icon: ShieldCheck,
  },
  {
    title: "My product reviews",
    body: "Track your posted reviews and mark issue resolution outcomes.",
    href: "/dashboard/reviews",
    icon: Star,
  },
  {
    title: "Favorite products",
    body: "View all digital products you marked favorite and open them quickly.",
    href: "/dashboard/favorites",
    icon: Star,
  },
  {
    title: "Customer membership",
    body: "Buy verifier customer membership and manage your discount identity.",
    href: "/dashboard/membership/customer",
    icon: IdCard,
  },
  {
    title: "Following businesses",
    body: "Manage businesses you follow and quickly raise support tickets.",
    href: "/dashboard/following",
    icon: Users,
  },
  {
    title: "My employment assignments",
    body: "Check businesses where your account is assigned as an employee.",
    href: "/dashboard/employment",
    icon: Users,
  },
  {
    title: "My groups",
    body: "See groups you created and groups you joined as a member.",
    href: "/dashboard/groups",
    icon: Handshake,
  },
  {
    title: "Partnership marketplace",
    body: "Find collaboration opportunities and open verified deal chats.",
    href: "/partnerships",
    icon: Handshake,
  },
  {
    title: "My partnership deals",
    body: "Track negotiation chats, agreement amounts, and 2% fee settlements.",
    href: "/dashboard/partnerships",
    icon: Handshake,
  },
  {
    title: "Business groups",
    body: "Create business communities, share widgets, and control chat permissions.",
    href: "/dashboard/business/groups",
    icon: Handshake,
  },
  {
    title: "Business employees",
    body: "Add/remove employee accounts and manage business team access.",
    href: "/dashboard/business/employees",
    icon: Users,
  },
  {
    title: "Pro deposit manager",
    body: "Top up locked trust deposits, withdraw unlocked balance, and copy trust widget code.",
    href: "/dashboard/business/deposit",
    icon: ShieldCheck,
  },
  {
    title: "Employee performance",
    body: "Review employee monthly performance and publish internal scorecards.",
    href: "/dashboard/business/employees/performance",
    icon: Users,
  },
  {
    title: "Products and services",
    body: "Create products/services, mark no-refund tags, and track favorite customers.",
    href: "/dashboard/business/products",
    icon: CircleDollarSign,
  },
  {
    title: "Business sales/refunds",
    body: "See digital product sales, pending refunds, and refunded amounts.",
    href: "/dashboard/business/orders",
    icon: CircleDollarSign,
  },
  {
    title: "Business reviews",
    body: "Respond to proof-backed customer reviews and resolve complaints.",
    href: "/dashboard/business/reviews",
    icon: Star,
  },
  {
    title: "Business ads manager",
    body: "Create campaigns, target cities, and monitor banner impressions.",
    href: "/dashboard/business/ads",
    icon: Megaphone,
  },
  {
    title: "Business billing",
    body: "Track month-wise invoices for sales commission, API usage, and ads.",
    href: "/dashboard/business/billing",
    icon: FileText,
  },
  {
    title: "Business membership engine",
    body: "Configure discount program, upload transactions, and check payout reports.",
    href: "/dashboard/business/membership",
    icon: IdCard,
  },
  {
    title: "Admin ticket queue",
    body: "Review dispute threads and post resolve/refund decisions.",
    href: "/dashboard/admin/tickets",
    icon: Handshake,
  },
  {
    title: "Admin verification queue",
    body: "Review pending business applications and issue trust certificates.",
    href: "/dashboard/admin/verification",
    icon: ShieldCheck,
  },
  {
    title: "Admin orders queue",
    body: "Approve refund requests and release escrow after lock duration.",
    href: "/dashboard/admin/orders",
    icon: CircleDollarSign,
  },
  {
    title: "Admin wallet controls",
    body: "Set withdrawal charges, adjust user wallets, and review payout requests.",
    href: "/dashboard/admin/wallet",
    icon: CircleDollarSign,
  },
  {
    title: "Admin deposit controls",
    body: "Release matured deposit locks and apply forfeiture adjustments.",
    href: "/dashboard/admin/deposits",
    icon: ShieldCheck,
  },
  {
    title: "Admin group monitor",
    body: "Track group activity and inspect admin/public messaging spaces.",
    href: "/dashboard/admin/groups",
    icon: Handshake,
  },
  {
    title: "Admin ads controls",
    body: "Approve ad campaigns and configure CPM/city targeting pricing.",
    href: "/dashboard/admin/ads",
    icon: Megaphone,
  },
  {
    title: "Admin billing controls",
    body: "Generate invoices for all businesses and mark collections as paid.",
    href: "/dashboard/admin/billing",
    icon: FileText,
  },
  {
    title: "Admin partnership monitor",
    body: "Inspect partnership chats, deal agreements, and fee settlement records.",
    href: "/dashboard/admin/partnerships",
    icon: Handshake,
  },
  {
    title: "Admin identity controls",
    body: "Verify participant identities required for partnership chat access.",
    href: "/dashboard/admin/identity",
    icon: ShieldCheck,
  },
  {
    title: "Admin membership controls",
    body: "Set economics, run weighted distribution cycles, and manage participation.",
    href: "/dashboard/admin/membership",
    icon: IdCard,
  },
  {
    title: "Admin audit stream",
    body: "Track unified immutable logs for sensitive platform actions.",
    href: "/dashboard/admin/audit",
    icon: FileText,
  },
  {
    title: "Admin automation monitor",
    body: "Run and monitor invoice, escrow, deposit, and billing automation jobs.",
    href: "/dashboard/admin/automation",
    icon: FileText,
  },
  {
    title: "Admin reconciliation",
    body: "Export month-wise finance reconciliation in JSON and CSV formats.",
    href: "/dashboard/admin/reconciliation",
    icon: FileText,
  },
  {
    title: "Notification center",
    body: "Receive offer/update/emergency notifications and mark spam items.",
    href: "/dashboard/notifications",
    icon: Bell,
  },
  {
    title: "Business notification API",
    body: "Create API endpoints and send notifications by public user IDs.",
    href: "/dashboard/business/notifications",
    icon: Bell,
  },
  {
    title: "Admin notification controls",
    body: "Block/unblock endpoints, review spam signals, and set API charges.",
    href: "/dashboard/admin/notifications",
    icon: Bell,
  },
];

export default function DashboardPage() {
  const { user, role, isAdmin } = useAuth();
  const visibleCards = cards.filter((card) => {
    if (isAdmin) return true;
    if (role === "business_owner") {
      return !card.href.startsWith("/dashboard/admin");
    }
    if (role === "employee") {
      return (
        !card.href.startsWith("/dashboard/admin") &&
        !card.href.startsWith("/dashboard/business") &&
        card.href !== "/dashboard/membership/customer" &&
        card.href !== "/dashboard/favorites" &&
        card.href !== "/dashboard/following"
      );
    }
    return (
      !card.href.startsWith("/dashboard/admin") &&
      !card.href.startsWith("/dashboard/business") &&
      card.href !== "/dashboard/employment"
    );
  });

  return (
    <div>
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
          <div className="glass rounded-3xl p-6 md:p-8">
            <p className="text-sm text-brand-strong">Secure Workspace</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Dashboard</h1>
            <p className="mt-2 text-sm text-muted">
              Signed in as {user?.email ?? "user"}. This is the SaaS control center for
              verification, tickets, escrow, memberships, and monetization.
            </p>
          </div>

          <section className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visibleCards.map((card) => {
              const Icon = card.icon;
              return (
                <article key={card.title} className="glass rounded-2xl p-5">
                  <p className="inline-flex rounded-xl bg-brand/10 p-2 text-brand">
                    <Icon size={17} />
                  </p>
                  <h2 className="mt-3 text-lg font-semibold tracking-tight">{card.title}</h2>
                  <p className="mt-2 text-sm text-muted">{card.body}</p>
                  <Link
                    href={card.href}
                    className="mt-4 inline-flex rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
                  >
                    Open module
                  </Link>
                </article>
              );
            })}
          </section>
        </main>
      </RequireAuth>
    </div>
  );
}
