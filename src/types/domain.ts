export type UserRole =
  | "customer"
  | "business_basic"
  | "business_pro"
  | "employee"
  | "admin";

export type BusinessMode = "online" | "offline" | "hybrid";
export type BusinessStage = "idea" | "running";
export type VerificationStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "expired";
export type TicketPriority = "low" | "medium" | "high" | "critical";
export type TicketStatus =
  | "open"
  | "in_discussion"
  | "awaiting_admin"
  | "resolved"
  | "refunded"
  | "closed";
export type MembershipType = "customer_verifier" | "business_verifier";

export interface UserProfile {
  uid: string;
  publicId: string;
  role: UserRole;
  displayName: string;
  email: string;
  photoURL?: string;
  city?: string;
  country?: string;
  createdAt: string;
  isIdentityVerified: boolean;
  walletId: string;
}

export interface BusinessProfile {
  id: string;
  ownerUid: string;
  businessName: string;
  slug: string;
  mode: BusinessMode;
  stage: BusinessStage;
  category: string;
  yearsInField: number;
  supportEmail: string;
  supportPhone: string;
  address: string;
  city: string;
  country: string;
  website?: string;
  status: VerificationStatus;
  certificateId?: string;
  trustScore: number;
  followersCount: number;
  isPartnershipOpen: boolean;
  partnershipCategory?: string;
  partnershipAmountMin?: number;
  partnershipAmountMax?: number;
  createdAt: string;
  updatedAt: string;
}

export interface VerificationDocument {
  id: string;
  businessId: string;
  label: string;
  isPublic: boolean;
  fileUrl: string;
  uploadedAt: string;
}

export interface VerificationCheck {
  businessId: string;
  mobileVerified: boolean;
  addressVerified: boolean;
  bankAccountVerified: boolean;
  businessInfoVerified: boolean;
  publicDocumentsVerified: boolean;
  completedAt?: string;
}

export interface Certificate {
  id: string;
  businessId: string;
  issuedAt: string;
  validUntil: string;
  serialNumber: string;
  verificationSummary: string[];
}

export interface DepositLedger {
  id: string;
  businessId: string;
  amount: number;
  currency: "INR";
  lockUntil: string;
  reason: "pro_plan_security_deposit" | "manual_topup";
  createdAt: string;
}

export interface Ticket {
  id: string;
  businessId: string;
  customerUid: string;
  orderId?: string;
  title: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  hasEvidenceFiles: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  senderUid: string;
  senderRole: UserRole;
  text: string;
  attachments: string[];
  createdAt: string;
}

export interface DigitalProduct {
  id: string;
  businessId: string;
  title: string;
  description: string;
  price: number;
  noRefund: boolean;
  tags: string[];
  uniqueLinkSlug: string;
  favoritesCount: number;
  createdAt: string;
}

export interface Order {
  id: string;
  productId: string;
  businessId: string;
  customerUid: string;
  amount: number;
  status: "paid" | "released" | "refunded";
  escrowReleaseAt: string;
  refundDeadlineAt: string;
  createdAt: string;
}

export interface Wallet {
  id: string;
  ownerUid: string;
  balance: number;
  currency: "INR";
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  type: "credit" | "debit" | "withdrawal_request" | "withdrawal_fees";
  amount: number;
  reason: string;
  referenceId?: string;
  createdAt: string;
}

export interface Group {
  id: string;
  businessId: string;
  title: string;
  description: string;
  joinCode: string;
  adminOnlyMessaging: boolean;
  membersCount: number;
  widgetCode: string;
  createdAt: string;
}

export interface NotificationEndpoint {
  id: string;
  businessId: string;
  endpointSecret: string;
  status: "active" | "blocked" | "spam_review";
  sentCount: number;
  createdAt: string;
}

export interface AdCampaign {
  id: string;
  businessId: string;
  title: string;
  cityTargets: string[];
  status: "draft" | "active" | "paused" | "ended";
  monthlyBudget: number;
  impressions: number;
  createdAt: string;
}

export interface MembershipPlan {
  id: string;
  type: MembershipType;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  benefits: string[];
}

export interface WeightedDistributionInput {
  businessId: string;
  eligibleTransactions: number;
  eligibleGrossValue: number;
}

export interface WeightedDistributionResult {
  businessId: string;
  weight: number;
  shareAmount: number;
  explanation: string;
}
