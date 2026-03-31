import { MembershipPlan } from "@/types/domain";

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/directory", label: "Directory" },
  { href: "/products", label: "Products" },
  { href: "/partnerships", label: "Partnerships" },
  { href: "/groups", label: "Groups" },
  { href: "/pricing", label: "Pricing" },
];

export const PROFILE_LINKS = [
  { href: "/dashboard/tickets", label: "Tickets" },
  { href: "/dashboard/orders", label: "Orders" },
  { href: "/dashboard/wallet", label: "Wallet" },
  { href: "/dashboard/notifications", label: "Alerts" },
  { href: "/dashboard/membership/customer", label: "Membership" },
  { href: "/dashboard/favorites", label: "Favorites" },
  { href: "/dashboard/following", label: "Following" },
  { href: "/dashboard/groups", label: "Groups Dashboard" },
  { href: "/dashboard/partnerships", label: "Partnership Deals" },
  { href: "/dashboard/security", label: "Security" },
  { href: "/dashboard/business/onboarding", label: "Business Onboarding" },
  { href: "/dashboard/business/products", label: "Business Offerings" },
  { href: "/dashboard/business/orders", label: "Business Orders" },
  { href: "/dashboard/business/groups", label: "Business Groups" },
  { href: "/dashboard/business/notifications", label: "Business Notifications" },
  { href: "/dashboard/business/ads", label: "Business Ads" },
  { href: "/dashboard/business/membership", label: "Business Membership" },
  { href: "/dashboard/admin/verification", label: "Admin Verification" },
  { href: "/dashboard/admin/ads", label: "Admin Ads" },
  { href: "/dashboard/admin/tickets", label: "Admin Tickets" },
  { href: "/dashboard/admin/orders", label: "Admin Orders" },
  { href: "/dashboard/admin/wallet", label: "Admin Wallet" },
  { href: "/dashboard", label: "Dashboard" },
];

export type UserRoleType = "customer" | "employee" | "business_owner";

export const CUSTOMER_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/orders", label: "Orders" },
  { href: "/dashboard/tickets", label: "Tickets" },
  { href: "/dashboard/wallet", label: "Wallet" },
  { href: "/dashboard/membership/customer", label: "Membership" },
  { href: "/dashboard/favorites", label: "Favorites" },
  { href: "/dashboard/following", label: "Following" },
  { href: "/dashboard/groups", label: "Groups" },
  { href: "/dashboard/partnerships", label: "Partnerships" },
  { href: "/dashboard/notifications", label: "Notifications" },
  { href: "/dashboard/security", label: "Security" },
];

export const EMPLOYEE_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/employment", label: "Employment" },
  { href: "/dashboard/tickets", label: "Tickets" },
  { href: "/dashboard/groups", label: "Groups" },
  { href: "/dashboard/notifications", label: "Notifications" },
  { href: "/dashboard/security", label: "Security" },
];

export const BUSINESS_OWNER_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/business/onboarding", label: "Business Onboarding" },
  { href: "/dashboard/business/products", label: "Products and Services" },
  { href: "/dashboard/business/orders", label: "Business Orders" },
  { href: "/dashboard/business/reviews", label: "Business Reviews" },
  { href: "/dashboard/business/employees", label: "Employees" },
  { href: "/dashboard/business/groups", label: "Business Groups" },
  { href: "/dashboard/business/notifications", label: "Notification API" },
  { href: "/dashboard/business/ads", label: "Business Ads" },
  { href: "/dashboard/business/billing", label: "Business Billing" },
  { href: "/dashboard/business/membership", label: "Business Membership" },
  { href: "/dashboard/business/deposit", label: "Pro Deposit" },
  { href: "/dashboard/wallet", label: "Wallet" },
  { href: "/dashboard/tickets", label: "Tickets" },
];

export const ADMIN_LINKS = [
  { href: "/dashboard/admin/verification", label: "Admin Verification" },
  { href: "/dashboard/admin/tickets", label: "Admin Tickets" },
  { href: "/dashboard/admin/orders", label: "Admin Orders" },
  { href: "/dashboard/admin/deposits", label: "Admin Deposits" },
  { href: "/dashboard/admin/wallet", label: "Admin Wallet" },
  { href: "/dashboard/admin/billing", label: "Admin Billing" },
  { href: "/dashboard/admin/ads", label: "Admin Ads" },
  { href: "/dashboard/admin/groups", label: "Admin Groups" },
  { href: "/dashboard/admin/membership", label: "Admin Membership" },
  { href: "/dashboard/admin/notifications", label: "Admin Notifications" },
  { href: "/dashboard/admin/reconciliation", label: "Admin Reconciliation" },
  { href: "/dashboard/admin/automation", label: "Admin Automation" },
  { href: "/dashboard/admin/audit", label: "Admin Audit" },
];

export function resolveRoleNavigation(role: string, isAdmin: boolean) {
  const normalizedRole: UserRoleType =
    role === "employee" || role === "business_owner" ? role : "customer";
  const dedupe = (rows: Array<{ href: string; label: string }>) =>
    Array.from(new Map(rows.map((row) => [row.href, row])).values());
  if (isAdmin) {
    return dedupe([...ADMIN_LINKS, ...BUSINESS_OWNER_LINKS, ...CUSTOMER_LINKS]);
  }
  if (normalizedRole === "business_owner") return BUSINESS_OWNER_LINKS;
  if (normalizedRole === "employee") return EMPLOYEE_LINKS;
  return CUSTOMER_LINKS;
}

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
