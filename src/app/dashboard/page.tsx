"use client";

import Link from "next/link";
import {
  Bell,
  Building2,
  CircleDollarSign,
  FileText,
  Handshake,
  IdCard,
  Megaphone,
  Settings,
  ShieldCheck,
  Star,
  Ticket,
  TrendingUp,
  Users,
} from "lucide-react";
import { RequireAuth } from "@/components/auth/require-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { useAuth } from "@/components/providers/auth-provider";

type CardDef = {
  title: string;
  body: string;
  href: string;
  icon: React.ElementType;
};

type CardGroup = {
  group: string;
  groupColor: string;
  groupBg: string;
  groupIcon: React.ElementType;
  cards: CardDef[];
};

const customerCards: CardGroup[] = [
  {
    group: "Orders & Payments",
    groupColor: "text-emerald-600",
    groupBg: "bg-emerald-50",
    groupIcon: CircleDollarSign,
    cards: [
      {
        title: "My Orders",
        body: "Track purchased orders, refund windows, and escrow lock/release timeline.",
        href: "/dashboard/orders",
        icon: CircleDollarSign,
      },
      {
        title: "Wallet & Withdrawals",
        body: "Top-up wallet, review ledger, and request withdrawals with country details.",
        href: "/dashboard/wallet",
        icon: CircleDollarSign,
      },
      {
        title: "Customer Membership",
        body: "Buy verifier customer membership and manage your discount identity.",
        href: "/dashboard/membership/customer",
        icon: IdCard,
      },
    ],
  },
  {
    group: "Support & Verification",
    groupColor: "text-blue-600",
    groupBg: "bg-blue-50",
    groupIcon: ShieldCheck,
    cards: [
      {
        title: "Business Verification",
        body: "Start verification flow for online/offline business and certificate issuance.",
        href: "/dashboard/business/onboarding",
        icon: ShieldCheck,
      },
      {
        title: "Support Tickets",
        body: "Create tickets, chat in thread, escalate to admin, and reopen if needed.",
        href: "/dashboard/tickets",
        icon: Ticket,
      },
      {
        title: "Security Center",
        body: "Manage authenticator MFA, backup codes, and account security posture.",
        href: "/dashboard/security",
        icon: Settings,
      },
    ],
  },
  {
    group: "Reviews & Favorites",
    groupColor: "text-amber-600",
    groupBg: "bg-amber-50",
    groupIcon: Star,
    cards: [
      {
        title: "My Reviews",
        body: "Track your posted reviews and mark issue resolution outcomes.",
        href: "/dashboard/reviews",
        icon: Star,
      },
      {
        title: "Favorite Products",
        body: "View all digital products you marked favorite and open them quickly.",
        href: "/dashboard/favorites",
        icon: Star,
      },
    ],
  },
  {
    group: "Community & Network",
    groupColor: "text-purple-600",
    groupBg: "bg-purple-50",
    groupIcon: Users,
    cards: [
      {
        title: "Following Businesses",
        body: "Manage businesses you follow and quickly raise support tickets.",
        href: "/dashboard/following",
        icon: Users,
      },
      {
        title: "My Groups",
        body: "See groups you created and groups you joined as a member.",
        href: "/dashboard/groups",
        icon: Handshake,
      },
      {
        title: "Partnership Marketplace",
        body: "Find collaboration opportunities and open verified deal chats.",
        href: "/partnerships",
        icon: Handshake,
      },
      {
        title: "My Partnership Deals",
        body: "Track negotiation chats, agreement amounts, and 2% fee settlements.",
        href: "/dashboard/partnerships",
        icon: Handshake,
      },
    ],
  },
  {
    group: "Notifications",
    groupColor: "text-rose-600",
    groupBg: "bg-rose-50",
    groupIcon: Bell,
    cards: [
      {
        title: "Notification Center",
        body: "Receive offer/update/emergency notifications and mark spam items.",
        href: "/dashboard/notifications",
        icon: Bell,
      },
    ],
  },
];

const businessCards: CardGroup[] = [
  {
    group: "Sales & Revenue",
    groupColor: "text-emerald-600",
    groupBg: "bg-emerald-50",
    groupIcon: CircleDollarSign,
    cards: [
      {
        title: "Products & Services",
        body: "Create products/services, mark no-refund tags, and track favorite customers.",
        href: "/dashboard/business/products",
        icon: CircleDollarSign,
      },
      {
        title: "Shop Website Builder",
        body: "Configure storefront theme, custom domain, SEO, and order settings.",
        href: "/dashboard/business/products#shop-builder",
        icon: Building2,
      },
      {
        title: "Business Sales / Refunds",
        body: "See digital product sales, pending refunds, and refunded amounts.",
        href: "/dashboard/business/orders",
        icon: CircleDollarSign,
      },
      {
        title: "Business Billing",
        body: "Track month-wise invoices for sales commission, API usage, and ads.",
        href: "/dashboard/business/billing",
        icon: FileText,
      },
    ],
  },
  {
    group: "Trust & Verification",
    groupColor: "text-blue-600",
    groupBg: "bg-blue-50",
    groupIcon: ShieldCheck,
    cards: [
      {
        title: "Business Verification",
        body: "Start verification flow for online/offline business and certificate issuance.",
        href: "/dashboard/business/onboarding",
        icon: ShieldCheck,
      },
      {
        title: "Pro Deposit Manager",
        body: "Top up locked trust deposits and withdraw unlocked balance.",
        href: "/dashboard/business/deposit",
        icon: ShieldCheck,
      },
      {
        title: "Widget Manager",
        body: "Copy trust badge code and track widget impressions/click analytics.",
        href: "/dashboard/business/widgets",
        icon: ShieldCheck,
      },
      {
        title: "Business Reviews",
        body: "Respond to proof-backed customer reviews and resolve complaints.",
        href: "/dashboard/business/reviews",
        icon: Star,
      },
    ],
  },
  {
    group: "Team Management",
    groupColor: "text-purple-600",
    groupBg: "bg-purple-50",
    groupIcon: Users,
    cards: [
      {
        title: "Employees",
        body: "Add/remove employee accounts and manage business team access.",
        href: "/dashboard/business/employees",
        icon: Users,
      },
      {
        title: "Employee Performance",
        body: "Review employee monthly performance and publish internal scorecards.",
        href: "/dashboard/business/employees/performance",
        icon: Users,
      },
    ],
  },
  {
    group: "Marketing & Engagement",
    groupColor: "text-amber-600",
    groupBg: "bg-amber-50",
    groupIcon: Megaphone,
    cards: [
      {
        title: "Ads Manager",
        body: "Create campaigns, target cities, and monitor banner impressions.",
        href: "/dashboard/business/ads",
        icon: Megaphone,
      },
      {
        title: "Business Groups",
        body: "Create business communities, share widgets, and control chat permissions.",
        href: "/dashboard/business/groups",
        icon: Handshake,
      },
      {
        title: "Membership Engine",
        body: "Configure discount program, upload transactions, and check payout reports.",
        href: "/dashboard/business/membership",
        icon: IdCard,
      },
      {
        title: "Business Notifications API",
        body: "Create API endpoints and send notifications by public user IDs.",
        href: "/dashboard/business/notifications",
        icon: Bell,
      },
      {
        title: "Growth Suite",
        body: "Manage trust timeline, API keys, CRM, referrals, compliance, and conversion insights.",
        href: "/dashboard/business/growth",
        icon: TrendingUp,
      },
    ],
  },
];

const adminCards: CardGroup[] = [
  {
    group: "Verification & Identity",
    groupColor: "text-emerald-600",
    groupBg: "bg-emerald-50",
    groupIcon: ShieldCheck,
    cards: [
      {
        title: "Verification Queue",
        body: "Review pending business applications and issue trust certificates.",
        href: "/dashboard/admin/verification",
        icon: ShieldCheck,
      },
      {
        title: "Identity Controls",
        body: "Verify participant identities required for partnership chat access.",
        href: "/dashboard/admin/identity",
        icon: ShieldCheck,
      },
      {
        title: "Deposit Controls",
        body: "Release matured deposit locks and apply forfeiture adjustments.",
        href: "/dashboard/admin/deposits",
        icon: ShieldCheck,
      },
    ],
  },
  {
    group: "Finance & Billing",
    groupColor: "text-blue-600",
    groupBg: "bg-blue-50",
    groupIcon: CircleDollarSign,
    cards: [
      {
        title: "Orders Queue",
        body: "Approve refund requests and release escrow after lock duration.",
        href: "/dashboard/admin/orders",
        icon: CircleDollarSign,
      },
      {
        title: "Wallet Controls",
        body: "Set withdrawal charges, adjust user wallets, and review payout requests.",
        href: "/dashboard/admin/wallet",
        icon: CircleDollarSign,
      },
      {
        title: "Billing Controls",
        body: "Generate invoices for all businesses and mark collections as paid.",
        href: "/dashboard/admin/billing",
        icon: FileText,
      },
      {
        title: "Reconciliation",
        body: "Export month-wise finance reconciliation in JSON and CSV formats.",
        href: "/dashboard/admin/reconciliation",
        icon: FileText,
      },
    ],
  },
  {
    group: "Platform Management",
    groupColor: "text-purple-600",
    groupBg: "bg-purple-50",
    groupIcon: Settings,
    cards: [
      {
        title: "Ticket Queue",
        body: "Review dispute threads and post resolve/refund decisions.",
        href: "/dashboard/admin/tickets",
        icon: Ticket,
      },
      {
        title: "Group Monitor",
        body: "Track group activity and inspect admin/public messaging spaces.",
        href: "/dashboard/admin/groups",
        icon: Handshake,
      },
      {
        title: "Ads Controls",
        body: "Approve ad campaigns and configure CPM/city targeting pricing.",
        href: "/dashboard/admin/ads",
        icon: Megaphone,
      },
      {
        title: "Partnership Monitor",
        body: "Inspect partnership chats, deal agreements, and fee settlement records.",
        href: "/dashboard/admin/partnerships",
        icon: Handshake,
      },
      {
        title: "Membership Controls",
        body: "Set economics, run weighted distribution cycles, and manage participation.",
        href: "/dashboard/admin/membership",
        icon: IdCard,
      },
    ],
  },
  {
    group: "Monitoring & Audit",
    groupColor: "text-rose-600",
    groupBg: "bg-rose-50",
    groupIcon: FileText,
    cards: [
      {
        title: "Audit Stream",
        body: "Track unified immutable logs for sensitive platform actions.",
        href: "/dashboard/admin/audit",
        icon: FileText,
      },
      {
        title: "Automation Monitor",
        body: "Run and monitor invoice, escrow, deposit, and billing automation jobs.",
        href: "/dashboard/admin/automation",
        icon: Settings,
      },
      {
        title: "Notification Controls",
        body: "Block/unblock endpoints, review spam signals, and set API charges.",
        href: "/dashboard/admin/notifications",
        icon: Bell,
      },
      {
        title: "Risk Operations",
        body: "Review tier upgrades, SLA breaches, evidence scoring, and merchant risk profiles.",
        href: "/dashboard/admin/risk",
        icon: ShieldCheck,
      },
    ],
  },
];

const employeeCards: CardGroup[] = [
  {
    group: "My Work",
    groupColor: "text-emerald-600",
    groupBg: "bg-emerald-50",
    groupIcon: Building2,
    cards: [
      {
        title: "My Assignments",
        body: "Check businesses where your account is assigned as an employee.",
        href: "/dashboard/employment",
        icon: Building2,
      },
      {
        title: "Support Tickets",
        body: "Create tickets, chat in thread, escalate to admin, and reopen if needed.",
        href: "/dashboard/tickets",
        icon: Ticket,
      },
      {
        title: "Security Center",
        body: "Manage authenticator MFA, backup codes, and account security posture.",
        href: "/dashboard/security",
        icon: Settings,
      },
    ],
  },
  {
    group: "Network",
    groupColor: "text-purple-600",
    groupBg: "bg-purple-50",
    groupIcon: Users,
    cards: [
      {
        title: "My Groups",
        body: "See groups you created and groups you joined as a member.",
        href: "/dashboard/groups",
        icon: Handshake,
      },
      {
        title: "Partnership Marketplace",
        body: "Find collaboration opportunities and open verified deal chats.",
        href: "/partnerships",
        icon: Handshake,
      },
      {
        title: "Notification Center",
        body: "Receive offer/update/emergency notifications.",
        href: "/dashboard/notifications",
        icon: Bell,
      },
    ],
  },
];

function DashboardModuleGroup({ group }: { group: CardGroup }) {
  const GroupIcon = group.groupIcon;
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-4">
        <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${group.groupBg} ${group.groupColor}`}>
          <GroupIcon size={16} />
        </span>
        <h2 className={`font-semibold text-sm ${group.groupColor}`}>{group.group}</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {group.cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.title}
              href={card.href}
              className="group flex flex-col rounded-2xl border border-border bg-white p-5 shadow-sm transition hover:border-brand/30 hover:shadow-md card-hover"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand/8 text-brand group-hover:bg-brand group-hover:text-white transition-colors">
                <Icon size={16} />
              </span>
              <h3 className="mt-3 font-semibold text-sm text-foreground leading-snug">{card.title}</h3>
              <p className="mt-1.5 text-xs text-muted leading-relaxed flex-1">{card.body}</p>
              <span className="mt-3 text-xs font-medium text-brand opacity-0 group-hover:opacity-100 transition-opacity">
                Open →
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, role, isAdmin } = useAuth();

  const groups = isAdmin
    ? adminCards
    : role === "business_owner"
      ? businessCards
      : role === "employee"
        ? employeeCards
        : customerCards;

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  })();

  const roleLabel = isAdmin
    ? "Administrator"
    : role === "business_owner"
      ? "Business Owner"
      : role === "employee"
        ? "Employee"
        : "Customer";

  const roleBadgeStyle = isAdmin
    ? "bg-purple-100 text-purple-700 border-purple-200"
    : role === "business_owner"
      ? "bg-blue-100 text-blue-700 border-blue-200"
      : role === "employee"
        ? "bg-amber-100 text-amber-700 border-amber-200"
        : "bg-emerald-100 text-emerald-700 border-emerald-200";

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <RequireAuth>
        <main className="mx-auto w-full max-w-6xl px-4 pb-12 pt-8">

          {/* Welcome header */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-7 md:p-8 mb-8">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-indigo/10 blur-2xl" />
            <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${roleBadgeStyle}`}>
                    <ShieldCheck size={11} />
                    {roleLabel}
                  </span>
                </div>
                <h1 className="text-2xl font-bold text-white md:text-3xl">
                  {greeting}, {user?.displayName?.split(" ")[0] ?? "there"}
                </h1>
                <p className="mt-1.5 text-sm text-slate-400">
                  Welcome to your secure workspace — {user?.email}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/directory"
                  className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong"
                >
                  <Building2 size={15} />
                  Browse Directory
                </Link>
                <Link
                  href="/dashboard/tickets"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
                >
                  <Ticket size={15} />
                  Support
                </Link>
              </div>
            </div>
          </div>

          {/* Module groups */}
          <div className="space-y-10">
            {groups.map((group) => (
              <DashboardModuleGroup key={group.group} group={group} />
            ))}
          </div>
        </main>
      </RequireAuth>
    </div>
  );
}
