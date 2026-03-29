import { MembershipPlan } from "@/types/domain";

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/directory", label: "Directory" },
  { href: "/products", label: "Products" },
  { href: "/partnerships", label: "Partnerships" },
  { href: "/groups", label: "Groups" },
  { href: "/dashboard/orders", label: "Orders" },
  { href: "/dashboard/wallet", label: "Wallet" },
  { href: "/dashboard/notifications", label: "Alerts" },
  { href: "/dashboard/membership/customer", label: "Membership" },
  { href: "/pricing", label: "Pricing" },
  { href: "/dashboard/tickets", label: "Tickets" },
  { href: "/dashboard", label: "Dashboard" },
];

export const MEMBERSHIP_PLANS: MembershipPlan[] = [
  {
    id: "customer-verifier",
    type: "customer_verifier",
    name: "Verifier Customer",
    monthlyPrice: 199,
    yearlyPrice: 1990,
    benefits: [
      "Minimum 10% instant discount on participating stores",
      "Priority ticket handling and faster admin intervention",
      "Special buyer protection visibility in eligible businesses",
      "Unique customer verification identity",
    ],
  },
  {
    id: "business-basic",
    type: "business_verifier",
    name: "Verifier Business Basic",
    monthlyPrice: 499,
    yearlyPrice: 4990,
    benefits: [
      "Public profile with business verification status",
      "Ticket workflow for support and trust operations",
      "Digital product selling (platform fee applies)",
      "Notification API access and city-wise listing",
    ],
  },
  {
    id: "business-pro",
    type: "business_verifier",
    name: "Verifier Business Pro",
    monthlyPrice: 1499,
    yearlyPrice: 14990,
    benefits: [
      "All Basic features + publicly visible security deposit",
      "Priority placement in trust directory and badges",
      "Advanced analytics and history logs",
      "Eligibility for weighted membership revenue share",
    ],
  },
];

export const CORE_MODULES = [
  "Google sign-in and role-based access",
  "Business verification and certificate engine",
  "Ticket, chat, and admin intervention workflows",
  "Escrow/refund lifecycle for digital products",
  "Wallet, deposits, withdrawals, and audit trails",
  "Groups, widgets, reviews, ads, and notification API",
  "Partnership marketplace, verified chat, and fee settlement",
  "Verifier customer membership and weighted distribution economics",
];
