import { User } from "firebase/auth";
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { LOCATION_CATALOG } from "@/lib/location-catalog";
import {
  buildOtpAuthUri,
  generateBackupCodes,
  generateRandomBase32Secret,
  normalizeBackupCode,
  verifyTotpCode,
} from "@/lib/security/totp";

type TimestampValue = { toDate: () => Date };

function toISODate(value: unknown) {
  const maybeTimestamp = value as TimestampValue | undefined;
  if (maybeTimestamp && typeof maybeTimestamp.toDate === "function") {
    return maybeTimestamp.toDate().toISOString();
  }
  return new Date().toISOString();
}

function toSlug(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getDb() {
  if (!db) {
    throw new Error("Firebase is not configured. Add NEXT_PUBLIC_FIREBASE_* values.");
  }
  return db;
}

function sanitizeAuditMetadata(
  metadata?: Record<string, unknown>,
): Record<string, string | number | boolean | null> | undefined {
  if (!metadata) return undefined;
  const entries = Object.entries(metadata)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        value === null
      ) {
        return [key, value] as const;
      }
      return [key, JSON.stringify(value)] as const;
    });
  if (!entries.length) return undefined;
  return Object.fromEntries(entries);
}

async function recordAuditEvent(payload: {
  actorUid: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  const database = getDb();
  await addDoc(collection(database, "auditEvents"), {
    actorUid: payload.actorUid,
    actorRole: payload.actorRole,
    action: payload.action,
    targetType: payload.targetType,
    targetId: payload.targetId,
    summary: payload.summary,
    metadata: sanitizeAuditMetadata(payload.metadata) ?? null,
    createdAt: serverTimestamp(),
  });
}

function mapAuditEvent(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    actorUid: String(data.actorUid ?? ""),
    actorRole: String(data.actorRole ?? "system"),
    action: String(data.action ?? ""),
    targetType: String(data.targetType ?? ""),
    targetId: String(data.targetId ?? ""),
    summary: String(data.summary ?? ""),
    metadata: (data.metadata as Record<string, string | number | boolean | null>) ?? undefined,
    createdAt: toISODate(data.createdAt),
  } satisfies AuditEventRecord;
}

export async function fetchAuditEvents(limitCount = 250) {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "auditEvents"), orderBy("createdAt", "desc"), limit(limitCount)),
  );
  return snapshots.docs.map((snapshot) => mapAuditEvent(snapshot.id, snapshot.data()));
}

export interface BusinessApplicationInput {
  businessName: string;
  mode: "online" | "offline" | "hybrid";
  stage: "idea" | "running";
  category: string;
  yearsInField: number;
  supportEmail: string;
  supportPhone: string;
  address: string;
  city: string;
  country: string;
  website?: string;
  bankAccountLast4: string;
  publicDocumentsSummary: string;
  lookingForPartnership: boolean;
  partnershipCategory?: string;
  partnershipAmountMin?: number;
  partnershipAmountMax?: number;
  wantsProPlan: boolean;
  proDepositAmount?: number;
  proDepositLockMonths?: number;
}

export interface BusinessApplicationRecord extends BusinessApplicationInput {
  id: string;
  ownerUid: string;
  slug: string;
  status: "pending" | "approved" | "rejected";
  certificateId?: string;
  certificateSerial?: string;
  trustScore: number;
  followersCount: number;
  totalLockedDeposit?: number;
  totalAvailableDeposit?: number;
  trustBadgeCode?: string;
  createdAt: string;
  updatedAt: string;
}

export type ProDepositStatus = "locked" | "available" | "withdrawn" | "forfeited";

export interface ProDepositLedgerRecord {
  id: string;
  businessId: string;
  ownerUid: string;
  ownerName: string;
  amount: number;
  status: ProDepositStatus;
  source: "initial_lock" | "topup_lock" | "unlock" | "withdrawal" | "forfeit";
  lockUntil?: string;
  unlockedAt?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessTrustBadgeRecord {
  businessId: string;
  businessName: string;
  businessSlug: string;
  trustScore: number;
  mode: BusinessApplicationInput["mode"];
  city: string;
  country: string;
  certificateSerial?: string;
  totalLockedDeposit: number;
  totalAvailableDeposit: number;
  supportEmail: string;
  supportPhone: string;
  trustBadgeCode: string;
  profileUrl: string;
}

export interface AuditEventRecord {
  id: string;
  actorUid: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  metadata?: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface FollowedBusinessRecord extends BusinessApplicationRecord {
  followedAt: string;
}

export interface BusinessEmployeeRecord {
  employeeUid: string;
  employeeName: string;
  employeeEmail: string;
  title: string;
  addedByUid: string;
  addedByName: string;
  createdAt: string;
}

export interface EmployeeAssignmentRecord {
  businessId: string;
  businessName: string;
  businessSlug: string;
  ownerUid: string;
  ownerName: string;
  title: string;
  assignedAt: string;
}

export interface EmployeePerformanceReviewRecord {
  id: string;
  businessId: string;
  businessName: string;
  ownerUid: string;
  employeeUid: string;
  employeeName: string;
  employeeEmail: string;
  employeeTitle: string;
  monthKey: string;
  rating: number;
  ticketsHandled: number;
  ticketsResolved: number;
  customerSatisfactionScore: number;
  note: string;
  reviewedByUid: string;
  reviewedByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserIdentityProfileRecord {
  uid: string;
  displayName: string;
  email: string;
  publicId: string;
  role: string;
  isIdentityVerified: boolean;
  createdAt: string;
  updatedAt: string;
  identityVerifiedAt?: string;
  identityVerifiedBy?: string;
  identityVerificationNote?: string;
}

export interface AuthenticatorSettingsRecord {
  enabled: boolean;
  hasPendingEnrollment: boolean;
  backupCodesRemaining: number;
  enrolledAt?: string;
  updatedAt: string;
}

export interface AuthenticatorEnrollmentDraft {
  secret: string;
  backupCodes: string[];
  otpauthUri: string;
  accountLabel: string;
}

export interface SupportTicketInput {
  customerUid: string;
  customerName: string;
  customerEmail: string;
  businessName: string;
  orderReference?: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  expectedOutcome: string;
  evidenceUrls: string[];
}

export type SupportTicketStatus =
  | "open"
  | "in_discussion"
  | "awaiting_admin"
  | "resolved"
  | "refunded"
  | "closed";

export interface SupportTicketRecord extends SupportTicketInput {
  id: string;
  status: SupportTicketStatus;
  participantUids: string[];
  escalationCount: number;
  reopenedCount: number;
  resolutionReason?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  updatedAt: string;
  createdAt: string;
}

export interface TicketMessageInput {
  senderUid: string;
  senderName: string;
  senderRole: "customer" | "business" | "admin";
  text: string;
  attachments?: string[];
}

export interface TicketMessageRecord extends TicketMessageInput {
  id: string;
  ticketId: string;
  attachments: string[];
  createdAt: string;
}

function mapTicketRecord(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    customerUid: String(data.customerUid ?? ""),
    customerName: String(data.customerName ?? "Customer"),
    customerEmail: String(data.customerEmail ?? ""),
    businessName: String(data.businessName ?? ""),
    orderReference: data.orderReference ? String(data.orderReference) : undefined,
    title: String(data.title ?? ""),
    description: String(data.description ?? ""),
    priority: (data.priority as SupportTicketInput["priority"]) ?? "medium",
    expectedOutcome: String(data.expectedOutcome ?? ""),
    evidenceUrls: (data.evidenceUrls as string[]) ?? [],
    status: (data.status as SupportTicketStatus) ?? "open",
    participantUids: (data.participantUids as string[]) ?? [],
    escalationCount: Number(data.escalationCount ?? 0),
    reopenedCount: Number(data.reopenedCount ?? 0),
    resolutionReason: data.resolutionReason
      ? String(data.resolutionReason)
      : undefined,
    resolvedBy: data.resolvedBy ? String(data.resolvedBy) : undefined,
    resolvedAt: data.resolvedAt ? toISODate(data.resolvedAt) : undefined,
    updatedAt: toISODate(data.updatedAt),
    createdAt: toISODate(data.createdAt),
  } satisfies SupportTicketRecord;
}

function deriveTrustScore(data: Record<string, unknown>) {
  const status = String(data.status ?? "pending");
  const years = Number(data.yearsInField ?? 0);
  const hasCertificate = Boolean(data.certificateId);
  const wantsProPlan = Boolean(data.wantsProPlan);
  const hasDetailedDocs = String(data.publicDocumentsSummary ?? "").trim().length >= 20;

  let score = status === "approved" ? 72 : status === "pending" ? 58 : 45;
  score += Math.min(14, Math.max(0, years * 2));
  if (hasCertificate) score += 7;
  if (wantsProPlan) score += 4;
  if (hasDetailedDocs) score += 3;
  return Math.max(35, Math.min(99, Math.round(score)));
}

function mapBusinessApplication(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    ownerUid: String(data.ownerUid ?? ""),
    businessName: String(data.businessName ?? ""),
    mode: (data.mode as BusinessApplicationInput["mode"]) ?? "online",
    stage: (data.stage as BusinessApplicationInput["stage"]) ?? "running",
    category: String(data.category ?? "General"),
    yearsInField: Number(data.yearsInField ?? 0),
    supportEmail: String(data.supportEmail ?? ""),
    supportPhone: String(data.supportPhone ?? ""),
    address: String(data.address ?? ""),
    city: String(data.city ?? ""),
    country: String(data.country ?? ""),
    website: data.website ? String(data.website) : undefined,
    bankAccountLast4: String(data.bankAccountLast4 ?? ""),
    publicDocumentsSummary: String(data.publicDocumentsSummary ?? ""),
    lookingForPartnership: Boolean(data.lookingForPartnership),
    partnershipCategory: data.partnershipCategory
      ? String(data.partnershipCategory)
      : undefined,
    partnershipAmountMin: data.partnershipAmountMin
      ? Number(data.partnershipAmountMin)
      : undefined,
    partnershipAmountMax: data.partnershipAmountMax
      ? Number(data.partnershipAmountMax)
      : undefined,
    wantsProPlan: Boolean(data.wantsProPlan),
    proDepositAmount: data.proDepositAmount ? Number(data.proDepositAmount) : undefined,
    proDepositLockMonths: data.proDepositLockMonths
      ? Number(data.proDepositLockMonths)
      : undefined,
    slug: String(data.slug ?? toSlug(String(data.businessName ?? snapshotId))),
    status: (data.status as BusinessApplicationRecord["status"]) ?? "pending",
    certificateId: data.certificateId ? String(data.certificateId) : undefined,
    certificateSerial: data.certificateSerial
      ? String(data.certificateSerial)
      : undefined,
    trustScore: Number(data.trustScore ?? deriveTrustScore(data)),
    followersCount: Number(data.followersCount ?? 0),
    totalLockedDeposit: Number(data.totalLockedDeposit ?? 0),
    totalAvailableDeposit: Number(data.totalAvailableDeposit ?? 0),
    trustBadgeCode: data.trustBadgeCode ? String(data.trustBadgeCode) : undefined,
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
  } satisfies BusinessApplicationRecord;
}

function buildTrustBadgeCode(payload: { businessId: string; businessSlug: string }) {
  const src = `${baseUrl()}/trust-badge/${payload.businessId}`;
  return `<iframe src="${src}" width="360" height="220" style="border:0;border-radius:14px;overflow:hidden;" loading="lazy" title="Business Verifier Trust Badge for ${payload.businessSlug}"></iframe>`;
}

function mapProDepositLedger(
  snapshotId: string,
  data: Record<string, unknown>,
): ProDepositLedgerRecord {
  return {
    id: snapshotId,
    businessId: String(data.businessId ?? ""),
    ownerUid: String(data.ownerUid ?? ""),
    ownerName: String(data.ownerName ?? "Business"),
    amount: Number(data.amount ?? 0),
    status: (data.status as ProDepositStatus) ?? "locked",
    source: (data.source as ProDepositLedgerRecord["source"]) ?? "topup_lock",
    lockUntil: data.lockUntil ? String(data.lockUntil) : undefined,
    unlockedAt: data.unlockedAt ? String(data.unlockedAt) : undefined,
    note: data.note ? String(data.note) : undefined,
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
  };
}

async function fetchPrimaryBusinessByOwner(ownerUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "businessApplications"), where("ownerUid", "==", ownerUid), limit(40)),
  );
  const rows = snapshots.docs.map((snapshot) => mapBusinessApplication(snapshot.id, snapshot.data()));
  if (!rows.length) return null;
  const approved = rows.find((row) => row.status === "approved");
  return approved ?? rows.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
}

export async function ensureUserProfile(user: User) {
  const database = getDb();
  const userRef = doc(database, "users", user.uid);
  const walletRef = doc(database, "wallets", user.uid);
  const existing = await getDoc(userRef);
  const walletSnapshot = await getDoc(walletRef);

  const basePayload = {
    uid: user.uid,
    email: user.email ?? "",
    emailNormalized: (user.email ?? "").trim().toLowerCase(),
    displayName: user.displayName ?? "User",
    photoURL: user.photoURL ?? "",
    publicId: `BVU-${user.uid.slice(0, 8).toUpperCase()}`,
    updatedAt: serverTimestamp(),
  };

  if (!existing.exists()) {
    await setDoc(userRef, {
      ...basePayload,
      role: "customer",
      isIdentityVerified: false,
      createdAt: serverTimestamp(),
    });
  } else {
    await updateDoc(userRef, basePayload);
  }

  if (!walletSnapshot.exists()) {
    await setDoc(walletRef, {
      ownerUid: user.uid,
      ownerName: user.displayName ?? "User",
      balance: 0,
      lockedForWithdrawal: 0,
      currency: "INR",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

export async function createBusinessApplication(
  ownerUid: string,
  input: BusinessApplicationInput,
) {
  const database = getDb();
  const lockMonths =
    input.wantsProPlan && input.proDepositAmount
      ? Math.max(1, Math.round(input.proDepositLockMonths ?? 6))
      : undefined;
  const draft = {
    ...input,
    proDepositLockMonths: lockMonths ?? null,
    ownerUid,
    slug: toSlug(input.businessName),
    status: "pending" as const,
    certificateId: null,
    certificateSerial: null,
    followersCount: 0,
    totalLockedDeposit: 0,
    totalAvailableDeposit: 0,
    trustBadgeCode: "",
  };
  const appRef = await addDoc(collection(database, "businessApplications"), {
    ...draft,
    trustScore: deriveTrustScore(draft),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return appRef.id;
}

export async function fetchBusinessApplications(
  status?: "pending" | "approved" | "rejected",
) {
  const database = getDb();

  const baseCollection = collection(database, "businessApplications");
  const queue = status
    ? query(
        baseCollection,
        where("status", "==", status),
        orderBy("createdAt", "desc"),
        limit(50),
      )
    : query(baseCollection, orderBy("createdAt", "desc"), limit(50));

  const snapshots = await getDocs(queue);
  return snapshots.docs.map((snapshot) => mapBusinessApplication(snapshot.id, snapshot.data()));
}

export async function issueCertificateForApplication(
  applicationId: string,
  adminUid: string,
) {
  const database = getDb();
  const applicationRef = doc(database, "businessApplications", applicationId);
  const existing = await getDoc(applicationRef);

  if (!existing.exists()) {
    throw new Error("Business application not found.");
  }
  const application = mapBusinessApplication(existing.id, existing.data());

  const serial = `BV-${new Date().getFullYear()}-${applicationId
    .slice(0, 6)
    .toUpperCase()}`;

  const certRef = await addDoc(collection(database, "certificates"), {
    applicationId,
    businessName: application.businessName,
    serial,
    issuedBy: adminUid,
    issuedAt: serverTimestamp(),
    validUntil: new Date(
      Date.now() + 365 * 24 * 60 * 60 * 1000,
    ).toISOString(),
  });

  const trustBadgeCode = buildTrustBadgeCode({
    businessId: applicationId,
    businessSlug: application.slug,
  });
  let totalLockedDeposit = Number(application.totalLockedDeposit ?? 0);
  if (application.wantsProPlan && (application.proDepositAmount ?? 0) > 0) {
    const depositAmount = Number(application.proDepositAmount);
    const lockMonths = Math.max(1, Math.round(application.proDepositLockMonths ?? 6));
    const lockUntil = new Date();
    lockUntil.setUTCMonth(lockUntil.getUTCMonth() + lockMonths);
    await addDoc(collection(database, "proDepositLedgers"), {
      businessId: application.id,
      ownerUid: application.ownerUid,
      ownerName: application.businessName,
      amount: depositAmount,
      status: "locked",
      source: "initial_lock",
      lockUntil: lockUntil.toISOString(),
      note: "Initial Pro verification deposit lock",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    totalLockedDeposit += depositAmount;
  }

  await updateDoc(applicationRef, {
    status: "approved",
    certificateId: certRef.id,
    certificateSerial: serial,
    trustScore: 90,
    trustBadgeCode,
    totalLockedDeposit,
    totalAvailableDeposit: Number(application.totalAvailableDeposit ?? 0),
    reviewedBy: adminUid,
    updatedAt: serverTimestamp(),
  });

  await recordAuditEvent({
    actorUid: adminUid,
    actorRole: "admin",
    action: "issue_certificate",
    targetType: "business_application",
    targetId: applicationId,
    summary: `Issued certificate ${serial} for ${application.businessName}`,
    metadata: {
      certificateId: certRef.id,
      proPlan: application.wantsProPlan,
      lockedDeposit: totalLockedDeposit,
    },
  });

  return {
    certificateId: certRef.id,
    serial,
  };
}

export async function fetchBusinessApplicationById(applicationId: string) {
  const database = getDb();
  const snapshot = await getDoc(doc(database, "businessApplications", applicationId));
  if (!snapshot.exists()) return null;
  return mapBusinessApplication(snapshot.id, snapshot.data());
}

export async function fetchPublicBusinessDirectory() {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "businessApplications"),
      where("status", "==", "approved"),
      limit(300),
    ),
  );
  return snapshots.docs
    .map((snapshot) => mapBusinessApplication(snapshot.id, snapshot.data()))
    .sort((a, b) => {
      if (b.trustScore !== a.trustScore) return b.trustScore - a.trustScore;
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
}

export async function fetchBusinessBySlug(slug: string) {
  const cleanSlug = slug.trim().toLowerCase();
  if (!cleanSlug) return null;
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "businessApplications"), where("slug", "==", cleanSlug), limit(1)),
  );
  const row = snapshots.docs[0];
  if (!row) return null;
  return mapBusinessApplication(row.id, row.data());
}

async function refreshBusinessDepositTotals(businessId: string) {
  const database = getDb();
  const ledgerSnapshots = await getDocs(
    query(collection(database, "proDepositLedgers"), where("businessId", "==", businessId), limit(600)),
  );
  const entries = ledgerSnapshots.docs.map((snapshot) =>
    mapProDepositLedger(snapshot.id, snapshot.data()),
  );
  const now = Date.now();

  let unlockedNow = 0;
  for (const entry of entries) {
    if (entry.status !== "locked") continue;
    if (!entry.lockUntil) continue;
    if (Date.parse(entry.lockUntil) > now) continue;
    await updateDoc(doc(database, "proDepositLedgers", entry.id), {
      status: "available",
      unlockedAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });
    entry.status = "available";
    entry.unlockedAt = new Date().toISOString();
    unlockedNow += entry.amount;
  }

  const totalLockedDeposit = entries
    .filter((entry) => entry.status === "locked")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const totalAvailableDeposit = entries
    .filter((entry) => entry.status === "available")
    .reduce((sum, entry) => sum + entry.amount, 0);

  await updateDoc(doc(database, "businessApplications", businessId), {
    totalLockedDeposit,
    totalAvailableDeposit,
    updatedAt: serverTimestamp(),
  });

  return {
    totalLockedDeposit,
    totalAvailableDeposit,
    unlockedNow,
  };
}

export async function fetchProDepositLedgerByBusinessId(businessId: string) {
  await refreshBusinessDepositTotals(businessId);
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "proDepositLedgers"), where("businessId", "==", businessId), limit(600)),
  );
  return snapshots.docs
    .map((snapshot) => mapProDepositLedger(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function fetchProDepositLedgerByOwner(ownerUid: string) {
  const business = await fetchPrimaryBusinessByOwner(ownerUid);
  if (!business) return [];
  return fetchProDepositLedgerByBusinessId(business.id);
}

export async function businessTopUpProDeposit(payload: {
  ownerUid: string;
  ownerName: string;
  amount: number;
  lockMonths?: number;
  note?: string;
}) {
  if (payload.amount <= 0) {
    throw new Error("Deposit amount must be greater than zero.");
  }
  const business = await fetchPrimaryBusinessByOwner(payload.ownerUid);
  if (!business) {
    throw new Error("Business profile not found.");
  }
  if (!business.wantsProPlan) {
    throw new Error("Pro deposit is only available for Pro businesses.");
  }

  const database = getDb();
  const lockMonths = Math.max(
    1,
    Math.round(payload.lockMonths ?? business.proDepositLockMonths ?? 6),
  );
  const lockUntil = new Date();
  lockUntil.setUTCMonth(lockUntil.getUTCMonth() + lockMonths);

  await debitWalletBalance({
    ownerUid: payload.ownerUid,
    amount: payload.amount,
    reason: `Pro deposit lock for ${business.businessName}`,
    type: "pro_deposit_lock_debit",
    referenceId: business.id,
  });

  await addDoc(collection(database, "proDepositLedgers"), {
    businessId: business.id,
    ownerUid: payload.ownerUid,
    ownerName: business.businessName,
    amount: payload.amount,
    status: "locked",
    source: "topup_lock",
    lockUntil: lockUntil.toISOString(),
    note: payload.note?.trim() || "Manual Pro deposit top-up",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await updateDoc(doc(database, "businessApplications", business.id), {
    totalLockedDeposit: increment(payload.amount),
    updatedAt: serverTimestamp(),
  });

  await recordAuditEvent({
    actorUid: payload.ownerUid,
    actorRole: "business",
    action: "pro_deposit_topup",
    targetType: "business_application",
    targetId: business.id,
    summary: `Locked INR ${payload.amount} as Pro deposit.`,
    metadata: {
      lockMonths,
      note: payload.note?.trim() || null,
    },
  });
}

export async function businessWithdrawAvailableProDeposit(payload: {
  ownerUid: string;
  ownerName: string;
  amount: number;
  note?: string;
}) {
  if (payload.amount <= 0) {
    throw new Error("Withdraw amount must be greater than zero.");
  }
  const business = await fetchPrimaryBusinessByOwner(payload.ownerUid);
  if (!business) throw new Error("Business profile not found.");
  const totals = await refreshBusinessDepositTotals(business.id);
  if (totals.totalAvailableDeposit < payload.amount) {
    throw new Error("Requested amount is greater than available deposit.");
  }

  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "proDepositLedgers"), where("businessId", "==", business.id), limit(600)),
  );
  const entries = snapshots.docs
    .map((snapshot) => mapProDepositLedger(snapshot.id, snapshot.data()))
    .filter((entry) => entry.status === "available")
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  let remaining = payload.amount;
  for (const entry of entries) {
    if (remaining <= 0) break;
    if (entry.amount <= remaining) {
      await updateDoc(doc(database, "proDepositLedgers", entry.id), {
        status: "withdrawn",
        note: payload.note?.trim() || "Business withdrew available Pro deposit",
        updatedAt: serverTimestamp(),
      });
      remaining -= entry.amount;
      continue;
    }

    const reducedAmount = entry.amount - remaining;
    await updateDoc(doc(database, "proDepositLedgers", entry.id), {
      amount: reducedAmount,
      note: "Partially used for withdrawal",
      updatedAt: serverTimestamp(),
    });
    await addDoc(collection(database, "proDepositLedgers"), {
      businessId: business.id,
      ownerUid: payload.ownerUid,
      ownerName: business.businessName,
      amount: remaining,
      status: "withdrawn",
      source: "withdrawal",
      note: payload.note?.trim() || "Business withdrew available Pro deposit",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    remaining = 0;
  }
  if (remaining > 0) {
    throw new Error("Unable to allocate available deposit entries for withdrawal.");
  }

  await creditWalletBalance({
    ownerUid: payload.ownerUid,
    amount: payload.amount,
    reason: `Pro deposit withdrawal for ${business.businessName}`,
    type: "pro_deposit_withdraw_credit",
    referenceId: business.id,
  });

  await updateDoc(doc(database, "businessApplications", business.id), {
    totalAvailableDeposit: increment(-payload.amount),
    updatedAt: serverTimestamp(),
  });

  await recordAuditEvent({
    actorUid: payload.ownerUid,
    actorRole: "business",
    action: "pro_deposit_withdraw",
    targetType: "business_application",
    targetId: business.id,
    summary: `Withdrew INR ${payload.amount} from available Pro deposit.`,
    metadata: {
      note: payload.note?.trim() || null,
    },
  });
}

export async function adminForfeitBusinessDeposit(payload: {
  adminUid: string;
  businessId: string;
  amount: number;
  note: string;
}) {
  if (payload.amount <= 0) {
    throw new Error("Forfeit amount must be greater than zero.");
  }
  const database = getDb();
  const business = await fetchBusinessApplicationById(payload.businessId);
  if (!business) {
    throw new Error("Business not found.");
  }
  const snapshots = await getDocs(
    query(collection(database, "proDepositLedgers"), where("businessId", "==", business.id), limit(800)),
  );
  const entries = snapshots.docs
    .map((snapshot) => mapProDepositLedger(snapshot.id, snapshot.data()))
    .filter((entry) => entry.status === "locked" || entry.status === "available")
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  const totals = await refreshBusinessDepositTotals(business.id);
  if (totals.totalLockedDeposit + totals.totalAvailableDeposit < payload.amount) {
    throw new Error("Forfeit amount is greater than current deposit balance.");
  }

  let remaining = payload.amount;
  let fromLocked = 0;
  let fromAvailable = 0;
  for (const entry of entries) {
    if (remaining <= 0) break;
    const consumed = Math.min(entry.amount, remaining);
    if (consumed <= 0) continue;
    if (entry.amount === consumed) {
      await updateDoc(doc(database, "proDepositLedgers", entry.id), {
        status: "forfeited",
        source: "forfeit",
        note: payload.note.trim(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(database, "proDepositLedgers", entry.id), {
        amount: entry.amount - consumed,
        note: "Partially reduced due to forfeiture",
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(database, "proDepositLedgers"), {
        businessId: business.id,
        ownerUid: business.ownerUid,
        ownerName: business.businessName,
        amount: consumed,
        status: "forfeited",
        source: "forfeit",
        note: payload.note.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (entry.status === "locked") fromLocked += consumed;
    if (entry.status === "available") fromAvailable += consumed;
    remaining -= consumed;
  }
  if (remaining > 0) {
    throw new Error("Unable to allocate deposit entries for forfeiture.");
  }

  await updateDoc(doc(database, "businessApplications", business.id), {
    totalLockedDeposit: increment(-fromLocked),
    totalAvailableDeposit: increment(-fromAvailable),
    updatedAt: serverTimestamp(),
  });

  await recordAuditEvent({
    actorUid: payload.adminUid,
    actorRole: "admin",
    action: "pro_deposit_forfeit",
    targetType: "business_application",
    targetId: business.id,
    summary: `Forfeited INR ${payload.amount} from ${business.businessName} deposit.`,
    metadata: {
      fromLocked,
      fromAvailable,
      note: payload.note.trim(),
    },
  });
}

export async function releaseMaturedProDeposits(payload?: {
  actorUid?: string;
  actorRole?: "admin" | "business" | "system";
  limit?: number;
}) {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "proDepositLedgers"), limit(payload?.limit ?? 1000)),
  );
  const rows = snapshots.docs.map((snapshot) => mapProDepositLedger(snapshot.id, snapshot.data()));
  const locked = rows.filter((row) => row.status === "locked" && Boolean(row.lockUntil));
  const now = Date.now();

  let released = 0;
  const touchedBusinessIds = new Set<string>();
  for (const row of locked) {
    if (!row.lockUntil || Date.parse(row.lockUntil) > now) continue;
    await updateDoc(doc(database, "proDepositLedgers", row.id), {
      status: "available",
      source: "unlock",
      unlockedAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });
    released += 1;
    touchedBusinessIds.add(row.businessId);
  }

  for (const businessId of touchedBusinessIds) {
    await refreshBusinessDepositTotals(businessId);
  }

  if (released > 0) {
    await recordAuditEvent({
      actorUid: payload?.actorUid ?? "system",
      actorRole: payload?.actorRole ?? "system",
      action: "pro_deposit_release_due",
      targetType: "business_application",
      targetId: touchedBusinessIds.size === 1 ? [...touchedBusinessIds][0] : "batch",
      summary: `Released ${released} matured Pro deposit entries.`,
      metadata: {
        businesses: touchedBusinessIds.size,
      },
    });
  }

  return {
    checked: rows.length,
    released,
    businessesUpdated: touchedBusinessIds.size,
  };
}

export async function fetchPublicBusinessTrustBadgeByBusinessId(businessId: string) {
  const business = await fetchBusinessApplicationById(businessId);
  if (!business || business.status !== "approved") return null;
  const totals = await refreshBusinessDepositTotals(business.id);
  const trustBadgeCode =
    business.trustBadgeCode?.trim() ||
    buildTrustBadgeCode({ businessId: business.id, businessSlug: business.slug });
  if (business.trustBadgeCode !== trustBadgeCode) {
    const database = getDb();
    await updateDoc(doc(database, "businessApplications", business.id), {
      trustBadgeCode,
      updatedAt: serverTimestamp(),
    });
  }
  return {
    businessId: business.id,
    businessName: business.businessName,
    businessSlug: business.slug,
    trustScore: business.trustScore,
    mode: business.mode,
    city: business.city,
    country: business.country,
    certificateSerial: business.certificateSerial,
    totalLockedDeposit: totals.totalLockedDeposit,
    totalAvailableDeposit: totals.totalAvailableDeposit,
    supportEmail: business.supportEmail,
    supportPhone: business.supportPhone,
    trustBadgeCode,
    profileUrl: `${baseUrl()}/directory?search=${encodeURIComponent(business.businessName)}`,
  } satisfies BusinessTrustBadgeRecord;
}

export async function fetchPublicBusinessTrustBadgeBySlug(slug: string) {
  const business = await fetchBusinessBySlug(slug);
  if (!business) return null;
  return fetchPublicBusinessTrustBadgeByBusinessId(business.id);
}

export async function fetchOwnedBusinessTrustBadge(ownerUid: string) {
  const business = await fetchPrimaryBusinessByOwner(ownerUid);
  if (!business) return null;
  return fetchPublicBusinessTrustBadgeByBusinessId(business.id);
}

export async function isBusinessFollowed(applicationId: string, followerUid: string) {
  const database = getDb();
  const snapshot = await getDoc(
    doc(database, "users", followerUid, "followedBusinesses", applicationId),
  );
  return snapshot.exists();
}

export async function fetchFollowedBusinessIds(followerUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "users", followerUid, "followedBusinesses"), limit(300)),
  );
  return snapshots.docs.map((snapshot) => snapshot.id);
}

export async function toggleBusinessFollow(payload: {
  applicationId: string;
  followerUid: string;
  followerName: string;
  followerEmail: string;
}) {
  const database = getDb();
  const businessRef = doc(database, "businessApplications", payload.applicationId);
  const businessSnapshot = await getDoc(businessRef);
  if (!businessSnapshot.exists()) {
    throw new Error("Business profile not found.");
  }
  const business = mapBusinessApplication(businessSnapshot.id, businessSnapshot.data());
  if (business.ownerUid === payload.followerUid) {
    throw new Error("You cannot follow your own business.");
  }

  const followRef = doc(
    database,
    "businessApplications",
    payload.applicationId,
    "followers",
    payload.followerUid,
  );
  const userFollowRef = doc(
    database,
    "users",
    payload.followerUid,
    "followedBusinesses",
    payload.applicationId,
  );
  const existing = await getDoc(userFollowRef);

  if (existing.exists()) {
    await deleteDoc(followRef);
    await deleteDoc(userFollowRef);
    await updateDoc(businessRef, {
      followersCount: increment(-1),
      updatedAt: serverTimestamp(),
    });
    return false;
  }

  await setDoc(followRef, {
    followerUid: payload.followerUid,
    followerName: payload.followerName,
    followerEmail: payload.followerEmail,
    createdAt: serverTimestamp(),
  });
  await setDoc(userFollowRef, {
    applicationId: payload.applicationId,
    businessName: business.businessName,
    businessSlug: business.slug,
    ownerUid: business.ownerUid,
    followedAt: serverTimestamp(),
  });
  await updateDoc(businessRef, {
    followersCount: increment(1),
    updatedAt: serverTimestamp(),
  });
  return true;
}

export async function fetchFollowedBusinessesByUser(followerUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "users", followerUid, "followedBusinesses"), limit(300)),
  );

  const rows: FollowedBusinessRecord[] = [];
  for (const snapshot of snapshots.docs) {
    const business = await fetchBusinessApplicationById(snapshot.id);
    if (!business) continue;
    rows.push({
      ...business,
      followedAt: toISODate(snapshot.data().followedAt),
    });
  }

  return rows.sort((a, b) => Date.parse(b.followedAt) - Date.parse(a.followedAt));
}

type UserLookupResult = {
  uid: string;
  displayName: string;
  email: string;
  role: string;
};

function mapUserIdentityProfile(
  snapshotId: string,
  data: Record<string, unknown>,
) {
  return {
    uid: snapshotId,
    displayName: String(data.displayName ?? "User"),
    email: String(data.email ?? ""),
    publicId: String(data.publicId ?? `BVU-${snapshotId.slice(0, 8).toUpperCase()}`),
    role: String(data.role ?? "customer"),
    isIdentityVerified: Boolean(data.isIdentityVerified),
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
    identityVerifiedAt: data.identityVerifiedAt
      ? toISODate(data.identityVerifiedAt)
      : undefined,
    identityVerifiedBy: data.identityVerifiedBy
      ? String(data.identityVerifiedBy)
      : undefined,
    identityVerificationNote: data.identityVerificationNote
      ? String(data.identityVerificationNote)
      : undefined,
  } satisfies UserIdentityProfileRecord;
}

function parseAuthenticatorData(data: Record<string, unknown>) {
  const raw = (data.authenticator as Record<string, unknown> | undefined) ?? {};
  return {
    enabled: Boolean(raw.enabled),
    secret: raw.secret ? String(raw.secret) : "",
    pendingSecret: raw.pendingSecret ? String(raw.pendingSecret) : "",
    backupCodes: Array.isArray(raw.backupCodes) ? (raw.backupCodes as string[]) : [],
    pendingBackupCodes: Array.isArray(raw.pendingBackupCodes)
      ? (raw.pendingBackupCodes as string[])
      : [],
    enrolledAt: raw.enrolledAt ? toISODate(raw.enrolledAt) : undefined,
    updatedAt: raw.updatedAt ? toISODate(raw.updatedAt) : toISODate(data.updatedAt),
  };
}

function mapAuthenticatorSettings(data: Record<string, unknown>) {
  const auth = parseAuthenticatorData(data);
  return {
    enabled: auth.enabled,
    hasPendingEnrollment: Boolean(auth.pendingSecret),
    backupCodesRemaining: auth.backupCodes.length,
    enrolledAt: auth.enrolledAt,
    updatedAt: auth.updatedAt,
  } satisfies AuthenticatorSettingsRecord;
}

async function getUserIdentityProfileOrThrow(userUid: string) {
  const database = getDb();
  const snapshot = await getDoc(doc(database, "users", userUid));
  if (!snapshot.exists()) {
    throw new Error("User profile not found.");
  }
  return mapUserIdentityProfile(snapshot.id, snapshot.data());
}

async function findUserByEmail(emailInput: string) {
  const database = getDb();
  const email = emailInput.trim();
  const normalized = email.toLowerCase();

  const byNormalized = await getDocs(
    query(collection(database, "users"), where("emailNormalized", "==", normalized), limit(1)),
  );
  const firstNormalized = byNormalized.docs[0];
  if (firstNormalized) {
    const data = firstNormalized.data();
    return {
      uid: firstNormalized.id,
      displayName: String(data.displayName ?? "User"),
      email: String(data.email ?? normalized),
      role: String(data.role ?? "customer"),
    } satisfies UserLookupResult;
  }

  const byLowerEmail = await getDocs(
    query(collection(database, "users"), where("email", "==", normalized), limit(1)),
  );
  const firstLowerEmail = byLowerEmail.docs[0];
  if (firstLowerEmail) {
    const data = firstLowerEmail.data();
    return {
      uid: firstLowerEmail.id,
      displayName: String(data.displayName ?? "User"),
      email: String(data.email ?? normalized),
      role: String(data.role ?? "customer"),
    } satisfies UserLookupResult;
  }

  const byRawEmail = await getDocs(
    query(collection(database, "users"), where("email", "==", email), limit(1)),
  );
  const firstRawEmail = byRawEmail.docs[0];
  if (!firstRawEmail) return null;
  const data = firstRawEmail.data();
  return {
    uid: firstRawEmail.id,
    displayName: String(data.displayName ?? "User"),
    email: String(data.email ?? email),
    role: String(data.role ?? "customer"),
  } satisfies UserLookupResult;
}

export async function fetchBusinessEmployees(ownerUid: string) {
  const database = getDb();
  const business = await fetchPrimaryBusinessByOwner(ownerUid);
  if (!business) return [];

  const snapshots = await getDocs(
    query(
      collection(database, "businessApplications", business.id, "employees"),
      limit(200),
    ),
  );
  return snapshots.docs
    .map((snapshot) => {
      const data = snapshot.data();
      return {
        employeeUid: snapshot.id,
        employeeName: String(data.employeeName ?? "Employee"),
        employeeEmail: String(data.employeeEmail ?? ""),
        title: String(data.title ?? "Team member"),
        addedByUid: String(data.addedByUid ?? ""),
        addedByName: String(data.addedByName ?? "Business"),
        createdAt: toISODate(data.createdAt),
      } satisfies BusinessEmployeeRecord;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function addBusinessEmployee(payload: {
  ownerUid: string;
  ownerName: string;
  employeeEmail: string;
  title?: string;
}) {
  const database = getDb();
  const business = await fetchPrimaryBusinessByOwner(payload.ownerUid);
  if (!business) {
    throw new Error("Complete business onboarding before adding employees.");
  }

  const employee = await findUserByEmail(payload.employeeEmail);
  if (!employee) {
    throw new Error(
      "Employee account not found. Ask them to create account with Gmail first.",
    );
  }
  if (employee.uid === payload.ownerUid) {
    throw new Error("Business owner is already part of this business.");
  }

  const employeeRef = doc(
    database,
    "businessApplications",
    business.id,
    "employees",
    employee.uid,
  );
  const existing = await getDoc(employeeRef);
  if (existing.exists()) {
    throw new Error("This account is already added as an employee.");
  }

  const employeeTitle = payload.title?.trim() || "Team member";
  await setDoc(employeeRef, {
    employeeUid: employee.uid,
    employeeName: employee.displayName,
    employeeEmail: employee.email,
    title: employeeTitle,
    addedByUid: payload.ownerUid,
    addedByName: payload.ownerName,
    createdAt: serverTimestamp(),
  });

  await setDoc(doc(database, "users", employee.uid, "employments", business.id), {
    businessId: business.id,
    businessName: business.businessName,
    businessSlug: business.slug,
    ownerUid: business.ownerUid,
    ownerName: payload.ownerName,
    title: employeeTitle,
    assignedAt: serverTimestamp(),
  });

  if (employee.role === "customer") {
    await updateDoc(doc(database, "users", employee.uid), {
      role: "employee",
      updatedAt: serverTimestamp(),
    });
  }
}

export async function removeBusinessEmployee(payload: {
  ownerUid: string;
  employeeUid: string;
}) {
  const database = getDb();
  const business = await fetchPrimaryBusinessByOwner(payload.ownerUid);
  if (!business) throw new Error("Business profile not found.");

  const employeeRef = doc(
    database,
    "businessApplications",
    business.id,
    "employees",
    payload.employeeUid,
  );
  const existing = await getDoc(employeeRef);
  if (!existing.exists()) return;

  await deleteDoc(employeeRef);
  await deleteDoc(doc(database, "users", payload.employeeUid, "employments", business.id));
}

export async function fetchEmployeeAssignments(userUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "users", userUid, "employments"), limit(200)),
  );
  return snapshots.docs
    .map((snapshot) => {
      const data = snapshot.data();
      return {
        businessId: snapshot.id,
        businessName: String(data.businessName ?? "Business"),
        businessSlug: String(data.businessSlug ?? ""),
        ownerUid: String(data.ownerUid ?? ""),
        ownerName: String(data.ownerName ?? "Business"),
        title: String(data.title ?? "Team member"),
        assignedAt: toISODate(data.assignedAt),
      } satisfies EmployeeAssignmentRecord;
    })
    .sort((a, b) => Date.parse(b.assignedAt) - Date.parse(a.assignedAt));
}

function mapEmployeePerformance(
  snapshotId: string,
  data: Record<string, unknown>,
): EmployeePerformanceReviewRecord {
  return {
    id: snapshotId,
    businessId: String(data.businessId ?? ""),
    businessName: String(data.businessName ?? "Business"),
    ownerUid: String(data.ownerUid ?? ""),
    employeeUid: String(data.employeeUid ?? ""),
    employeeName: String(data.employeeName ?? "Employee"),
    employeeEmail: String(data.employeeEmail ?? ""),
    employeeTitle: String(data.employeeTitle ?? "Team member"),
    monthKey: String(data.monthKey ?? ""),
    rating: Number(data.rating ?? 0),
    ticketsHandled: Number(data.ticketsHandled ?? 0),
    ticketsResolved: Number(data.ticketsResolved ?? 0),
    customerSatisfactionScore: Number(data.customerSatisfactionScore ?? 0),
    note: String(data.note ?? ""),
    reviewedByUid: String(data.reviewedByUid ?? ""),
    reviewedByName: String(data.reviewedByName ?? "Business"),
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
  };
}

export async function submitEmployeePerformanceReview(payload: {
  ownerUid: string;
  reviewerName: string;
  employeeUid: string;
  monthKey: string;
  rating: number;
  ticketsHandled: number;
  ticketsResolved: number;
  customerSatisfactionScore: number;
  note: string;
}) {
  const business = await fetchPrimaryBusinessByOwner(payload.ownerUid);
  if (!business) throw new Error("Business profile not found.");
  const database = getDb();

  const employeeSnapshot = await getDoc(
    doc(database, "businessApplications", business.id, "employees", payload.employeeUid),
  );
  if (!employeeSnapshot.exists()) {
    throw new Error("Employee is not assigned to your business.");
  }
  const employeeData = employeeSnapshot.data();
  const reviewId = `${payload.employeeUid}_${payload.monthKey}`;
  const reviewPayload = {
    businessId: business.id,
    businessName: business.businessName,
    ownerUid: business.ownerUid,
    employeeUid: payload.employeeUid,
    employeeName: String(employeeData.employeeName ?? "Employee"),
    employeeEmail: String(employeeData.employeeEmail ?? ""),
    employeeTitle: String(employeeData.title ?? "Team member"),
    monthKey: payload.monthKey,
    rating: Math.max(1, Math.min(5, Math.round(payload.rating))),
    ticketsHandled: Math.max(0, Math.round(payload.ticketsHandled)),
    ticketsResolved: Math.max(0, Math.round(payload.ticketsResolved)),
    customerSatisfactionScore: Math.max(
      1,
      Math.min(10, Math.round(payload.customerSatisfactionScore)),
    ),
    note: payload.note.trim(),
    reviewedByUid: payload.ownerUid,
    reviewedByName: payload.reviewerName,
    updatedAt: serverTimestamp(),
  };

  const businessReviewRef = doc(
    database,
    "businessApplications",
    business.id,
    "employeePerformance",
    reviewId,
  );
  const existing = await getDoc(businessReviewRef);
  await setDoc(
    businessReviewRef,
    {
      ...reviewPayload,
      createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
    },
    { merge: true },
  );
  await setDoc(
    doc(database, "users", payload.employeeUid, "performanceReviews", `${business.id}_${payload.monthKey}`),
    {
      reviewId,
      ...reviewPayload,
      createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
    },
    { merge: true },
  );

  await recordAuditEvent({
    actorUid: payload.ownerUid,
    actorRole: "business",
    action: "employee_performance_review",
    targetType: "employee",
    targetId: payload.employeeUid,
    summary: `Submitted performance review for ${payload.monthKey}.`,
    metadata: {
      businessId: business.id,
      rating: reviewPayload.rating,
      ticketsHandled: reviewPayload.ticketsHandled,
      ticketsResolved: reviewPayload.ticketsResolved,
    },
  });
}

export async function fetchEmployeePerformanceByBusinessOwner(ownerUid: string) {
  const business = await fetchPrimaryBusinessByOwner(ownerUid);
  if (!business) return [];
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "businessApplications", business.id, "employeePerformance"),
      limit(400),
    ),
  );
  return snapshots.docs
    .map((snapshot) => mapEmployeePerformance(snapshot.id, snapshot.data()))
    .sort((a, b) => {
      if (b.monthKey !== a.monthKey) return b.monthKey.localeCompare(a.monthKey);
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
}

export async function fetchEmployeePerformanceForEmployee(employeeUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "users", employeeUid, "performanceReviews"), limit(400)),
  );
  return snapshots.docs
    .map((snapshot) => mapEmployeePerformance(snapshot.id, snapshot.data()))
    .sort((a, b) => {
      if (b.monthKey !== a.monthKey) return b.monthKey.localeCompare(a.monthKey);
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
}

export async function fetchCurrentUserIdentityProfile(userUid: string) {
  return getUserIdentityProfileOrThrow(userUid);
}

export async function fetchIdentityProfilesForAdmin() {
  const database = getDb();
  const snapshots = await getDocs(query(collection(database, "users"), limit(500)));
  return snapshots.docs
    .map((snapshot) => mapUserIdentityProfile(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function adminSetUserIdentityVerification(payload: {
  adminUid: string;
  targetUid: string;
  verified: boolean;
  note?: string;
}) {
  const database = getDb();
  const userRef = doc(database, "users", payload.targetUid);
  const snapshot = await getDoc(userRef);
  if (!snapshot.exists()) {
    throw new Error("User profile not found.");
  }

  await updateDoc(userRef, {
    isIdentityVerified: payload.verified,
    identityVerifiedAt: payload.verified ? serverTimestamp() : null,
    identityVerifiedBy: payload.verified ? payload.adminUid : null,
    identityVerificationNote: payload.note?.trim() || null,
    updatedAt: serverTimestamp(),
  });
  await recordAuditEvent({
    actorUid: payload.adminUid,
    actorRole: "admin",
    action: payload.verified ? "identity_verify" : "identity_unverify",
    targetType: "user",
    targetId: payload.targetUid,
    summary: payload.verified
      ? "Admin marked identity as verified."
      : "Admin removed identity verification.",
    metadata: {
      note: payload.note?.trim() || null,
    },
  });
}

export async function fetchAuthenticatorSettings(userUid: string) {
  const database = getDb();
  const snapshot = await getDoc(doc(database, "users", userUid));
  if (!snapshot.exists()) {
    throw new Error("User profile not found.");
  }
  return mapAuthenticatorSettings(snapshot.data());
}

export async function initiateAuthenticatorEnrollment(userUid: string) {
  const database = getDb();
  const profile = await getUserIdentityProfileOrThrow(userUid);
  const secret = generateRandomBase32Secret(32);
  const backupCodes = generateBackupCodes(8, 10);
  const accountLabel = profile.email || profile.publicId || userUid;
  const otpauthUri = buildOtpAuthUri({
    secret,
    accountLabel,
    issuer: "Business Verifier",
  });

  await setDoc(
    doc(database, "users", userUid),
    {
      authenticator: {
        enabled: false,
        pendingSecret: secret,
        pendingBackupCodes: backupCodes,
        updatedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return {
    secret,
    backupCodes,
    otpauthUri,
    accountLabel,
  } satisfies AuthenticatorEnrollmentDraft;
}

export async function confirmAuthenticatorEnrollment(payload: {
  userUid: string;
  code: string;
}) {
  const database = getDb();
  const snapshot = await getDoc(doc(database, "users", payload.userUid));
  if (!snapshot.exists()) {
    throw new Error("User profile not found.");
  }
  const auth = parseAuthenticatorData(snapshot.data());
  if (!auth.pendingSecret) {
    throw new Error("No authenticator enrollment is pending.");
  }

  const valid = await verifyTotpCode({
    secret: auth.pendingSecret,
    code: payload.code,
    window: 1,
  });
  if (!valid) {
    throw new Error("Invalid authenticator code.");
  }

  await setDoc(
    doc(database, "users", payload.userUid),
    {
      authenticator: {
        enabled: true,
        secret: auth.pendingSecret,
        backupCodes: auth.pendingBackupCodes,
        pendingSecret: null,
        pendingBackupCodes: [],
        enrolledAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function verifyAuthenticatorChallenge(payload: {
  userUid: string;
  code: string;
}) {
  const database = getDb();
  const snapshot = await getDoc(doc(database, "users", payload.userUid));
  if (!snapshot.exists()) {
    throw new Error("User profile not found.");
  }
  const auth = parseAuthenticatorData(snapshot.data());
  if (!auth.enabled || !auth.secret) {
    return true;
  }

  const rawCode = payload.code.trim();
  const normalizedBackup = normalizeBackupCode(rawCode);
  const matchingBackup = auth.backupCodes.find(
    (item) => normalizeBackupCode(item) === normalizedBackup,
  );
  if (matchingBackup) {
    const remaining = auth.backupCodes.filter(
      (item) => normalizeBackupCode(item) !== normalizedBackup,
    );
    await setDoc(
      doc(database, "users", payload.userUid),
      {
        authenticator: {
          backupCodes: remaining,
          updatedAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    return true;
  }

  const validOtp = await verifyTotpCode({
    secret: auth.secret,
    code: rawCode,
    window: 1,
  });
  return validOtp;
}

async function ensureAuthenticatorFactor(payload: { userUid: string; code: string }) {
  const ok = await verifyAuthenticatorChallenge(payload);
  if (!ok) throw new Error("Invalid authenticator code or backup code.");
}

export async function disableAuthenticatorForUser(payload: {
  userUid: string;
  code: string;
}) {
  const database = getDb();
  const settings = await fetchAuthenticatorSettings(payload.userUid);
  if (!settings.enabled) return;
  await ensureAuthenticatorFactor({ userUid: payload.userUid, code: payload.code });

  await setDoc(
    doc(database, "users", payload.userUid),
    {
      authenticator: {
        enabled: false,
        secret: null,
        backupCodes: [],
        pendingSecret: null,
        pendingBackupCodes: [],
        updatedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function regenerateAuthenticatorBackupCodes(payload: {
  userUid: string;
  code: string;
}) {
  const database = getDb();
  const snapshot = await getDoc(doc(database, "users", payload.userUid));
  if (!snapshot.exists()) throw new Error("User profile not found.");
  const auth = parseAuthenticatorData(snapshot.data());
  if (!auth.enabled || !auth.secret) {
    throw new Error("Authenticator is not enabled.");
  }

  await ensureAuthenticatorFactor({ userUid: payload.userUid, code: payload.code });
  const nextCodes = generateBackupCodes(8, 10);
  await setDoc(
    doc(database, "users", payload.userUid),
    {
      authenticator: {
        backupCodes: nextCodes,
        updatedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return nextCodes;
}

export async function createSupportTicket(input: SupportTicketInput) {
  const database = getDb();
  const ticketRef = await addDoc(collection(database, "supportTickets"), {
    ...input,
    status: "open",
    participantUids: [input.customerUid],
    escalationCount: 0,
    reopenedCount: 0,
    lastMessagePreview: input.description.slice(0, 160),
    lastMessageBy: input.customerUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(database, "supportTickets", ticketRef.id, "messages"), {
    senderUid: input.customerUid,
    senderName: input.customerName,
    senderRole: "customer",
    text: `Ticket created: ${input.description}\nExpected: ${input.expectedOutcome}`,
    attachments: input.evidenceUrls,
    createdAt: serverTimestamp(),
  });

  return ticketRef.id;
}

export async function fetchSupportTicketsByParticipant(participantUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "supportTickets"),
      where("participantUids", "array-contains", participantUid),
      limit(100),
    ),
  );

  return snapshots.docs
    .map((snapshot) => mapTicketRecord(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function fetchSupportTicketById(ticketId: string) {
  const database = getDb();
  const ticketRef = doc(database, "supportTickets", ticketId);
  const snapshot = await getDoc(ticketRef);
  if (!snapshot.exists()) return null;
  return mapTicketRecord(snapshot.id, snapshot.data());
}

export async function fetchSupportTicketMessages(ticketId: string) {
  const database = getDb();
  const messageSnapshots = await getDocs(
    query(
      collection(database, "supportTickets", ticketId, "messages"),
      orderBy("createdAt", "asc"),
      limit(200),
    ),
  );

  return messageSnapshots.docs.map((snapshot) => {
    const data = snapshot.data();
    return {
      id: snapshot.id,
      ticketId,
      senderUid: String(data.senderUid ?? ""),
      senderName: String(data.senderName ?? "User"),
      senderRole: (data.senderRole as TicketMessageInput["senderRole"]) ?? "customer",
      text: String(data.text ?? ""),
      attachments: (data.attachments as string[]) ?? [],
      createdAt: toISODate(data.createdAt),
    } satisfies TicketMessageRecord;
  });
}

export async function addSupportTicketMessage(
  ticketId: string,
  payload: TicketMessageInput,
) {
  const database = getDb();
  const ticketRef = doc(database, "supportTickets", ticketId);
  const current = await getDoc(ticketRef);
  if (!current.exists()) {
    throw new Error("Ticket not found.");
  }

  const currentStatus = current.data().status as SupportTicketStatus;
  const nextStatus =
    currentStatus === "resolved" ||
    currentStatus === "refunded" ||
    currentStatus === "closed"
      ? currentStatus
      : payload.senderRole === "admin"
        ? "awaiting_admin"
        : "in_discussion";

  await addDoc(collection(database, "supportTickets", ticketId, "messages"), {
    ...payload,
    attachments: payload.attachments ?? [],
    createdAt: serverTimestamp(),
  });

  await updateDoc(ticketRef, {
    status: nextStatus,
    lastMessagePreview: payload.text.slice(0, 160),
    lastMessageBy: payload.senderUid,
    participantUids: arrayUnion(payload.senderUid),
    updatedAt: serverTimestamp(),
  });
}

export async function escalateSupportTicketToAdmin(
  ticketId: string,
  actorUid: string,
  actorName: string,
) {
  const database = getDb();
  const ticketRef = doc(database, "supportTickets", ticketId);
  await updateDoc(ticketRef, {
    status: "awaiting_admin",
    escalationCount: increment(1),
    participantUids: arrayUnion(actorUid),
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(database, "supportTickets", ticketId, "messages"), {
    senderUid: actorUid,
    senderName: actorName,
    senderRole: "customer",
    text: "Admin intervention requested for this ticket.",
    attachments: [],
    createdAt: serverTimestamp(),
  });
}

export async function adminFinalizeSupportTicket(
  ticketId: string,
  adminUid: string,
  adminName: string,
  payload: {
    action: "resolved" | "refunded";
    reason: string;
  },
) {
  const database = getDb();
  const ticketRef = doc(database, "supportTickets", ticketId);
  await updateDoc(ticketRef, {
    status: payload.action,
    resolutionReason: payload.reason,
    resolvedBy: adminUid,
    resolvedAt: serverTimestamp(),
    participantUids: arrayUnion(adminUid),
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(database, "supportTickets", ticketId, "messages"), {
    senderUid: adminUid,
    senderName: adminName,
    senderRole: "admin",
    text:
      payload.action === "refunded"
        ? `Admin approved refund. Reason: ${payload.reason}`
        : `Admin marked ticket as resolved. Reason: ${payload.reason}`,
    attachments: [],
    createdAt: serverTimestamp(),
  });
  await recordAuditEvent({
    actorUid: adminUid,
    actorRole: "admin",
    action: payload.action === "refunded" ? "ticket_refund_finalized" : "ticket_resolved",
    targetType: "support_ticket",
    targetId: ticketId,
    summary:
      payload.action === "refunded"
        ? `Ticket ${ticketId} finalized as refunded.`
        : `Ticket ${ticketId} finalized as resolved.`,
    metadata: {
      reason: payload.reason,
    },
  });
}

export async function reopenSupportTicket(
  ticketId: string,
  actorUid: string,
  actorName: string,
  reason: string,
) {
  const database = getDb();
  const ticketRef = doc(database, "supportTickets", ticketId);
  await updateDoc(ticketRef, {
    status: "open",
    reopenedCount: increment(1),
    participantUids: arrayUnion(actorUid),
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(database, "supportTickets", ticketId, "messages"), {
    senderUid: actorUid,
    senderName: actorName,
    senderRole: "customer",
    text: `Ticket reopened. Reason: ${reason}`,
    attachments: [],
    createdAt: serverTimestamp(),
  });
}

export async function closeSupportTicket(
  ticketId: string,
  actorUid: string,
  actorName: string,
) {
  const database = getDb();
  const ticketRef = doc(database, "supportTickets", ticketId);
  await updateDoc(ticketRef, {
    status: "closed",
    participantUids: arrayUnion(actorUid),
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(database, "supportTickets", ticketId, "messages"), {
    senderUid: actorUid,
    senderName: actorName,
    senderRole: "customer",
    text: "Ticket closed by user confirmation.",
    attachments: [],
    createdAt: serverTimestamp(),
  });
}

export async function fetchAdminSupportTickets() {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "supportTickets"),
      orderBy("createdAt", "desc"),
      limit(120),
    ),
  );

  return snapshots.docs
    .map((snapshot) => mapTicketRecord(snapshot.id, snapshot.data()))
    .filter((ticket) =>
      ["open", "in_discussion", "awaiting_admin", "resolved", "refunded"].includes(
        ticket.status,
      ),
    );
}

export interface DigitalProductInput {
  ownerUid: string;
  ownerName: string;
  title: string;
  description: string;
  price: number;
  noRefund: boolean;
  category: string;
}

export interface DigitalProductRecord extends DigitalProductInput {
  id: string;
  uniqueLinkSlug: string;
  favoritesCount: number;
  salesCount: number;
  refundCount: number;
  reviewsCount: number;
  averageRating: number;
  ownerTrustScore: number;
  ownerCertificateSerial?: string;
  ownerBusinessSlug?: string;
  createdAt: string;
  updatedAt: string;
}

function mapDigitalProduct(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    ownerUid: String(data.ownerUid ?? ""),
    ownerName: String(data.ownerName ?? "Business"),
    title: String(data.title ?? ""),
    description: String(data.description ?? ""),
    price: Number(data.price ?? 0),
    noRefund: Boolean(data.noRefund),
    category: String(data.category ?? "General"),
    uniqueLinkSlug: String(data.uniqueLinkSlug ?? snapshotId),
    favoritesCount: Number(data.favoritesCount ?? 0),
    salesCount: Number(data.salesCount ?? 0),
    refundCount: Number(data.refundCount ?? 0),
    reviewsCount: Number(data.reviewsCount ?? 0),
    averageRating: Number(data.averageRating ?? 0),
    ownerTrustScore: Number(data.ownerTrustScore ?? 0),
    ownerCertificateSerial: data.ownerCertificateSerial
      ? String(data.ownerCertificateSerial)
      : undefined,
    ownerBusinessSlug: data.ownerBusinessSlug ? String(data.ownerBusinessSlug) : undefined,
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
  } satisfies DigitalProductRecord;
}

async function enrichProductsWithSocialProof(rows: DigitalProductRecord[]) {
  const database = getDb();
  const ownerUids = [...new Set(rows.map((row) => row.ownerUid))];
  const ownerRows = await Promise.all(ownerUids.map((uid) => fetchPrimaryBusinessByOwner(uid)));
  const ownerMap = new Map<string, BusinessApplicationRecord>();
  for (const ownerRow of ownerRows) {
    if (!ownerRow) continue;
    ownerMap.set(ownerRow.ownerUid, ownerRow as BusinessApplicationRecord);
  }

  const enrichedRows = await Promise.all(
    rows.map(async (row) => {
      const [orderSnapshots, reviewSnapshots] = await Promise.all([
        getDocs(query(collection(database, "orders"), where("productId", "==", row.id), limit(400))),
        getDocs(
          query(collection(database, "productReviews"), where("productId", "==", row.id), limit(250)),
        ),
      ]);
      const orders = orderSnapshots.docs.map((snapshot) => mapOrder(snapshot.id, snapshot.data()));
      const salesCount = orders.filter((order) => order.status !== "refund_requested").length;
      const refundCount = orders.filter((order) => order.status === "refunded").length;

      const reviews = reviewSnapshots.docs
        .map((snapshot) => mapProductReview(snapshot.id, snapshot.data()))
        .filter((review) => !review.hiddenFromPublic);
      const reviewsCount = reviews.length;
      const averageRating = reviewsCount
        ? Number(
            (
              reviews.reduce((sum, review) => sum + review.rating, 0) /
              reviewsCount
            ).toFixed(1),
          )
        : 0;

      const owner = ownerMap.get(row.ownerUid);
      return {
        ...row,
        salesCount,
        refundCount,
        reviewsCount,
        averageRating,
        ownerTrustScore: owner?.trustScore ?? row.ownerTrustScore ?? 0,
        ownerCertificateSerial: owner?.certificateSerial ?? row.ownerCertificateSerial,
        ownerBusinessSlug: owner?.slug ?? row.ownerBusinessSlug,
      } satisfies DigitalProductRecord;
    }),
  );
  return enrichedRows;
}

export async function createDigitalProduct(input: DigitalProductInput) {
  const database = getDb();
  const baseSlug = `${toSlug(input.title)}-${Math.random().toString(36).slice(2, 8)}`;
  const ref = await addDoc(collection(database, "digitalProducts"), {
    ...input,
    uniqueLinkSlug: baseSlug,
    favoritesCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function fetchDigitalProductsByOwner(ownerUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "digitalProducts"), where("ownerUid", "==", ownerUid), limit(100)),
  );
  return snapshots.docs
    .map((snapshot) => mapDigitalProduct(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function fetchPublicDigitalProducts() {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "digitalProducts"), orderBy("createdAt", "desc"), limit(100)),
  );
  const rows = snapshots.docs.map((snapshot) => mapDigitalProduct(snapshot.id, snapshot.data()));
  return enrichProductsWithSocialProof(rows);
}

export async function fetchDigitalProductBySlug(slug: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "digitalProducts"),
      where("uniqueLinkSlug", "==", slug),
      limit(1),
    ),
  );
  const first = snapshots.docs[0];
  if (!first) return null;
  const row = mapDigitalProduct(first.id, first.data());
  const [enriched] = await enrichProductsWithSocialProof([row]);
  return enriched ?? row;
}

export async function isProductFavorited(productId: string, userUid: string) {
  const database = getDb();
  const favoriteRef = doc(database, "digitalProducts", productId, "favorites", userUid);
  const snapshot = await getDoc(favoriteRef);
  return snapshot.exists();
}

export async function toggleDigitalProductFavorite(productId: string, userUid: string) {
  const database = getDb();
  const productRef = doc(database, "digitalProducts", productId);
  const favoriteRef = doc(database, "digitalProducts", productId, "favorites", userUid);
  const existing = await getDoc(favoriteRef);

  if (existing.exists()) {
    await deleteDoc(favoriteRef);
    await updateDoc(productRef, {
      favoritesCount: increment(-1),
      updatedAt: serverTimestamp(),
    });
    return false;
  }

  await setDoc(favoriteRef, {
    userUid,
    createdAt: serverTimestamp(),
  });
  await updateDoc(productRef, {
    favoritesCount: increment(1),
    updatedAt: serverTimestamp(),
  });
  return true;
}

export type ProductReviewStatus = "active" | "resolved_public" | "resolved_hidden";

export interface ProductReviewRecord {
  id: string;
  productId: string;
  productSlug: string;
  productTitle: string;
  businessOwnerUid: string;
  businessOwnerName: string;
  customerUid: string;
  customerName: string;
  customerEmail: string;
  rating: number;
  comment: string;
  proofUrls: string[];
  status: ProductReviewStatus;
  businessReply?: string;
  businessReplyBy?: string;
  businessReplyAt?: string;
  customerSatisfied: boolean;
  resolutionNote?: string;
  hiddenFromPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

function mapProductReview(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    productId: String(data.productId ?? ""),
    productSlug: String(data.productSlug ?? ""),
    productTitle: String(data.productTitle ?? ""),
    businessOwnerUid: String(data.businessOwnerUid ?? ""),
    businessOwnerName: String(data.businessOwnerName ?? "Business"),
    customerUid: String(data.customerUid ?? ""),
    customerName: String(data.customerName ?? "Customer"),
    customerEmail: String(data.customerEmail ?? ""),
    rating: Number(data.rating ?? 0),
    comment: String(data.comment ?? ""),
    proofUrls: (data.proofUrls as string[]) ?? [],
    status: (data.status as ProductReviewStatus) ?? "active",
    businessReply: data.businessReply ? String(data.businessReply) : undefined,
    businessReplyBy: data.businessReplyBy ? String(data.businessReplyBy) : undefined,
    businessReplyAt: data.businessReplyAt ? toISODate(data.businessReplyAt) : undefined,
    customerSatisfied: Boolean(data.customerSatisfied),
    resolutionNote: data.resolutionNote ? String(data.resolutionNote) : undefined,
    hiddenFromPublic: Boolean(data.hiddenFromPublic),
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
  } satisfies ProductReviewRecord;
}

export async function createProductReview(payload: {
  productId: string;
  customerUid: string;
  customerName: string;
  customerEmail: string;
  rating: number;
  comment: string;
  proofUrls: string[];
}) {
  if (payload.rating < 1 || payload.rating > 5) {
    throw new Error("Rating must be between 1 and 5.");
  }
  if (!payload.comment.trim()) {
    throw new Error("Review comment is required.");
  }
  if (!payload.proofUrls.length) {
    throw new Error("Proof of purchase is required to submit review.");
  }

  const database = getDb();
  const productSnapshot = await getDoc(doc(database, "digitalProducts", payload.productId));
  if (!productSnapshot.exists()) {
    throw new Error("Product not found.");
  }
  const product = mapDigitalProduct(productSnapshot.id, productSnapshot.data());

  const purchaseSnapshots = await getDocs(
    query(
      collection(database, "orders"),
      where("productId", "==", payload.productId),
      where("customerUid", "==", payload.customerUid),
      limit(1),
    ),
  );
  if (!purchaseSnapshots.docs.length) {
    throw new Error(
      "Only customers with proof of purchase in this platform can review this product.",
    );
  }

  const reviewRef = await addDoc(collection(database, "productReviews"), {
    productId: product.id,
    productSlug: product.uniqueLinkSlug,
    productTitle: product.title,
    businessOwnerUid: product.ownerUid,
    businessOwnerName: product.ownerName,
    customerUid: payload.customerUid,
    customerName: payload.customerName,
    customerEmail: payload.customerEmail,
    rating: payload.rating,
    comment: payload.comment.trim(),
    proofUrls: payload.proofUrls,
    status: "active",
    businessReply: null,
    businessReplyBy: null,
    businessReplyAt: null,
    customerSatisfied: false,
    resolutionNote: null,
    hiddenFromPublic: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return reviewRef.id;
}

export async function fetchProductReviewsByProductId(
  productId: string,
  includeHidden = false,
) {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "productReviews"), where("productId", "==", productId), limit(300)),
  );
  const rows = snapshots.docs
    .map((snapshot) => mapProductReview(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (includeHidden) return rows;
  return rows.filter((row) => !row.hiddenFromPublic);
}

export async function fetchProductReviewsBySlug(
  productSlug: string,
  includeHidden = false,
) {
  const product = await fetchDigitalProductBySlug(productSlug);
  if (!product) return [];
  return fetchProductReviewsByProductId(product.id, includeHidden);
}

export async function fetchProductReviewsByBusiness(ownerUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "productReviews"),
      where("businessOwnerUid", "==", ownerUid),
      limit(400),
    ),
  );
  return snapshots.docs
    .map((snapshot) => mapProductReview(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function fetchProductReviewsByCustomer(customerUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "productReviews"), where("customerUid", "==", customerUid), limit(300)),
  );
  return snapshots.docs
    .map((snapshot) => mapProductReview(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function businessRespondToProductReview(payload: {
  reviewId: string;
  businessOwnerUid: string;
  responderName: string;
  reply: string;
}) {
  if (!payload.reply.trim()) {
    throw new Error("Business response is required.");
  }

  const database = getDb();
  const reviewRef = doc(database, "productReviews", payload.reviewId);
  const reviewSnapshot = await getDoc(reviewRef);
  if (!reviewSnapshot.exists()) {
    throw new Error("Review not found.");
  }
  const review = mapProductReview(reviewSnapshot.id, reviewSnapshot.data());
  if (review.businessOwnerUid !== payload.businessOwnerUid) {
    throw new Error("You cannot respond to this review.");
  }

  await updateDoc(reviewRef, {
    businessReply: payload.reply.trim(),
    businessReplyBy: payload.responderName,
    businessReplyAt: serverTimestamp(),
    status: review.hiddenFromPublic ? review.status : "resolved_public",
    updatedAt: serverTimestamp(),
  });
}

export async function customerResolveProductReview(payload: {
  reviewId: string;
  customerUid: string;
  satisfied: boolean;
  resolutionNote?: string;
}) {
  const database = getDb();
  const reviewRef = doc(database, "productReviews", payload.reviewId);
  const reviewSnapshot = await getDoc(reviewRef);
  if (!reviewSnapshot.exists()) {
    throw new Error("Review not found.");
  }
  const review = mapProductReview(reviewSnapshot.id, reviewSnapshot.data());
  if (review.customerUid !== payload.customerUid) {
    throw new Error("You cannot update this review.");
  }

  const shouldHideNegative =
    payload.satisfied && review.rating <= 2 && Boolean(review.businessReply?.trim());

  await updateDoc(reviewRef, {
    customerSatisfied: payload.satisfied,
    resolutionNote: payload.resolutionNote?.trim() || null,
    hiddenFromPublic: shouldHideNegative,
    status: shouldHideNegative
      ? "resolved_hidden"
      : payload.satisfied
        ? "resolved_public"
        : "active",
    updatedAt: serverTimestamp(),
  });
}

export type OrderStatus = "paid" | "refund_requested" | "refunded" | "released";

export interface OrderRecord {
  id: string;
  productId: string;
  productSlug: string;
  productTitle: string;
  businessOwnerUid: string;
  businessOwnerName: string;
  customerUid: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  status: OrderStatus;
  noRefund: boolean;
  escrowReleaseAt: string;
  refundDeadlineAt: string;
  refundReason?: string;
  refundEvidenceUrls: string[];
  refundTicketId?: string;
  createdAt: string;
  updatedAt: string;
}

function mapOrder(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    productId: String(data.productId ?? ""),
    productSlug: String(data.productSlug ?? ""),
    productTitle: String(data.productTitle ?? ""),
    businessOwnerUid: String(data.businessOwnerUid ?? ""),
    businessOwnerName: String(data.businessOwnerName ?? "Business"),
    customerUid: String(data.customerUid ?? ""),
    customerName: String(data.customerName ?? "Customer"),
    customerEmail: String(data.customerEmail ?? ""),
    amount: Number(data.amount ?? 0),
    status: (data.status as OrderStatus) ?? "paid",
    noRefund: Boolean(data.noRefund),
    escrowReleaseAt: String(data.escrowReleaseAt ?? new Date().toISOString()),
    refundDeadlineAt: String(data.refundDeadlineAt ?? new Date().toISOString()),
    refundReason: data.refundReason ? String(data.refundReason) : undefined,
    refundEvidenceUrls: (data.refundEvidenceUrls as string[]) ?? [],
    refundTicketId: data.refundTicketId ? String(data.refundTicketId) : undefined,
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
  } satisfies OrderRecord;
}

async function createOrderAndEscrowFromProduct(params: {
  product: DigitalProductRecord;
  customer: { uid: string; name: string; email: string };
  paymentIntentId?: string;
}) {
  const database = getDb();
  const now = new Date();
  const releaseDate = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
  const refundDeadline = params.product.noRefund ? now : releaseDate;

  const orderRef = await addDoc(collection(database, "orders"), {
    productId: params.product.id,
    productSlug: params.product.uniqueLinkSlug,
    productTitle: params.product.title,
    businessOwnerUid: params.product.ownerUid,
    businessOwnerName: params.product.ownerName,
    customerUid: params.customer.uid,
    customerName: params.customer.name,
    customerEmail: params.customer.email,
    amount: params.product.price,
    status: "paid",
    noRefund: params.product.noRefund,
    escrowReleaseAt: releaseDate.toISOString(),
    refundDeadlineAt: refundDeadline.toISOString(),
    refundReason: null,
    refundEvidenceUrls: [],
    refundTicketId: null,
    paymentIntentId: params.paymentIntentId ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(database, "escrowEntries"), {
    orderId: orderRef.id,
    businessOwnerUid: params.product.ownerUid,
    amount: params.product.price,
    status: "locked",
    releaseAt: releaseDate.toISOString(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return orderRef.id;
}

export async function createOrderFromProduct(
  productSlug: string,
  customer: { uid: string; name: string; email: string },
) {
  const product = await fetchDigitalProductBySlug(productSlug);
  if (!product) {
    throw new Error("Product not found.");
  }

  await debitWalletBalance({
    ownerUid: customer.uid,
    amount: product.price,
    reason: `Purchase: ${product.title}`,
    type: "purchase_debit",
    referenceId: product.id,
  });

  return createOrderAndEscrowFromProduct({
    product,
    customer,
  });
}

export async function fetchOrderById(orderId: string) {
  const database = getDb();
  const orderRef = doc(database, "orders", orderId);
  const snapshot = await getDoc(orderRef);
  if (!snapshot.exists()) return null;
  return mapOrder(snapshot.id, snapshot.data());
}

export async function fetchOrdersByCustomer(customerUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "orders"), where("customerUid", "==", customerUid), limit(120)),
  );
  return snapshots.docs
    .map((snapshot) => mapOrder(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function fetchOrdersByBusinessOwner(ownerUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "orders"),
      where("businessOwnerUid", "==", ownerUid),
      limit(120),
    ),
  );
  return snapshots.docs
    .map((snapshot) => mapOrder(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function fetchAdminOrders() {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "orders"), orderBy("createdAt", "desc"), limit(150)),
  );
  return snapshots.docs.map((snapshot) => mapOrder(snapshot.id, snapshot.data()));
}

export async function requestOrderRefund(
  orderId: string,
  payload: {
    customerUid: string;
    customerName: string;
    customerEmail: string;
    reason: string;
    evidenceUrls: string[];
  },
) {
  const database = getDb();
  const orderRef = doc(database, "orders", orderId);
  const orderSnapshot = await getDoc(orderRef);
  if (!orderSnapshot.exists()) {
    throw new Error("Order not found.");
  }

  const order = mapOrder(orderSnapshot.id, orderSnapshot.data());
  if (order.customerUid !== payload.customerUid) {
    throw new Error("You cannot request refund for this order.");
  }
  if (order.noRefund) {
    throw new Error("This product is marked as no refund.");
  }
  if (new Date() > new Date(order.refundDeadlineAt)) {
    throw new Error("Refund window expired.");
  }
  if (order.status !== "paid" && order.status !== "refund_requested") {
    throw new Error("Refund request is not allowed for current order status.");
  }

  const ticketId = await createSupportTicket({
    customerUid: payload.customerUid,
    customerName: payload.customerName,
    customerEmail: payload.customerEmail,
    businessName: order.businessOwnerName,
    orderReference: order.id,
    title: `Refund request for ${order.productTitle}`,
    description: payload.reason,
    priority: "high",
    expectedOutcome: "Refund approval",
    evidenceUrls: payload.evidenceUrls,
  });

  await updateDoc(orderRef, {
    status: "refund_requested",
    refundReason: payload.reason,
    refundEvidenceUrls: payload.evidenceUrls,
    refundTicketId: ticketId,
    updatedAt: serverTimestamp(),
  });

  return ticketId;
}

export async function adminApproveOrderRefund(
  orderId: string,
  adminUid: string,
  adminName: string,
  reason: string,
) {
  const database = getDb();
  const orderRef = doc(database, "orders", orderId);
  const orderSnapshot = await getDoc(orderRef);
  if (!orderSnapshot.exists()) {
    throw new Error("Order not found.");
  }

  const order = mapOrder(orderSnapshot.id, orderSnapshot.data());
  await updateDoc(orderRef, {
    status: "refunded",
    updatedAt: serverTimestamp(),
  });

  await creditWalletBalance({
    ownerUid: order.customerUid,
    amount: order.amount,
    reason: `Refund credit for order ${orderId}`,
    type: "refund_credit",
    referenceId: orderId,
  });

  const escrowSnapshots = await getDocs(
    query(collection(database, "escrowEntries"), where("orderId", "==", orderId), limit(1)),
  );
  const escrowDoc = escrowSnapshots.docs[0];
  if (escrowDoc) {
    await updateDoc(doc(database, "escrowEntries", escrowDoc.id), {
      status: "refunded",
      updatedAt: serverTimestamp(),
    });
  }

  if (order.refundTicketId) {
    await adminFinalizeSupportTicket(order.refundTicketId, adminUid, adminName, {
      action: "refunded",
      reason,
    });
  }
  await recordAuditEvent({
    actorUid: adminUid,
    actorRole: "admin",
    action: "order_refund_approved",
    targetType: "order",
    targetId: orderId,
    summary: `Approved refund for order ${orderId}.`,
    metadata: {
      amount: order.amount,
      reason,
      refundTicketId: order.refundTicketId ?? null,
    },
  });
}

export async function adminReleaseEscrowOrder(
  orderId: string,
  adminUid: string,
  adminName: string,
) {
  const database = getDb();
  const orderRef = doc(database, "orders", orderId);
  const orderSnapshot = await getDoc(orderRef);
  if (!orderSnapshot.exists()) {
    throw new Error("Order not found.");
  }

  const order = mapOrder(orderSnapshot.id, orderSnapshot.data());
  if (order.status !== "paid") {
    throw new Error("Only paid orders can be released.");
  }

  await updateDoc(orderRef, {
    status: "released",
    updatedAt: serverTimestamp(),
  });

  await creditWalletBalance({
    ownerUid: order.businessOwnerUid,
    amount: order.amount,
    reason: `Escrow released for order ${orderId}`,
    type: "escrow_release_credit",
    referenceId: orderId,
  });

  const escrowSnapshots = await getDocs(
    query(collection(database, "escrowEntries"), where("orderId", "==", orderId), limit(1)),
  );
  const escrowDoc = escrowSnapshots.docs[0];
  if (escrowDoc) {
    await updateDoc(doc(database, "escrowEntries", escrowDoc.id), {
      status: "released",
      updatedAt: serverTimestamp(),
    });
  }

  if (order.refundTicketId) {
    await adminFinalizeSupportTicket(order.refundTicketId, adminUid, adminName, {
      action: "resolved",
      reason: "Escrow released after review.",
    });
  }
  await recordAuditEvent({
    actorUid: adminUid,
    actorRole: "admin",
    action: "escrow_released",
    targetType: "order",
    targetId: orderId,
    summary: `Released escrow for order ${orderId}.`,
    metadata: {
      amount: order.amount,
      businessOwnerUid: order.businessOwnerUid,
    },
  });
}

export async function releaseDueEscrowOrders(payload: {
  adminUid: string;
  adminName: string;
  limit?: number;
}) {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "orders"), where("status", "==", "paid"), limit(payload.limit ?? 700)),
  );
  const orders = snapshots.docs
    .map((snapshot) => mapOrder(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(a.escrowReleaseAt) - Date.parse(b.escrowReleaseAt));

  const now = Date.now();
  const dueOrders = orders.filter((order) => Date.parse(order.escrowReleaseAt) <= now);
  const failures: Array<{ orderId: string; reason: string }> = [];
  let released = 0;

  for (const order of dueOrders) {
    try {
      await adminReleaseEscrowOrder(order.id, payload.adminUid, payload.adminName);
      released += 1;
    } catch (error) {
      failures.push({
        orderId: order.id,
        reason: error instanceof Error ? error.message : "Unknown escrow release error.",
      });
    }
  }

  return {
    checked: orders.length,
    due: dueOrders.length,
    released,
    failed: failures.length,
    failures,
  };
}

export type WalletTransactionType =
  | "topup_credit"
  | "purchase_debit"
  | "pro_deposit_lock_debit"
  | "pro_deposit_withdraw_credit"
  | "membership_purchase_debit"
  | "membership_distribution_credit"
  | "partnership_fee_debit"
  | "refund_credit"
  | "escrow_release_credit"
  | "admin_credit"
  | "admin_debit"
  | "withdrawal_hold"
  | "withdrawal_reversal"
  | "withdrawal_complete";

export interface WalletRecord {
  ownerUid: string;
  ownerName: string;
  balance: number;
  lockedForWithdrawal: number;
  currency: "INR";
  updatedAt: string;
}

export interface WalletTransactionRecord {
  id: string;
  ownerUid: string;
  type: WalletTransactionType;
  amount: number;
  reason: string;
  referenceId?: string;
  createdAt: string;
}

export type WithdrawalStatus = "pending" | "approved" | "declined";
export type PayoutStatus = "pending" | "processing" | "success" | "failed";

export interface WithdrawalRequestRecord {
  id: string;
  ownerUid: string;
  ownerEmail: string;
  ownerName: string;
  amount: number;
  feeAmount: number;
  netAmount: number;
  status: WithdrawalStatus;
  country: string;
  method: string;
  accountDetails: Record<string, string>;
  payoutStatus?: PayoutStatus;
  payoutReference?: string;
  payoutProcessedAt?: string;
  adminNote?: string;
  declineReason?: string;
  createdAt: string;
  updatedAt: string;
}

export type PaymentIntentPurpose = "wallet_topup" | "product_checkout";
export type PaymentIntentStatus = "created" | "processing" | "paid" | "failed" | "cancelled";

export interface PaymentIntentRecord {
  id: string;
  ownerUid: string;
  ownerName: string;
  ownerEmail: string;
  amount: number;
  currency: "INR";
  provider: "mock" | "razorpay";
  purpose: PaymentIntentPurpose;
  status: PaymentIntentStatus;
  productSlug?: string;
  orderId?: string;
  paymentUrl?: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  failureReason?: string;
  metadata?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface PayoutRecord {
  id: string;
  withdrawalRequestId: string;
  ownerUid: string;
  ownerName: string;
  amount: number;
  provider: "mock" | "razorpay";
  status: PayoutStatus;
  providerPayoutId?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GeoCatalogSummaryRecord {
  countries: number;
  cities: number;
  updatedAt?: string;
}

function walletRef(ownerUid: string) {
  const database = getDb();
  return doc(database, "wallets", ownerUid);
}

async function appendWalletTransaction(
  ownerUid: string,
  payload: {
    type: WalletTransactionType;
    amount: number;
    reason: string;
    referenceId?: string;
  },
) {
  const database = getDb();
  await addDoc(collection(database, "wallets", ownerUid, "transactions"), {
    ownerUid,
    type: payload.type,
    amount: payload.amount,
    reason: payload.reason,
    referenceId: payload.referenceId ?? null,
    createdAt: serverTimestamp(),
  });
}

async function ensureWallet(ownerUid: string, ownerName = "User") {
  const ref = walletRef(ownerUid);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    await setDoc(ref, {
      ownerUid,
      ownerName,
      balance: 0,
      lockedForWithdrawal: 0,
      currency: "INR",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

async function creditWalletBalance(payload: {
  ownerUid: string;
  amount: number;
  reason: string;
  type: WalletTransactionType;
  referenceId?: string;
}) {
  await ensureWallet(payload.ownerUid);
  const ref = walletRef(payload.ownerUid);
  await updateDoc(ref, {
    balance: increment(payload.amount),
    updatedAt: serverTimestamp(),
  });
  await appendWalletTransaction(payload.ownerUid, {
    type: payload.type,
    amount: payload.amount,
    reason: payload.reason,
    referenceId: payload.referenceId,
  });
}

async function debitWalletBalance(payload: {
  ownerUid: string;
  amount: number;
  reason: string;
  type: WalletTransactionType;
  referenceId?: string;
}) {
  await ensureWallet(payload.ownerUid);
  const ref = walletRef(payload.ownerUid);
  const snapshot = await getDoc(ref);
  const balance = Number(snapshot.data()?.balance ?? 0);

  if (balance < payload.amount) {
    throw new Error("Insufficient wallet balance.");
  }

  await updateDoc(ref, {
    balance: increment(-payload.amount),
    updatedAt: serverTimestamp(),
  });
  await appendWalletTransaction(payload.ownerUid, {
    type: payload.type,
    amount: -payload.amount,
    reason: payload.reason,
    referenceId: payload.referenceId,
  });
}

function mapWalletRecord(data: Record<string, unknown>) {
  return {
    ownerUid: String(data.ownerUid ?? ""),
    ownerName: String(data.ownerName ?? "User"),
    balance: Number(data.balance ?? 0),
    lockedForWithdrawal: Number(data.lockedForWithdrawal ?? 0),
    currency: "INR",
    updatedAt: toISODate(data.updatedAt),
  } satisfies WalletRecord;
}

export async function fetchWallet(ownerUid: string) {
  await ensureWallet(ownerUid);
  const ref = walletRef(ownerUid);
  const snapshot = await getDoc(ref);
  return mapWalletRecord(snapshot.data() ?? {});
}

export async function topUpWallet(ownerUid: string, amount: number) {
  if (amount <= 0) {
    throw new Error("Top-up amount must be greater than zero.");
  }
  await creditWalletBalance({
    ownerUid,
    amount,
    reason: "Wallet top-up",
    type: "topup_credit",
  });
}

export async function fetchWalletTransactions(ownerUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "wallets", ownerUid, "transactions"),
      orderBy("createdAt", "desc"),
      limit(120),
    ),
  );
  return snapshots.docs.map((snapshot) => {
    const data = snapshot.data();
    return {
      id: snapshot.id,
      ownerUid,
      type: data.type as WalletTransactionType,
      amount: Number(data.amount ?? 0),
      reason: String(data.reason ?? ""),
      referenceId: data.referenceId ? String(data.referenceId) : undefined,
      createdAt: toISODate(data.createdAt),
    } satisfies WalletTransactionRecord;
  });
}

export async function adminAdjustWalletBalance(payload: {
  adminUid: string;
  targetUid: string;
  amount: number;
  mode: "credit" | "debit";
  reason: string;
}) {
  if (payload.amount <= 0) {
    throw new Error("Adjustment amount must be greater than zero.");
  }
  if (payload.mode === "credit") {
    await creditWalletBalance({
      ownerUid: payload.targetUid,
      amount: payload.amount,
      reason: `Admin credit by ${payload.adminUid}: ${payload.reason}`,
      type: "admin_credit",
      referenceId: payload.adminUid,
    });
    await recordAuditEvent({
      actorUid: payload.adminUid,
      actorRole: "admin",
      action: "wallet_credit",
      targetType: "wallet",
      targetId: payload.targetUid,
      summary: `Credited wallet by INR ${payload.amount}.`,
      metadata: {
        reason: payload.reason,
      },
    });
    return;
  }

  await debitWalletBalance({
    ownerUid: payload.targetUid,
    amount: payload.amount,
    reason: `Admin debit by ${payload.adminUid}: ${payload.reason}`,
    type: "admin_debit",
    referenceId: payload.adminUid,
  });
  await recordAuditEvent({
    actorUid: payload.adminUid,
    actorRole: "admin",
    action: "wallet_debit",
    targetType: "wallet",
    targetId: payload.targetUid,
    summary: `Debited wallet by INR ${payload.amount}.`,
    metadata: {
      reason: payload.reason,
    },
  });
}

async function getWithdrawalSettings() {
  const database = getDb();
  const settingsRef = doc(database, "platformSettings", "finance");
  const snapshot = await getDoc(settingsRef);
  if (!snapshot.exists()) {
    await setDoc(settingsRef, {
      withdrawalFeePercent: 2,
      withdrawalFlatFee: 10,
      updatedAt: serverTimestamp(),
    });
    return {
      withdrawalFeePercent: 2,
      withdrawalFlatFee: 10,
    };
  }

  return {
    withdrawalFeePercent: Number(snapshot.data().withdrawalFeePercent ?? 2),
    withdrawalFlatFee: Number(snapshot.data().withdrawalFlatFee ?? 10),
  };
}

export async function updateWithdrawalSettings(payload: {
  adminUid: string;
  feePercent: number;
  flatFee: number;
}) {
  const database = getDb();
  const settingsRef = doc(database, "platformSettings", "finance");
  await setDoc(
    settingsRef,
    {
      withdrawalFeePercent: payload.feePercent,
      withdrawalFlatFee: payload.flatFee,
      updatedBy: payload.adminUid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function fetchWithdrawalSettings() {
  return getWithdrawalSettings();
}

export async function createWithdrawalRequest(payload: {
  ownerUid: string;
  ownerName: string;
  ownerEmail: string;
  amount: number;
  country: string;
  method: string;
  accountDetails: Record<string, string>;
}) {
  if (payload.amount <= 0) {
    throw new Error("Withdrawal amount must be greater than zero.");
  }

  const database = getDb();
  await ensureWallet(payload.ownerUid, payload.ownerName);
  const ref = walletRef(payload.ownerUid);
  const walletSnapshot = await getDoc(ref);
  const currentWallet = mapWalletRecord(walletSnapshot.data() ?? {});

  if (currentWallet.balance < payload.amount) {
    throw new Error("Insufficient wallet balance for withdrawal.");
  }

  const settings = await getWithdrawalSettings();
  const feeAmount = Math.round(
    payload.amount * (settings.withdrawalFeePercent / 100) + settings.withdrawalFlatFee,
  );
  const netAmount = Math.max(payload.amount - feeAmount, 0);

  await updateDoc(ref, {
    balance: increment(-payload.amount),
    lockedForWithdrawal: increment(payload.amount),
    updatedAt: serverTimestamp(),
  });

  await appendWalletTransaction(payload.ownerUid, {
    type: "withdrawal_hold",
    amount: -payload.amount,
    reason: "Withdrawal request submitted",
  });

  const requestRef = await addDoc(collection(database, "withdrawalRequests"), {
    ownerUid: payload.ownerUid,
    ownerName: payload.ownerName,
    ownerEmail: payload.ownerEmail,
    amount: payload.amount,
    feeAmount,
    netAmount,
    status: "pending",
    country: payload.country,
    method: payload.method,
    accountDetails: payload.accountDetails,
    payoutStatus: "pending",
    payoutReference: null,
    payoutProcessedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return requestRef.id;
}

function mapWithdrawalRecord(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    ownerUid: String(data.ownerUid ?? ""),
    ownerEmail: String(data.ownerEmail ?? ""),
    ownerName: String(data.ownerName ?? ""),
    amount: Number(data.amount ?? 0),
    feeAmount: Number(data.feeAmount ?? 0),
    netAmount: Number(data.netAmount ?? 0),
    status: (data.status as WithdrawalStatus) ?? "pending",
    country: String(data.country ?? ""),
    method: String(data.method ?? ""),
    accountDetails: (data.accountDetails as Record<string, string>) ?? {},
    payoutStatus: data.payoutStatus ? (String(data.payoutStatus) as PayoutStatus) : undefined,
    payoutReference: data.payoutReference ? String(data.payoutReference) : undefined,
    payoutProcessedAt: data.payoutProcessedAt ? toISODate(data.payoutProcessedAt) : undefined,
    adminNote: data.adminNote ? String(data.adminNote) : undefined,
    declineReason: data.declineReason ? String(data.declineReason) : undefined,
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
  } satisfies WithdrawalRequestRecord;
}

function paymentProviderFromEnv() {
  const raw = String(process.env.PAYMENT_PROVIDER ?? "mock")
    .trim()
    .toLowerCase();
  return raw === "razorpay" ? "razorpay" : "mock";
}

function mapPaymentIntent(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    ownerUid: String(data.ownerUid ?? ""),
    ownerName: String(data.ownerName ?? "User"),
    ownerEmail: String(data.ownerEmail ?? ""),
    amount: Number(data.amount ?? 0),
    currency: "INR",
    provider: (String(data.provider ?? "mock") as PaymentIntentRecord["provider"]) ?? "mock",
    purpose: (String(data.purpose ?? "wallet_topup") as PaymentIntentPurpose) ?? "wallet_topup",
    status: (String(data.status ?? "created") as PaymentIntentStatus) ?? "created",
    productSlug: data.productSlug ? String(data.productSlug) : undefined,
    orderId: data.orderId ? String(data.orderId) : undefined,
    paymentUrl: data.paymentUrl ? String(data.paymentUrl) : undefined,
    providerOrderId: data.providerOrderId ? String(data.providerOrderId) : undefined,
    providerPaymentId: data.providerPaymentId ? String(data.providerPaymentId) : undefined,
    failureReason: data.failureReason ? String(data.failureReason) : undefined,
    metadata: (data.metadata as Record<string, string>) ?? undefined,
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
  } satisfies PaymentIntentRecord;
}

function mapPayoutRecord(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    withdrawalRequestId: String(data.withdrawalRequestId ?? ""),
    ownerUid: String(data.ownerUid ?? ""),
    ownerName: String(data.ownerName ?? "User"),
    amount: Number(data.amount ?? 0),
    provider: (String(data.provider ?? "mock") as PayoutRecord["provider"]) ?? "mock",
    status: (String(data.status ?? "pending") as PayoutStatus) ?? "pending",
    providerPayoutId: data.providerPayoutId ? String(data.providerPayoutId) : undefined,
    failureReason: data.failureReason ? String(data.failureReason) : undefined,
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
  } satisfies PayoutRecord;
}

export async function createWalletTopupPaymentIntent(payload: {
  ownerUid: string;
  ownerName: string;
  ownerEmail: string;
  amount: number;
}) {
  if (payload.amount <= 0) {
    throw new Error("Top-up amount must be greater than zero.");
  }
  const database = getDb();
  const provider = paymentProviderFromEnv();
  const intentRef = await addDoc(collection(database, "paymentIntents"), {
    ownerUid: payload.ownerUid,
    ownerName: payload.ownerName,
    ownerEmail: payload.ownerEmail,
    amount: payload.amount,
    currency: "INR",
    provider,
    purpose: "wallet_topup",
    status: provider === "mock" ? "created" : "processing",
    paymentUrl: "",
    metadata: {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const paymentUrl = `${baseUrl()}/payments/mock/${intentRef.id}`;
  await updateDoc(doc(database, "paymentIntents", intentRef.id), {
    paymentUrl,
    providerOrderId:
      provider === "razorpay"
        ? `rzp_order_${intentRef.id.slice(0, 14)}`
        : `mock_order_${intentRef.id.slice(0, 14)}`,
    updatedAt: serverTimestamp(),
  });
  return intentRef.id;
}

export async function createProductCheckoutPaymentIntent(payload: {
  ownerUid: string;
  ownerName: string;
  ownerEmail: string;
  productSlug: string;
}) {
  const product = await fetchDigitalProductBySlug(payload.productSlug);
  if (!product) throw new Error("Product not found.");
  const database = getDb();
  const provider = paymentProviderFromEnv();
  const intentRef = await addDoc(collection(database, "paymentIntents"), {
    ownerUid: payload.ownerUid,
    ownerName: payload.ownerName,
    ownerEmail: payload.ownerEmail,
    amount: product.price,
    currency: "INR",
    provider,
    purpose: "product_checkout",
    productSlug: product.uniqueLinkSlug,
    status: provider === "mock" ? "created" : "processing",
    paymentUrl: "",
    metadata: {
      productId: product.id,
      productTitle: product.title,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const paymentUrl = `${baseUrl()}/payments/mock/${intentRef.id}`;
  await updateDoc(doc(database, "paymentIntents", intentRef.id), {
    paymentUrl,
    providerOrderId:
      provider === "razorpay"
        ? `rzp_order_${intentRef.id.slice(0, 14)}`
        : `mock_order_${intentRef.id.slice(0, 14)}`,
    updatedAt: serverTimestamp(),
  });
  return intentRef.id;
}

export async function fetchPaymentIntentById(intentId: string) {
  const database = getDb();
  const snapshot = await getDoc(doc(database, "paymentIntents", intentId));
  if (!snapshot.exists()) return null;
  return mapPaymentIntent(snapshot.id, snapshot.data());
}

export async function fetchPaymentIntentsByOwner(ownerUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "paymentIntents"), where("ownerUid", "==", ownerUid), limit(200)),
  );
  return snapshots.docs
    .map((snapshot) => mapPaymentIntent(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function markPaymentIntentAsPaid(payload: {
  intentId: string;
  providerPaymentId?: string;
  actorUid: string;
  actorRole: "customer" | "admin" | "system";
}) {
  const database = getDb();
  const intentRef = doc(database, "paymentIntents", payload.intentId);
  const snapshot = await getDoc(intentRef);
  if (!snapshot.exists()) throw new Error("Payment intent not found.");
  const intent = mapPaymentIntent(snapshot.id, snapshot.data());
  if (intent.status === "paid") {
    return {
      intentId: intent.id,
      orderId: intent.orderId,
      walletCredited: intent.purpose === "wallet_topup",
    };
  }
  if (intent.status === "cancelled" || intent.status === "failed") {
    throw new Error(`Payment intent is ${intent.status} and cannot be marked paid.`);
  }

  let orderId: string | undefined;
  if (intent.purpose === "wallet_topup") {
    await creditWalletBalance({
      ownerUid: intent.ownerUid,
      amount: intent.amount,
      reason: `Gateway top-up (${intent.provider})`,
      type: "topup_credit",
      referenceId: intent.id,
    });
  } else {
    if (!intent.productSlug) throw new Error("Checkout payment intent is missing product slug.");
    const product = await fetchDigitalProductBySlug(intent.productSlug);
    if (!product) throw new Error("Product not found for checkout payment intent.");
    orderId = await createOrderAndEscrowFromProduct({
      product,
      customer: {
        uid: intent.ownerUid,
        name: intent.ownerName,
        email: intent.ownerEmail,
      },
      paymentIntentId: intent.id,
    });
  }

  await updateDoc(intentRef, {
    status: "paid",
    providerPaymentId:
      payload.providerPaymentId?.trim() ||
      (intent.provider === "mock"
        ? `mock_pay_${intent.id.slice(0, 14)}`
        : `rzp_pay_${intent.id.slice(0, 14)}`),
    orderId: orderId ?? null,
    paidAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await recordAuditEvent({
    actorUid: payload.actorUid,
    actorRole: payload.actorRole,
    action: "payment_intent_paid",
    targetType: "payment_intent",
    targetId: intent.id,
    summary: `Payment intent ${intent.id} marked paid.`,
    metadata: {
      purpose: intent.purpose,
      amount: intent.amount,
      provider: intent.provider,
      orderId: orderId ?? null,
    },
  });

  return {
    intentId: intent.id,
    orderId,
    walletCredited: intent.purpose === "wallet_topup",
  };
}

export async function markPaymentIntentAsFailed(payload: {
  intentId: string;
  reason: string;
  actorUid: string;
  actorRole: "customer" | "admin" | "system";
}) {
  const database = getDb();
  await updateDoc(doc(database, "paymentIntents", payload.intentId), {
    status: "failed",
    failureReason: payload.reason,
    updatedAt: serverTimestamp(),
  });
  await recordAuditEvent({
    actorUid: payload.actorUid,
    actorRole: payload.actorRole,
    action: "payment_intent_failed",
    targetType: "payment_intent",
    targetId: payload.intentId,
    summary: `Payment intent ${payload.intentId} failed.`,
    metadata: {
      reason: payload.reason,
    },
  });
}

export async function executePayoutForWithdrawalRequest(payload: {
  requestId: string;
  adminUid: string;
}) {
  const database = getDb();
  const requestRef = doc(database, "withdrawalRequests", payload.requestId);
  const requestSnapshot = await getDoc(requestRef);
  if (!requestSnapshot.exists()) {
    throw new Error("Withdrawal request not found.");
  }
  const request = mapWithdrawalRecord(payload.requestId, requestSnapshot.data());
  if (request.status !== "approved") {
    throw new Error("Only approved withdrawal requests can be paid out.");
  }
  if (request.payoutStatus === "success") {
    return {
      payoutId: request.payoutReference ?? "",
      status: "success" as const,
    };
  }

  const provider = paymentProviderFromEnv();
  const payoutRef = await addDoc(collection(database, "payouts"), {
    withdrawalRequestId: request.id,
    ownerUid: request.ownerUid,
    ownerName: request.ownerName,
    amount: request.netAmount,
    provider,
    status: "processing",
    providerPayoutId: "",
    failureReason: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const providerPayoutId =
    provider === "mock"
      ? `mock_payout_${payoutRef.id.slice(0, 14)}`
      : `rzp_payout_${payoutRef.id.slice(0, 14)}`;
  const finalStatus: PayoutStatus = provider === "mock" ? "success" : "processing";

  await updateDoc(doc(database, "payouts", payoutRef.id), {
    status: finalStatus,
    providerPayoutId,
    updatedAt: serverTimestamp(),
  });
  await updateDoc(requestRef, {
    payoutStatus: finalStatus,
    payoutReference: providerPayoutId,
    payoutProcessedAt: finalStatus === "success" ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  });

  await recordAuditEvent({
    actorUid: payload.adminUid,
    actorRole: "admin",
    action: "withdrawal_payout_execute",
    targetType: "withdrawal_request",
    targetId: request.id,
    summary: `Payout execution started for withdrawal ${request.id}.`,
    metadata: {
      payoutId: payoutRef.id,
      provider,
      status: finalStatus,
      amount: request.netAmount,
    },
  });

  return {
    payoutId: payoutRef.id,
    status: finalStatus,
    providerPayoutId,
  };
}

export async function fetchAdminPayouts() {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "payouts"), orderBy("createdAt", "desc"), limit(300)),
  );
  return snapshots.docs.map((snapshot) => mapPayoutRecord(snapshot.id, snapshot.data()));
}

export async function fetchWithdrawalRequestsByUser(ownerUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "withdrawalRequests"),
      where("ownerUid", "==", ownerUid),
      limit(120),
    ),
  );
  return snapshots.docs
    .map((snapshot) => mapWithdrawalRecord(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function fetchAdminWithdrawalRequests() {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "withdrawalRequests"), orderBy("createdAt", "desc"), limit(150)),
  );
  return snapshots.docs.map((snapshot) => mapWithdrawalRecord(snapshot.id, snapshot.data()));
}

export async function adminReviewWithdrawalRequest(payload: {
  adminUid: string;
  requestId: string;
  action: "approve" | "decline";
  note: string;
}) {
  const database = getDb();
  const requestRef = doc(database, "withdrawalRequests", payload.requestId);
  const requestSnapshot = await getDoc(requestRef);
  if (!requestSnapshot.exists()) {
    throw new Error("Withdrawal request not found.");
  }

  const request = mapWithdrawalRecord(payload.requestId, requestSnapshot.data());
  if (request.status !== "pending") {
    throw new Error("Only pending requests can be reviewed.");
  }

  const ref = walletRef(request.ownerUid);
  if (payload.action === "approve") {
    await updateDoc(ref, {
      lockedForWithdrawal: increment(-request.amount),
      updatedAt: serverTimestamp(),
    });
    await updateDoc(requestRef, {
      status: "approved",
      adminNote: payload.note,
      payoutStatus: "processing",
      reviewedBy: payload.adminUid,
      updatedAt: serverTimestamp(),
    });
    await appendWalletTransaction(request.ownerUid, {
      type: "withdrawal_complete",
      amount: 0,
      reason: `Withdrawal approved for net ${request.netAmount}`,
      referenceId: request.id,
    });
    await recordAuditEvent({
      actorUid: payload.adminUid,
      actorRole: "admin",
      action: "withdrawal_approved",
      targetType: "withdrawal_request",
      targetId: request.id,
      summary: `Approved withdrawal request ${request.id}.`,
      metadata: {
        grossAmount: request.amount,
        netAmount: request.netAmount,
        note: payload.note,
      },
    });
    await executePayoutForWithdrawalRequest({
      requestId: request.id,
      adminUid: payload.adminUid,
    });
    return;
  }

  await updateDoc(ref, {
    balance: increment(request.amount),
    lockedForWithdrawal: increment(-request.amount),
    updatedAt: serverTimestamp(),
  });
  await updateDoc(requestRef, {
    status: "declined",
    declineReason: payload.note,
    payoutStatus: "failed",
    reviewedBy: payload.adminUid,
    updatedAt: serverTimestamp(),
  });
  await appendWalletTransaction(request.ownerUid, {
    type: "withdrawal_reversal",
    amount: request.amount,
    reason: "Withdrawal request declined, amount returned to wallet",
    referenceId: request.id,
  });
  await recordAuditEvent({
    actorUid: payload.adminUid,
    actorRole: "admin",
    action: "withdrawal_declined",
    targetType: "withdrawal_request",
    targetId: request.id,
    summary: `Declined withdrawal request ${request.id}.`,
    metadata: {
      amount: request.amount,
      reason: payload.note,
    },
  });
}

export interface GroupRecord {
  id: string;
  ownerUid: string;
  ownerName: string;
  title: string;
  description: string;
  adminOnlyMessaging: boolean;
  membersCount: number;
  joinCode: string;
  joinLink: string;
  widgetCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface GroupMessageRecord {
  id: string;
  groupId: string;
  senderUid: string;
  senderName: string;
  senderRole: "owner" | "member" | "admin";
  text: string;
  createdAt: string;
}

function baseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
}

function mapGroup(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    ownerUid: String(data.ownerUid ?? ""),
    ownerName: String(data.ownerName ?? "Business"),
    title: String(data.title ?? ""),
    description: String(data.description ?? ""),
    adminOnlyMessaging: Boolean(data.adminOnlyMessaging),
    membersCount: Number(data.membersCount ?? 0),
    joinCode: String(data.joinCode ?? ""),
    joinLink: String(data.joinLink ?? ""),
    widgetCode: String(data.widgetCode ?? ""),
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
  } satisfies GroupRecord;
}

export async function userCanCreateBusinessGroup(ownerUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "businessApplications"),
      where("ownerUid", "==", ownerUid),
      limit(1),
    ),
  );
  return !snapshots.empty;
}

export async function createBusinessGroup(payload: {
  ownerUid: string;
  ownerName: string;
  title: string;
  description: string;
  adminOnlyMessaging: boolean;
}) {
  const database = getDb();
  const canCreate = await userCanCreateBusinessGroup(payload.ownerUid);
  if (!canCreate) {
    throw new Error("Only business users can create groups.");
  }

  const groupRef = await addDoc(collection(database, "groups"), {
    ownerUid: payload.ownerUid,
    ownerName: payload.ownerName,
    title: payload.title,
    description: payload.description,
    adminOnlyMessaging: payload.adminOnlyMessaging,
    membersCount: 1,
    joinCode: Math.random().toString(36).slice(2, 10).toUpperCase(),
    joinLink: "",
    widgetCode: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const joinLink = `${baseUrl()}/groups/${groupRef.id}`;
  const widgetCode = `<iframe src="${baseUrl()}/group-widget/${groupRef.id}" width="320" height="180" style="border:0;border-radius:12px;overflow:hidden;" loading="lazy" title="Business Verifier Group Widget"></iframe>`;

  await updateDoc(doc(database, "groups", groupRef.id), {
    joinLink,
    widgetCode,
    updatedAt: serverTimestamp(),
  });

  await setDoc(doc(database, "groups", groupRef.id, "members", payload.ownerUid), {
    userUid: payload.ownerUid,
    userName: payload.ownerName,
    role: "owner",
    joinedAt: serverTimestamp(),
  });
  await setDoc(doc(database, "users", payload.ownerUid, "groupMemberships", groupRef.id), {
    groupId: groupRef.id,
    role: "owner",
    joinedAt: serverTimestamp(),
  });

  await addDoc(collection(database, "groups", groupRef.id, "messages"), {
    senderUid: payload.ownerUid,
    senderName: payload.ownerName,
    senderRole: "owner",
    text: "Group created. Invite members with join link or widget code.",
    createdAt: serverTimestamp(),
  });

  return groupRef.id;
}

export async function fetchGroupById(groupId: string) {
  const database = getDb();
  const snapshot = await getDoc(doc(database, "groups", groupId));
  if (!snapshot.exists()) return null;
  return mapGroup(snapshot.id, snapshot.data());
}

export async function fetchGroupsCreatedByUser(ownerUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "groups"), where("ownerUid", "==", ownerUid), limit(120)),
  );
  return snapshots.docs
    .map((snapshot) => mapGroup(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function fetchPublicGroups() {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "groups"), orderBy("createdAt", "desc"), limit(150)),
  );
  return snapshots.docs.map((snapshot) => mapGroup(snapshot.id, snapshot.data()));
}

export async function isGroupMember(groupId: string, userUid: string) {
  const database = getDb();
  const snapshot = await getDoc(doc(database, "groups", groupId, "members", userUid));
  return snapshot.exists();
}

export async function joinGroup(payload: {
  groupId: string;
  userUid: string;
  userName: string;
}) {
  const database = getDb();
  const memberRef = doc(database, "groups", payload.groupId, "members", payload.userUid);
  const existing = await getDoc(memberRef);
  if (existing.exists()) return;

  await setDoc(memberRef, {
    userUid: payload.userUid,
    userName: payload.userName,
    role: "member",
    joinedAt: serverTimestamp(),
  });
  await setDoc(doc(database, "users", payload.userUid, "groupMemberships", payload.groupId), {
    groupId: payload.groupId,
    role: "member",
    joinedAt: serverTimestamp(),
  });
  await updateDoc(doc(database, "groups", payload.groupId), {
    membersCount: increment(1),
    updatedAt: serverTimestamp(),
  });
}

export async function unjoinGroup(payload: { groupId: string; userUid: string }) {
  const database = getDb();
  const group = await fetchGroupById(payload.groupId);
  if (!group) throw new Error("Group not found.");
  if (group.ownerUid === payload.userUid) {
    throw new Error("Group owner cannot unjoin own group.");
  }

  const memberRef = doc(database, "groups", payload.groupId, "members", payload.userUid);
  const existing = await getDoc(memberRef);
  if (!existing.exists()) return;

  await deleteDoc(memberRef);
  await deleteDoc(doc(database, "users", payload.userUid, "groupMemberships", payload.groupId));
  await updateDoc(doc(database, "groups", payload.groupId), {
    membersCount: increment(-1),
    updatedAt: serverTimestamp(),
  });
}

export async function fetchGroupsJoinedByUser(userUid: string) {
  const database = getDb();
  const memberSnapshots = await getDocs(
    query(collection(database, "users", userUid, "groupMemberships"), limit(120)),
  );

  const groupIds = memberSnapshots.docs.map((docSnapshot) => String(docSnapshot.id));
  const rows = await Promise.all(groupIds.map((groupId) => fetchGroupById(groupId)));
  return rows
    .filter((item): item is GroupRecord => Boolean(item))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function updateGroupMessagingMode(payload: {
  groupId: string;
  ownerUid: string;
  adminOnlyMessaging: boolean;
}) {
  const database = getDb();
  const group = await fetchGroupById(payload.groupId);
  if (!group) throw new Error("Group not found.");
  if (group.ownerUid !== payload.ownerUid) {
    throw new Error("Only group owner can change messaging mode.");
  }

  await updateDoc(doc(database, "groups", payload.groupId), {
    adminOnlyMessaging: payload.adminOnlyMessaging,
    updatedAt: serverTimestamp(),
  });
}

export async function fetchGroupMessages(groupId: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "groups", groupId, "messages"),
      orderBy("createdAt", "asc"),
      limit(250),
    ),
  );
  return snapshots.docs.map((snapshot) => {
    const data = snapshot.data();
    return {
      id: snapshot.id,
      groupId,
      senderUid: String(data.senderUid ?? ""),
      senderName: String(data.senderName ?? "User"),
      senderRole: (data.senderRole as GroupMessageRecord["senderRole"]) ?? "member",
      text: String(data.text ?? ""),
      createdAt: toISODate(data.createdAt),
    } satisfies GroupMessageRecord;
  });
}

export async function sendGroupMessage(payload: {
  groupId: string;
  senderUid: string;
  senderName: string;
  senderRole: "owner" | "member" | "admin";
  text: string;
}) {
  const database = getDb();
  const group = await fetchGroupById(payload.groupId);
  if (!group) throw new Error("Group not found.");

  const member = await isGroupMember(payload.groupId, payload.senderUid);
  if (!member && group.ownerUid !== payload.senderUid && payload.senderRole !== "admin") {
    throw new Error("You must join group first.");
  }

  if (group.adminOnlyMessaging && payload.senderUid !== group.ownerUid && payload.senderRole !== "admin") {
    throw new Error("Only group admin can message in this group.");
  }

  await addDoc(collection(database, "groups", payload.groupId, "messages"), {
    senderUid: payload.senderUid,
    senderName: payload.senderName,
    senderRole: payload.senderRole,
    text: payload.text,
    createdAt: serverTimestamp(),
  });
}

export async function fetchAdminGroupsOverview() {
  return fetchPublicGroups();
}

export type NotificationCategory = "offers" | "updates" | "general" | "emergency";
export type NotificationEndpointStatus = "active" | "blocked" | "spam_review";

export interface NotificationEndpointRecord {
  id: string;
  ownerUid: string;
  ownerName: string;
  label: string;
  endpointSecret: string;
  status: NotificationEndpointStatus;
  sentCount: number;
  billedSentCount: number;
  spamReports: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserNotificationRecord {
  id: string;
  endpointId: string;
  ownerUid: string;
  category: NotificationCategory;
  title: string;
  message: string;
  isSpam: boolean;
  createdAt: string;
}

function mapEndpoint(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    ownerUid: String(data.ownerUid ?? ""),
    ownerName: String(data.ownerName ?? "Business"),
    label: String(data.label ?? "Default Endpoint"),
    endpointSecret: String(data.endpointSecret ?? ""),
    status: (data.status as NotificationEndpointStatus) ?? "active",
    sentCount: Number(data.sentCount ?? 0),
    billedSentCount: Number(data.billedSentCount ?? 0),
    spamReports: Number(data.spamReports ?? 0),
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
  } satisfies NotificationEndpointRecord;
}

function mapUserNotification(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    endpointId: String(data.endpointId ?? ""),
    ownerUid: String(data.ownerUid ?? ""),
    category: (data.category as NotificationCategory) ?? "general",
    title: String(data.title ?? ""),
    message: String(data.message ?? ""),
    isSpam: Boolean(data.isSpam),
    createdAt: toISODate(data.createdAt),
  } satisfies UserNotificationRecord;
}

async function getUserUidByPublicId(publicId: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "users"), where("publicId", "==", publicId), limit(1)),
  );
  const row = snapshots.docs[0];
  return row ? row.id : null;
}

export async function createNotificationEndpoint(payload: {
  ownerUid: string;
  ownerName: string;
  label: string;
}) {
  const database = getDb();
  const canCreate = await userCanCreateBusinessGroup(payload.ownerUid);
  if (!canCreate) {
    throw new Error("Only business users can create notification endpoints.");
  }

  const endpointSecret = `nfy_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const endpointRef = await addDoc(collection(database, "notificationEndpoints"), {
    ownerUid: payload.ownerUid,
    ownerName: payload.ownerName,
    label: payload.label,
    endpointSecret,
    status: "active",
    sentCount: 0,
    billedSentCount: 0,
    spamReports: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    endpointId: endpointRef.id,
    endpointSecret,
  };
}

export async function fetchNotificationEndpointsByOwner(ownerUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "notificationEndpoints"),
      where("ownerUid", "==", ownerUid),
      limit(100),
    ),
  );
  return snapshots.docs
    .map((snapshot) => mapEndpoint(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function sendNotificationViaEndpoint(payload: {
  endpointId: string;
  ownerUid: string;
  endpointSecret: string;
  category: NotificationCategory;
  title: string;
  message: string;
  recipientPublicIds: string[];
}) {
  const database = getDb();
  const endpointSnapshot = await getDoc(
    doc(database, "notificationEndpoints", payload.endpointId),
  );
  if (!endpointSnapshot.exists()) {
    throw new Error("Notification endpoint not found.");
  }
  const endpoint = mapEndpoint(payload.endpointId, endpointSnapshot.data());
  if (endpoint.ownerUid !== payload.ownerUid) {
    throw new Error("You cannot use this endpoint.");
  }
  if (endpoint.endpointSecret !== payload.endpointSecret.trim()) {
    throw new Error("Invalid endpoint secret.");
  }
  if (endpoint.status !== "active") {
    throw new Error(`Endpoint is currently ${endpoint.status}.`);
  }

  const publicIds = [...new Set(payload.recipientPublicIds.map((id) => id.trim()).filter(Boolean))];
  if (!publicIds.length) {
    throw new Error("At least one recipient public ID is required.");
  }
  if (publicIds.length > 200) {
    throw new Error("Maximum 200 recipient IDs allowed per send.");
  }

  let delivered = 0;
  for (const publicId of publicIds) {
    const uid = await getUserUidByPublicId(publicId);
    if (!uid) continue;
    await addDoc(collection(database, "users", uid, "notifications"), {
      endpointId: payload.endpointId,
      ownerUid: payload.ownerUid,
      category: payload.category,
      title: payload.title,
      message: payload.message,
      isSpam: false,
      createdAt: serverTimestamp(),
    });
    delivered += 1;
  }

  await updateDoc(doc(database, "notificationEndpoints", payload.endpointId), {
    sentCount: increment(delivered),
    updatedAt: serverTimestamp(),
  });

  return delivered;
}

export async function fetchUserNotifications(userUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "users", userUid, "notifications"), orderBy("createdAt", "desc"), limit(200)),
  );
  return snapshots.docs.map((snapshot) => mapUserNotification(snapshot.id, snapshot.data()));
}

export async function markUserNotificationAsSpam(userUid: string, notificationId: string) {
  const database = getDb();
  const notificationRef = doc(database, "users", userUid, "notifications", notificationId);
  const notificationSnapshot = await getDoc(notificationRef);
  if (!notificationSnapshot.exists()) {
    throw new Error("Notification not found.");
  }
  const notification = mapUserNotification(notificationId, notificationSnapshot.data());
  if (notification.isSpam) return;

  await updateDoc(notificationRef, {
    isSpam: true,
  });

  const endpointRef = doc(database, "notificationEndpoints", notification.endpointId);
  const endpointSnapshot = await getDoc(endpointRef);
  if (!endpointSnapshot.exists()) return;
  const endpoint = mapEndpoint(notification.endpointId, endpointSnapshot.data());
  const nextReports = endpoint.spamReports + 1;
  await updateDoc(endpointRef, {
    spamReports: increment(1),
    status: nextReports >= 10 ? "spam_review" : endpoint.status,
    updatedAt: serverTimestamp(),
  });
}

export async function fetchAdminNotificationEndpoints() {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "notificationEndpoints"), orderBy("createdAt", "desc"), limit(200)),
  );
  return snapshots.docs.map((snapshot) => mapEndpoint(snapshot.id, snapshot.data()));
}

export async function adminUpdateEndpointStatus(payload: {
  endpointId: string;
  adminUid: string;
  status: NotificationEndpointStatus;
}) {
  const database = getDb();
  await updateDoc(doc(database, "notificationEndpoints", payload.endpointId), {
    status: payload.status,
    reviewedBy: payload.adminUid,
    updatedAt: serverTimestamp(),
  });
  await recordAuditEvent({
    actorUid: payload.adminUid,
    actorRole: "admin",
    action: "notification_endpoint_status",
    targetType: "notification_endpoint",
    targetId: payload.endpointId,
    summary: `Updated endpoint ${payload.endpointId} status to ${payload.status}.`,
  });
}

export async function fetchNotificationApiCharges() {
  const database = getDb();
  const ref = doc(database, "platformSettings", "notificationApi");
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    await setDoc(ref, {
      monthlyBaseFee: 99,
      per1000MessagesFee: 25,
      updatedAt: serverTimestamp(),
    });
    return {
      monthlyBaseFee: 99,
      per1000MessagesFee: 25,
    };
  }
  return {
    monthlyBaseFee: Number(snapshot.data().monthlyBaseFee ?? 99),
    per1000MessagesFee: Number(snapshot.data().per1000MessagesFee ?? 25),
  };
}

export async function updateNotificationApiCharges(payload: {
  adminUid: string;
  monthlyBaseFee: number;
  per1000MessagesFee: number;
}) {
  const database = getDb();
  const ref = doc(database, "platformSettings", "notificationApi");
  await setDoc(
    ref,
    {
      monthlyBaseFee: payload.monthlyBaseFee,
      per1000MessagesFee: payload.per1000MessagesFee,
      updatedBy: payload.adminUid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export type AdCampaignStatus = "draft" | "active" | "paused" | "rejected";
export type AdPlacement = "home_banner" | "directory_banner";

export interface AdCampaignRecord {
  id: string;
  ownerUid: string;
  ownerName: string;
  title: string;
  imageUrl: string;
  destinationUrl: string;
  placement: AdPlacement;
  cityTargets: string[];
  status: AdCampaignStatus;
  impressions: number;
  billedImpressions: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

function mapAdCampaign(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    ownerUid: String(data.ownerUid ?? ""),
    ownerName: String(data.ownerName ?? "Business"),
    title: String(data.title ?? ""),
    imageUrl: String(data.imageUrl ?? ""),
    destinationUrl: String(data.destinationUrl ?? ""),
    placement: (data.placement as AdPlacement) ?? "home_banner",
    cityTargets: (data.cityTargets as string[]) ?? [],
    status: (data.status as AdCampaignStatus) ?? "draft",
    impressions: Number(data.impressions ?? 0),
    billedImpressions: Number(data.billedImpressions ?? 0),
    notes: data.notes ? String(data.notes) : undefined,
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
  } satisfies AdCampaignRecord;
}

export async function fetchAdPricingSettings() {
  const database = getDb();
  const ref = doc(database, "platformSettings", "ads");
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    await setDoc(ref, {
      homeBannerCpm: 120,
      directoryBannerCpm: 80,
      recommendedTagMonthly: 499,
      cityTargetingSurchargePercent: 10,
      updatedAt: serverTimestamp(),
    });
    return {
      homeBannerCpm: 120,
      directoryBannerCpm: 80,
      recommendedTagMonthly: 499,
      cityTargetingSurchargePercent: 10,
    };
  }
  return {
    homeBannerCpm: Number(snapshot.data().homeBannerCpm ?? 120),
    directoryBannerCpm: Number(snapshot.data().directoryBannerCpm ?? 80),
    recommendedTagMonthly: Number(snapshot.data().recommendedTagMonthly ?? 499),
    cityTargetingSurchargePercent: Number(
      snapshot.data().cityTargetingSurchargePercent ?? 10,
    ),
  };
}

export async function updateAdPricingSettings(payload: {
  adminUid: string;
  homeBannerCpm: number;
  directoryBannerCpm: number;
  recommendedTagMonthly: number;
  cityTargetingSurchargePercent: number;
}) {
  const database = getDb();
  await setDoc(
    doc(database, "platformSettings", "ads"),
    {
      homeBannerCpm: payload.homeBannerCpm,
      directoryBannerCpm: payload.directoryBannerCpm,
      recommendedTagMonthly: payload.recommendedTagMonthly,
      cityTargetingSurchargePercent: payload.cityTargetingSurchargePercent,
      updatedBy: payload.adminUid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function createAdCampaign(payload: {
  ownerUid: string;
  ownerName: string;
  title: string;
  imageUrl: string;
  destinationUrl: string;
  placement: AdPlacement;
  cityTargets: string[];
}) {
  const database = getDb();
  const canCreate = await userCanCreateBusinessGroup(payload.ownerUid);
  if (!canCreate) {
    throw new Error("Only business users can create ad campaigns.");
  }

  const ref = await addDoc(collection(database, "adCampaigns"), {
    ownerUid: payload.ownerUid,
    ownerName: payload.ownerName,
    title: payload.title,
    imageUrl: payload.imageUrl,
    destinationUrl: payload.destinationUrl,
    placement: payload.placement,
    cityTargets: payload.cityTargets,
    status: "draft",
    impressions: 0,
    billedImpressions: 0,
    notes: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function fetchAdCampaignsByOwner(ownerUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "adCampaigns"), where("ownerUid", "==", ownerUid), limit(120)),
  );
  return snapshots.docs
    .map((snapshot) => mapAdCampaign(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function fetchAdminAdCampaigns() {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "adCampaigns"), orderBy("createdAt", "desc"), limit(200)),
  );
  return snapshots.docs.map((snapshot) => mapAdCampaign(snapshot.id, snapshot.data()));
}

export async function adminReviewAdCampaign(payload: {
  campaignId: string;
  adminUid: string;
  status: AdCampaignStatus;
  notes: string;
}) {
  const database = getDb();
  await updateDoc(doc(database, "adCampaigns", payload.campaignId), {
    status: payload.status,
    notes: payload.notes,
    reviewedBy: payload.adminUid,
    updatedAt: serverTimestamp(),
  });
  await recordAuditEvent({
    actorUid: payload.adminUid,
    actorRole: "admin",
    action: "ad_campaign_review",
    targetType: "ad_campaign",
    targetId: payload.campaignId,
    summary: `Set ad campaign ${payload.campaignId} to ${payload.status}.`,
    metadata: {
      notes: payload.notes,
    },
  });
}

export async function fetchPublicAds(payload: {
  placement: AdPlacement;
  city?: string;
}) {
  const campaigns = await fetchAdminAdCampaigns();
  return campaigns.filter((campaign) => {
    if (campaign.status !== "active") return false;
    if (campaign.placement !== payload.placement) return false;
    if (!payload.city) return true;
    if (!campaign.cityTargets.length) return true;
    return campaign.cityTargets.some(
      (city) => city.toLowerCase() === payload.city?.toLowerCase(),
    );
  });
}

export async function registerAdImpression(campaignId: string) {
  const database = getDb();
  await updateDoc(doc(database, "adCampaigns", campaignId), {
    impressions: increment(1),
    updatedAt: serverTimestamp(),
  });
}

export interface InvoiceRecord {
  id: string;
  ownerUid: string;
  ownerName: string;
  monthKey: string;
  lineItems: Array<{ label: string; amount: number; details: string }>;
  totalAmount: number;
  status: "generated" | "overdue" | "paid";
  dueAt: string;
  paidAt?: string;
  reminderCount: number;
  lastReminderAt?: string;
  lateFeeApplied: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BillingSettingsRecord {
  invoiceDueDays: number;
  lateFeeFlat: number;
  reminderIntervalDays: number;
  refundCaseFee: number;
  digitalProductMonthlyFee: number;
}

function monthKeyOf(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function mapInvoice(snapshotId: string, data: Record<string, unknown>) {
  const createdAt = toISODate(data.createdAt);
  const fallbackDueAt = new Date(
    Date.parse(createdAt) + 10 * 24 * 60 * 60 * 1000,
  ).toISOString();
  return {
    id: snapshotId,
    ownerUid: String(data.ownerUid ?? ""),
    ownerName: String(data.ownerName ?? "Business"),
    monthKey: String(data.monthKey ?? ""),
    lineItems:
      (data.lineItems as Array<{ label: string; amount: number; details: string }>) ?? [],
    totalAmount: Number(data.totalAmount ?? 0),
    status: (data.status as "generated" | "overdue" | "paid") ?? "generated",
    dueAt: data.dueAt ? String(data.dueAt) : fallbackDueAt,
    paidAt: data.paidAt ? toISODate(data.paidAt) : undefined,
    reminderCount: Number(data.reminderCount ?? 0),
    lastReminderAt: data.lastReminderAt ? toISODate(data.lastReminderAt) : undefined,
    lateFeeApplied: Boolean(data.lateFeeApplied),
    createdAt,
    updatedAt: toISODate(data.updatedAt),
  } satisfies InvoiceRecord;
}

const billingDefaults: BillingSettingsRecord = {
  invoiceDueDays: 10,
  lateFeeFlat: 199,
  reminderIntervalDays: 4,
  refundCaseFee: 49,
  digitalProductMonthlyFee: 25,
};

export async function fetchBillingSettings() {
  const database = getDb();
  const ref = doc(database, "platformSettings", "billing");
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    await setDoc(ref, {
      ...billingDefaults,
      updatedAt: serverTimestamp(),
    });
    return billingDefaults;
  }
  return {
    invoiceDueDays: Number(snapshot.data().invoiceDueDays ?? billingDefaults.invoiceDueDays),
    lateFeeFlat: Number(snapshot.data().lateFeeFlat ?? billingDefaults.lateFeeFlat),
    reminderIntervalDays: Number(
      snapshot.data().reminderIntervalDays ?? billingDefaults.reminderIntervalDays,
    ),
    refundCaseFee: Number(snapshot.data().refundCaseFee ?? billingDefaults.refundCaseFee),
    digitalProductMonthlyFee: Number(
      snapshot.data().digitalProductMonthlyFee ?? billingDefaults.digitalProductMonthlyFee,
    ),
  } satisfies BillingSettingsRecord;
}

export async function updateBillingSettings(payload: {
  adminUid: string;
  invoiceDueDays: number;
  lateFeeFlat: number;
  reminderIntervalDays: number;
  refundCaseFee: number;
  digitalProductMonthlyFee: number;
}) {
  const database = getDb();
  await setDoc(
    doc(database, "platformSettings", "billing"),
    {
      invoiceDueDays: Math.max(1, Math.round(payload.invoiceDueDays)),
      lateFeeFlat: Math.max(0, Math.round(payload.lateFeeFlat)),
      reminderIntervalDays: Math.max(1, Math.round(payload.reminderIntervalDays)),
      refundCaseFee: Math.max(0, Math.round(payload.refundCaseFee)),
      digitalProductMonthlyFee: Math.max(0, Math.round(payload.digitalProductMonthlyFee)),
      updatedBy: payload.adminUid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await recordAuditEvent({
    actorUid: payload.adminUid,
    actorRole: "admin",
    action: "billing_settings_update",
    targetType: "platform_settings",
    targetId: "billing",
    summary: "Updated billing settings.",
    metadata: {
      invoiceDueDays: payload.invoiceDueDays,
      lateFeeFlat: payload.lateFeeFlat,
      reminderIntervalDays: payload.reminderIntervalDays,
      refundCaseFee: payload.refundCaseFee,
      digitalProductMonthlyFee: payload.digitalProductMonthlyFee,
    },
  });
}

export async function fetchInvoicesByOwner(ownerUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "invoices"), where("ownerUid", "==", ownerUid), limit(120)),
  );
  return snapshots.docs
    .map((snapshot) => mapInvoice(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function fetchAdminInvoices() {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "invoices"), orderBy("createdAt", "desc"), limit(200)),
  );
  return snapshots.docs.map((snapshot) => mapInvoice(snapshot.id, snapshot.data()));
}

export async function adminMarkInvoicePaid(payload: { invoiceId: string; adminUid: string }) {
  const database = getDb();
  await updateDoc(doc(database, "invoices", payload.invoiceId), {
    status: "paid",
    paidBy: payload.adminUid,
    paidAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await recordAuditEvent({
    actorUid: payload.adminUid,
    actorRole: "admin",
    action: "invoice_paid",
    targetType: "invoice",
    targetId: payload.invoiceId,
    summary: `Marked invoice ${payload.invoiceId} as paid.`,
  });
}

export async function generateMonthlyInvoiceForBusiness(payload: {
  ownerUid: string;
  ownerName: string;
  monthKey?: string;
}) {
  const database = getDb();
  const monthKey = payload.monthKey ?? monthKeyOf(new Date());
  const billingSettings = await fetchBillingSettings();

  const existing = (await fetchInvoicesByOwner(payload.ownerUid)).find(
    (invoice) => invoice.monthKey === monthKey,
  );
  if (existing) {
    return existing.id;
  }

  const orders = await fetchOrdersByBusinessOwner(payload.ownerUid);
  const monthOrders = orders.filter((order) => order.createdAt.startsWith(monthKey));
  const grossSales = monthOrders
    .filter((order) => order.status === "paid" || order.status === "released")
    .reduce((sum, order) => sum + order.amount, 0);
  const salesCommission = Math.round(grossSales * 0.02);
  const refundedOrdersCount = monthOrders.filter((order) => order.status === "refunded").length;
  const refundCaseFee = refundedOrdersCount * billingSettings.refundCaseFee;

  const endpoints = await fetchNotificationEndpointsByOwner(payload.ownerUid);
  const notificationCharges = await fetchNotificationApiCharges();
  const totalMessages = endpoints.reduce((sum, endpoint) => sum + endpoint.sentCount, 0);
  const billedMessages = endpoints.reduce(
    (sum, endpoint) => sum + endpoint.billedSentCount,
    0,
  );
  const deltaMessages = Math.max(totalMessages - billedMessages, 0);
  const notificationUsageFee =
    deltaMessages > 0
      ? notificationCharges.monthlyBaseFee +
        Math.ceil(deltaMessages / 1000) * notificationCharges.per1000MessagesFee
      : 0;

  const adsSettings = await fetchAdPricingSettings();
  const adCampaigns = await fetchAdCampaignsByOwner(payload.ownerUid);
  const activeCampaigns = adCampaigns.filter((campaign) => campaign.status === "active");
  const unbilledImpressions = activeCampaigns.reduce(
    (sum, campaign) =>
      sum + Math.max(campaign.impressions - campaign.billedImpressions, 0),
    0,
  );
	  const adUsage = activeCampaigns.reduce((sum, campaign) => {
    const cpm =
      campaign.placement === "home_banner"
        ? adsSettings.homeBannerCpm
        : adsSettings.directoryBannerCpm;
    const campaignUnbilledImpressions = Math.max(
      campaign.impressions - campaign.billedImpressions,
      0,
    );
    const cityMultiplier =
      campaign.cityTargets.length > 0
        ? 1 + adsSettings.cityTargetingSurchargePercent / 100
        : 1;
    return (
      sum +
      Math.round(Math.ceil(campaignUnbilledImpressions / 1000) * cpm * cityMultiplier)
    );
	  }, 0);

  const products = await fetchDigitalProductsByOwner(payload.ownerUid);
  const digitalProductMonthlyFee = products.length
    ? billingSettings.digitalProductMonthlyFee
    : 0;

  const partnershipFeeSnapshots = await getDocs(
    query(
      collection(database, "partnershipFeeLedgers"),
      where("payerUid", "==", payload.ownerUid),
      limit(400),
    ),
  );
  const partnershipFeeRows = partnershipFeeSnapshots.docs
    .map((snapshot) => {
      const data = snapshot.data();
      return {
        id: snapshot.id,
        feeAmount: Number(data.feeAmount ?? 0),
        status: String(data.status ?? ""),
        billedInInvoiceId: data.billedInInvoiceId ? String(data.billedInInvoiceId) : "",
        createdAt: toISODate(data.createdAt),
      };
    })
    .filter(
      (row) =>
        row.status === "debited" &&
        !row.billedInInvoiceId &&
        row.createdAt.startsWith(monthKey),
    );
  const partnershipFeeCharge = partnershipFeeRows.reduce(
    (sum, row) => sum + row.feeAmount,
    0,
  );

  const withdrawalSnapshots = await getDocs(
    query(
      collection(database, "withdrawalRequests"),
      where("ownerUid", "==", payload.ownerUid),
      limit(300),
    ),
  );
  const unbilledWithdrawalRows = withdrawalSnapshots.docs
    .map((snapshot) => {
      const data = snapshot.data();
      const row = mapWithdrawalRecord(snapshot.id, data);
      return {
        ...row,
        billedInInvoiceId: data.billedInInvoiceId ? String(data.billedInInvoiceId) : "",
      };
    })
    .filter(
      (row) =>
        row.status === "approved" &&
        row.createdAt.startsWith(monthKey) &&
        !row.billedInInvoiceId,
    );
  const withdrawalFeeCharge = unbilledWithdrawalRows.reduce(
    (sum, row) => sum + row.feeAmount,
    0,
  );

  const lineItems = [
    {
      label: "Platform sales commission (2%)",
      amount: salesCommission,
      details: `Gross sales INR ${grossSales}`,
    },
    {
      label: "Digital product monthly fee",
      amount: digitalProductMonthlyFee,
      details: products.length
        ? `${products.length} active product(s)`
        : "No active products",
    },
    {
      label: "Notification API usage",
      amount: notificationUsageFee,
      details: `${deltaMessages} unbilled messages`,
    },
    {
      label: "Ads usage",
      amount: adUsage,
      details: `${unbilledImpressions} unbilled impressions`,
    },
    {
      label: "Partnership completion fee usage",
      amount: partnershipFeeCharge,
      details: `${partnershipFeeRows.length} unbilled partnership settlement(s)`,
    },
    {
      label: "Withdrawal processing charges",
      amount: withdrawalFeeCharge,
      details: `${unbilledWithdrawalRows.length} approved withdrawal(s)`,
    },
    {
      label: "Refund dispute processing",
      amount: refundCaseFee,
      details: `${refundedOrdersCount} refunded order(s)`,
    },
  ];

  const filteredLineItems = lineItems.filter((item) => item.amount > 0);
  const totalAmount = filteredLineItems.reduce((sum, item) => sum + item.amount, 0);
  const dueAt = new Date(
    Date.now() + billingSettings.invoiceDueDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const invoiceRef = await addDoc(collection(database, "invoices"), {
    ownerUid: payload.ownerUid,
    ownerName: payload.ownerName,
    monthKey,
    lineItems: filteredLineItems,
    totalAmount,
    status: "generated",
    dueAt,
    reminderCount: 0,
    lateFeeApplied: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  for (const endpoint of endpoints) {
    await updateDoc(doc(database, "notificationEndpoints", endpoint.id), {
      billedSentCount: endpoint.sentCount,
      updatedAt: serverTimestamp(),
    });
  }

  for (const campaign of activeCampaigns) {
    await updateDoc(doc(database, "adCampaigns", campaign.id), {
      billedImpressions: campaign.impressions,
      updatedAt: serverTimestamp(),
    });
  }

  for (const row of partnershipFeeRows) {
    await updateDoc(doc(database, "partnershipFeeLedgers", row.id), {
      billedInInvoiceId: invoiceRef.id,
      billedMonthKey: monthKey,
      updatedAt: serverTimestamp(),
    });
  }

  for (const row of unbilledWithdrawalRows) {
    await updateDoc(doc(database, "withdrawalRequests", row.id), {
      billedInInvoiceId: invoiceRef.id,
      billedMonthKey: monthKey,
      updatedAt: serverTimestamp(),
    });
  }

  await recordAuditEvent({
    actorUid: payload.ownerUid,
    actorRole: "business",
    action: "invoice_generated",
    targetType: "invoice",
    targetId: invoiceRef.id,
    summary: `Generated monthly invoice for ${monthKey}.`,
    metadata: {
      totalAmount,
      lineItems: filteredLineItems.length,
      dueAt,
    },
  });

  return invoiceRef.id;
}

export async function generateInvoicesForAllBusinesses(monthKey?: string) {
  const database = getDb();
  const businessRows = await getDocs(
    query(collection(database, "businessApplications"), limit(500)),
  );
  const owners = new Map<string, string>();
  for (const row of businessRows.docs) {
    const data = row.data();
    if (!data.ownerUid) continue;
    owners.set(String(data.ownerUid), String(data.businessName ?? "Business"));
  }

  const ids: string[] = [];
  for (const [ownerUid, ownerName] of owners.entries()) {
    ids.push(
      await generateMonthlyInvoiceForBusiness({
        ownerUid,
        ownerName,
        monthKey,
      }),
    );
  }
  return ids;
}

export async function runBillingMaintenance(payload: {
  adminUid: string;
  limit?: number;
}) {
  const database = getDb();
  const settings = await fetchBillingSettings();
  const invoices = (await fetchAdminInvoices()).slice(0, payload.limit ?? 500);
  const now = Date.now();
  const reminderIntervalMs = settings.reminderIntervalDays * 24 * 60 * 60 * 1000;

  let overdueMarked = 0;
  let lateFeesApplied = 0;
  let remindersSent = 0;

  for (const invoice of invoices) {
    if (invoice.status === "paid") continue;
    const dueAtMs = Date.parse(invoice.dueAt);
    const isOverdue = Number.isFinite(dueAtMs) && dueAtMs <= now;
    if (!isOverdue) continue;

    const updates: Record<string, unknown> = {};
    if (invoice.status !== "overdue") {
      updates.status = "overdue";
      overdueMarked += 1;
    }

    if (!invoice.lateFeeApplied && settings.lateFeeFlat > 0) {
      updates.lineItems = [
        ...invoice.lineItems,
        {
          label: "Late payment fee",
          amount: settings.lateFeeFlat,
          details: `Applied after due date ${new Date(invoice.dueAt).toLocaleDateString()}`,
        },
      ];
      updates.totalAmount = invoice.totalAmount + settings.lateFeeFlat;
      updates.lateFeeApplied = true;
      lateFeesApplied += 1;
    }

    const lastReminderAt = invoice.lastReminderAt ? Date.parse(invoice.lastReminderAt) : 0;
    const shouldSendReminder =
      invoice.reminderCount === 0 ||
      !Number.isFinite(lastReminderAt) ||
      now - lastReminderAt >= reminderIntervalMs;

    if (shouldSendReminder) {
      await addDoc(collection(database, "users", invoice.ownerUid, "notifications"), {
        endpointId: "system-billing",
        ownerUid: "system",
        category: "emergency",
        title: `Invoice overdue: ${invoice.monthKey}`,
        message: `Your invoice ${invoice.id} is overdue. Current due amount INR ${
          Number(updates.totalAmount ?? invoice.totalAmount)
        }.`,
        isSpam: false,
        createdAt: serverTimestamp(),
      });
      updates.reminderCount = invoice.reminderCount + 1;
      updates.lastReminderAt = serverTimestamp();
      remindersSent += 1;
    }

    if (Object.keys(updates).length) {
      await updateDoc(doc(database, "invoices", invoice.id), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
    }
  }

  await recordAuditEvent({
    actorUid: payload.adminUid,
    actorRole: "admin",
    action: "billing_maintenance_run",
    targetType: "invoice_batch",
    targetId: "batch",
    summary: "Ran billing maintenance for overdue invoices.",
    metadata: {
      scannedInvoices: invoices.length,
      overdueMarked,
      lateFeesApplied,
      remindersSent,
    },
  });

  return {
    scannedInvoices: invoices.length,
    overdueMarked,
    lateFeesApplied,
    remindersSent,
  };
}

function csvEscape(value: string | number | boolean | null | undefined) {
  const text =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function monthFilter<T extends { createdAt: string }>(rows: T[], monthKey?: string) {
  if (!monthKey) return rows;
  return rows.filter((row) => row.createdAt.startsWith(monthKey));
}

export async function buildReconciliationReport(monthKey?: string) {
  const [orders, invoices, withdrawals, audits, payouts] = await Promise.all([
    fetchAdminOrders(),
    fetchAdminInvoices(),
    fetchAdminWithdrawalRequests(),
    fetchAuditEvents(800),
    fetchAdminPayouts(),
  ]);

  const paymentIntentsSnapshots = await getDocs(
    query(collection(getDb(), "paymentIntents"), orderBy("createdAt", "desc"), limit(600)),
  );
  const paymentIntents = paymentIntentsSnapshots.docs.map((snapshot) =>
    mapPaymentIntent(snapshot.id, snapshot.data()),
  );

  const filteredOrders = monthFilter(orders, monthKey);
  const filteredInvoices = monthFilter(invoices, monthKey);
  const filteredWithdrawals = monthFilter(withdrawals, monthKey);
  const filteredAudits = monthFilter(audits, monthKey);
  const filteredPayouts = monthFilter(payouts, monthKey);
  const filteredPaymentIntents = monthFilter(paymentIntents, monthKey);

  return {
    generatedAt: new Date().toISOString(),
    monthKey: monthKey ?? "all",
    summary: {
      ordersCount: filteredOrders.length,
      paidOrderValue: filteredOrders
        .filter((row) => row.status === "paid" || row.status === "released")
        .reduce((sum, row) => sum + row.amount, 0),
      refundedOrderValue: filteredOrders
        .filter((row) => row.status === "refunded")
        .reduce((sum, row) => sum + row.amount, 0),
      invoicesCount: filteredInvoices.length,
      invoiceTotal: filteredInvoices.reduce((sum, row) => sum + row.totalAmount, 0),
      unpaidInvoiceTotal: filteredInvoices
        .filter((row) => row.status !== "paid")
        .reduce((sum, row) => sum + row.totalAmount, 0),
      withdrawalsCount: filteredWithdrawals.length,
      withdrawalNetTotal: filteredWithdrawals.reduce((sum, row) => sum + row.netAmount, 0),
      payoutsCount: filteredPayouts.length,
      payoutSuccessTotal: filteredPayouts
        .filter((row) => row.status === "success")
        .reduce((sum, row) => sum + row.amount, 0),
      paymentIntentsCount: filteredPaymentIntents.length,
      paymentPaidTotal: filteredPaymentIntents
        .filter((row) => row.status === "paid")
        .reduce((sum, row) => sum + row.amount, 0),
      auditEventsCount: filteredAudits.length,
    },
    orders: filteredOrders,
    invoices: filteredInvoices,
    withdrawals: filteredWithdrawals,
    payouts: filteredPayouts,
    paymentIntents: filteredPaymentIntents,
    auditEvents: filteredAudits,
  };
}

export async function buildReconciliationCsv(monthKey?: string) {
  const report = await buildReconciliationReport(monthKey);
  const lines: string[] = [];
  lines.push("section,id,created_at,status,amount,primary_ref,secondary_ref,details");

  for (const row of report.orders) {
    lines.push(
      [
        "order",
        row.id,
        row.createdAt,
        row.status,
        row.amount,
        row.productSlug,
        row.customerUid,
        row.productTitle,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  for (const row of report.invoices) {
    lines.push(
      [
        "invoice",
        row.id,
        row.createdAt,
        row.status,
        row.totalAmount,
        row.ownerUid,
        row.monthKey,
        `due:${row.dueAt};reminders:${row.reminderCount}`,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  for (const row of report.withdrawals) {
    lines.push(
      [
        "withdrawal",
        row.id,
        row.createdAt,
        row.status,
        row.netAmount,
        row.ownerUid,
        row.method,
        `payout:${row.payoutStatus ?? "n/a"}`,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  for (const row of report.payouts) {
    lines.push(
      [
        "payout",
        row.id,
        row.createdAt,
        row.status,
        row.amount,
        row.ownerUid,
        row.withdrawalRequestId,
        row.providerPayoutId ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  for (const row of report.paymentIntents) {
    lines.push(
      [
        "payment_intent",
        row.id,
        row.createdAt,
        row.status,
        row.amount,
        row.ownerUid,
        row.purpose,
        row.providerPaymentId ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  return lines.join("\n");
}

export async function importGeoCatalogSeed(payload: {
  adminUid: string;
  source?: string;
  seed?: Record<string, string[]>;
}) {
  const database = getDb();
  const seed = payload.seed ?? LOCATION_CATALOG;
  const normalizedCountries = Object.entries(seed)
    .map(([country, cities]) => {
      const dedupedCities = [...new Set(cities.map((city) => city.trim()).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b),
      );
      return {
        country: country.trim(),
        cities: dedupedCities,
      };
    })
    .filter((row) => row.country && row.cities.length);

  const batch = writeBatch(database);
  let totalCities = 0;
  for (const row of normalizedCountries) {
    totalCities += row.cities.length;
    const ref = doc(database, "geoCatalogCountries", toSlug(row.country));
    batch.set(
      ref,
      {
        country: row.country,
        cities: row.cities,
        citiesCount: row.cities.length,
        source: payload.source ?? "seed",
        updatedBy: payload.adminUid,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }
  const summaryRef = doc(database, "platformSettings", "geoCatalog");
  batch.set(
    summaryRef,
    {
      countriesCount: normalizedCountries.length,
      citiesCount: totalCities,
      source: payload.source ?? "seed",
      updatedBy: payload.adminUid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await batch.commit();

  await recordAuditEvent({
    actorUid: payload.adminUid,
    actorRole: "admin",
    action: "geo_catalog_import",
    targetType: "geo_catalog",
    targetId: "global",
    summary: `Imported geo catalog with ${normalizedCountries.length} countries and ${totalCities} cities.`,
    metadata: {
      source: payload.source ?? "seed",
    },
  });

  return {
    countries: normalizedCountries.length,
    cities: totalCities,
  };
}

export async function fetchGeoCatalogSummary() {
  const database = getDb();
  const snapshot = await getDoc(doc(database, "platformSettings", "geoCatalog"));
  if (!snapshot.exists()) {
    return {
      countries: Object.keys(LOCATION_CATALOG).length,
      cities: Object.values(LOCATION_CATALOG).reduce((sum, rows) => sum + rows.length, 0),
    } satisfies GeoCatalogSummaryRecord;
  }
  return {
    countries: Number(snapshot.data().countriesCount ?? 0),
    cities: Number(snapshot.data().citiesCount ?? 0),
    updatedAt: snapshot.data().updatedAt ? toISODate(snapshot.data().updatedAt) : undefined,
  } satisfies GeoCatalogSummaryRecord;
}

export async function fetchGeoCatalogCountries() {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "geoCatalogCountries"), orderBy("country", "asc"), limit(400)),
  );
  if (!snapshots.docs.length) {
    return Object.keys(LOCATION_CATALOG).sort((a, b) => a.localeCompare(b));
  }
  return snapshots.docs.map((snapshot) => String(snapshot.data().country ?? ""));
}

export async function fetchGeoCatalogCitiesByCountry(country: string) {
  const database = getDb();
  const snapshot = await getDoc(doc(database, "geoCatalogCountries", toSlug(country)));
  if (!snapshot.exists()) {
    return [...(LOCATION_CATALOG[country] ?? [])].sort((a, b) => a.localeCompare(b));
  }
  return ((snapshot.data().cities as string[]) ?? []).sort((a, b) => a.localeCompare(b));
}

export interface MembershipEconomicsSettings {
  customerMonthlyPrice: number;
  customerYearlyPrice: number;
  minimumDiscountPercent: number;
  businessSharePercent: number;
  cycleReservePercent: number;
  distributionCycleMonths: number;
  offlineMinTransactions: number;
  onlineMinTransactions: number;
  minTransactionValue: number;
  minimumMonthlyPayout: number;
  maxShareCapPercent: number;
  maxEligibleGrossValuePerBusiness: number;
  monthlyEligibleGrossCap: number;
}

const membershipEconomicsDefaults: MembershipEconomicsSettings = {
  customerMonthlyPrice: 199,
  customerYearlyPrice: 1990,
  minimumDiscountPercent: 10,
  businessSharePercent: 40,
  cycleReservePercent: 5,
  distributionCycleMonths: 4,
  offlineMinTransactions: 100,
  onlineMinTransactions: 250,
  minTransactionValue: 500,
  minimumMonthlyPayout: 500,
  maxShareCapPercent: 12,
  maxEligibleGrossValuePerBusiness: 10_000_000,
  monthlyEligibleGrossCap: 5_000_000,
};

function parseMonthKey(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) {
    throw new Error(`Invalid month key "${monthKey}". Use YYYY-MM format.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month key "${monthKey}". Month must be between 01 and 12.`);
  }
  return { year, month };
}

function monthKeyFromISO(isoValue: string) {
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
}

function listMonthKeysInRange(startMonthKey: string, endMonthKey: string) {
  const start = parseMonthKey(startMonthKey);
  const end = parseMonthKey(endMonthKey);
  const startValue = start.year * 100 + start.month;
  const endValue = end.year * 100 + end.month;
  if (startValue > endValue) {
    throw new Error("Start month must be less than or equal to end month.");
  }

  const output: string[] = [];
  let year = start.year;
  let month = start.month;
  while (year * 100 + month <= endValue) {
    output.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return output;
}

function inMonthRange(isoValue: string, startMonthKey: string, endMonthKey: string) {
  const rowMonth = monthKeyFromISO(isoValue);
  if (!rowMonth) return false;
  return rowMonth >= startMonthKey && rowMonth <= endMonthKey;
}

export async function registerMembershipApiUsage(payload: {
  businessOwnerUid: string;
  endpoint: "discount_validate" | "transaction_ingest" | "distribution_cron";
  limit: number;
  windowMinutes: number;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}) {
  const database = getDb();
  const safeLimit = Math.max(Math.floor(payload.limit), 1);
  const safeWindowMinutes = Math.max(Math.floor(payload.windowMinutes), 1);
  const windowMs = safeWindowMinutes * 60 * 1000;
  const now = Date.now();
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs).toISOString();
  const windowId = windowStart.replace(/[^0-9]/g, "").slice(0, 12);
  const bucketId = `${payload.businessOwnerUid}_${payload.endpoint}_${windowId}`;
  const bucketRef = doc(database, "membershipApiUsageBuckets", bucketId);
  const snapshot = await getDoc(bucketRef);
  const currentCount = snapshot.exists() ? Number(snapshot.data().count ?? 0) : 0;

  if (currentCount >= safeLimit) {
    throw new Error(
      `Rate limit exceeded for ${payload.endpoint}. Try again after ${new Date(
        windowStartMs + windowMs,
      ).toISOString()}.`,
    );
  }

  const metadata = Object.fromEntries(
    Object.entries(payload.metadata ?? {}).filter(([, value]) => value !== undefined),
  );

  if (snapshot.exists()) {
    await updateDoc(bucketRef, {
      count: increment(1),
      lastUsedAt: serverTimestamp(),
      metadata,
    });
  } else {
    await setDoc(bucketRef, {
      businessOwnerUid: payload.businessOwnerUid,
      endpoint: payload.endpoint,
      windowStart,
      windowMinutes: safeWindowMinutes,
      count: 1,
      metadata,
      createdAt: serverTimestamp(),
      lastUsedAt: serverTimestamp(),
    });
  }

  return {
    limit: safeLimit,
    used: currentCount + 1,
    remaining: Math.max(safeLimit - (currentCount + 1), 0),
    windowStart,
    windowEnd: new Date(windowStartMs + windowMs).toISOString(),
  };
}

export async function fetchMembershipEconomicsSettings() {
  const database = getDb();
  const ref = doc(database, "platformSettings", "membershipEconomics");
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    await setDoc(ref, {
      ...membershipEconomicsDefaults,
      updatedAt: serverTimestamp(),
    });
    return membershipEconomicsDefaults;
  }
  return {
    customerMonthlyPrice: Number(
      snapshot.data().customerMonthlyPrice ?? membershipEconomicsDefaults.customerMonthlyPrice,
    ),
    customerYearlyPrice: Number(
      snapshot.data().customerYearlyPrice ?? membershipEconomicsDefaults.customerYearlyPrice,
    ),
    minimumDiscountPercent: Number(
      snapshot.data().minimumDiscountPercent ?? membershipEconomicsDefaults.minimumDiscountPercent,
    ),
    businessSharePercent: Number(
      snapshot.data().businessSharePercent ?? membershipEconomicsDefaults.businessSharePercent,
    ),
    cycleReservePercent: Number(
      snapshot.data().cycleReservePercent ?? membershipEconomicsDefaults.cycleReservePercent,
    ),
    distributionCycleMonths: Number(
      snapshot.data().distributionCycleMonths ??
        membershipEconomicsDefaults.distributionCycleMonths,
    ),
    offlineMinTransactions: Number(
      snapshot.data().offlineMinTransactions ??
        membershipEconomicsDefaults.offlineMinTransactions,
    ),
    onlineMinTransactions: Number(
      snapshot.data().onlineMinTransactions ?? membershipEconomicsDefaults.onlineMinTransactions,
    ),
    minTransactionValue: Number(
      snapshot.data().minTransactionValue ?? membershipEconomicsDefaults.minTransactionValue,
    ),
    minimumMonthlyPayout: Number(
      snapshot.data().minimumMonthlyPayout ?? membershipEconomicsDefaults.minimumMonthlyPayout,
    ),
    maxShareCapPercent: Number(
      snapshot.data().maxShareCapPercent ?? membershipEconomicsDefaults.maxShareCapPercent,
    ),
    maxEligibleGrossValuePerBusiness: Number(
      snapshot.data().maxEligibleGrossValuePerBusiness ??
        membershipEconomicsDefaults.maxEligibleGrossValuePerBusiness,
    ),
    monthlyEligibleGrossCap: Number(
      snapshot.data().monthlyEligibleGrossCap ??
        membershipEconomicsDefaults.monthlyEligibleGrossCap,
    ),
  } satisfies MembershipEconomicsSettings;
}

export async function updateMembershipEconomicsSettings(payload: {
  adminUid: string;
  settings: MembershipEconomicsSettings;
}) {
  const database = getDb();
  await setDoc(
    doc(database, "platformSettings", "membershipEconomics"),
    {
      ...payload.settings,
      updatedBy: payload.adminUid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export interface VerifierCustomerMembershipRecord {
  id: string;
  customerUid: string;
  customerName: string;
  customerEmail: string;
  customerPublicId: string;
  status: "active" | "expired";
  memberCode: string;
  activeFrom: string;
  activeUntil: string;
  lastPurchaseCycle: "monthly" | "yearly";
  updatedAt: string;
  createdAt: string;
}

export interface VerifierMembershipPurchaseRecord {
  id: string;
  customerUid: string;
  customerName: string;
  customerPublicId: string;
  billingCycle: "monthly" | "yearly";
  amount: number;
  startsAt: string;
  activeUntil: string;
  createdAt: string;
}

function mapVerifierCustomerMembership(
  snapshotId: string,
  data: Record<string, unknown>,
) {
  const activeUntil = String(data.activeUntil ?? new Date().toISOString());
  const status = new Date(activeUntil) > new Date() ? "active" : "expired";
  return {
    id: snapshotId,
    customerUid: String(data.customerUid ?? ""),
    customerName: String(data.customerName ?? "Customer"),
    customerEmail: String(data.customerEmail ?? ""),
    customerPublicId: String(data.customerPublicId ?? ""),
    status,
    memberCode: String(data.memberCode ?? ""),
    activeFrom: String(data.activeFrom ?? new Date().toISOString()),
    activeUntil,
    lastPurchaseCycle: (data.lastPurchaseCycle as "monthly" | "yearly") ?? "monthly",
    updatedAt: toISODate(data.updatedAt),
    createdAt: toISODate(data.createdAt),
  } satisfies VerifierCustomerMembershipRecord;
}

function mapMembershipPurchase(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    customerUid: String(data.customerUid ?? ""),
    customerName: String(data.customerName ?? "Customer"),
    customerPublicId: String(data.customerPublicId ?? ""),
    billingCycle: (data.billingCycle as "monthly" | "yearly") ?? "monthly",
    amount: Number(data.amount ?? 0),
    startsAt: String(data.startsAt ?? new Date().toISOString()),
    activeUntil: String(data.activeUntil ?? new Date().toISOString()),
    createdAt: toISODate(data.createdAt),
  } satisfies VerifierMembershipPurchaseRecord;
}

async function fetchCustomerPublicId(customerUid: string) {
  const database = getDb();
  const userSnapshot = await getDoc(doc(database, "users", customerUid));
  if (!userSnapshot.exists()) {
    throw new Error("Customer profile not found.");
  }
  return String(userSnapshot.data().publicId ?? `BVU-${customerUid.slice(0, 8).toUpperCase()}`);
}

export async function fetchVerifierCustomerMembership(customerUid: string) {
  const database = getDb();
  const snapshot = await getDoc(doc(database, "verifierCustomerMemberships", customerUid));
  if (!snapshot.exists()) return null;
  return mapVerifierCustomerMembership(snapshot.id, snapshot.data());
}

export async function fetchVerifierMembershipPurchasesByCustomer(customerUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "membershipPurchases"),
      where("customerUid", "==", customerUid),
      limit(240),
    ),
  );
  return snapshots.docs
    .map((snapshot) => mapMembershipPurchase(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function purchaseVerifierCustomerMembership(payload: {
  customerUid: string;
  customerName: string;
  customerEmail: string;
  billingCycle: "monthly" | "yearly";
}) {
  const database = getDb();
  const settings = await fetchMembershipEconomicsSettings();
  const amount =
    payload.billingCycle === "monthly"
      ? settings.customerMonthlyPrice
      : settings.customerYearlyPrice;
  const extendMonths = payload.billingCycle === "monthly" ? 1 : 12;

  const membershipRef = doc(database, "verifierCustomerMemberships", payload.customerUid);
  const existingSnapshot = await getDoc(membershipRef);
  const existing = existingSnapshot.exists()
    ? mapVerifierCustomerMembership(existingSnapshot.id, existingSnapshot.data())
    : null;
  const now = new Date();
  const startsAt =
    existing && new Date(existing.activeUntil) > now ? new Date(existing.activeUntil) : now;
  const activeUntil = new Date(startsAt);
  activeUntil.setUTCMonth(activeUntil.getUTCMonth() + extendMonths);
  const customerPublicId = await fetchCustomerPublicId(payload.customerUid);

  await debitWalletBalance({
    ownerUid: payload.customerUid,
    amount,
    reason: `Verifier customer membership (${payload.billingCycle})`,
    type: "membership_purchase_debit",
    referenceId: payload.customerUid,
  });

  await setDoc(
    membershipRef,
    {
      customerUid: payload.customerUid,
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      customerPublicId,
      memberCode: existing?.memberCode ?? `VVC-${payload.customerUid.slice(0, 8).toUpperCase()}`,
      activeFrom: startsAt.toISOString(),
      activeUntil: activeUntil.toISOString(),
      lastPurchaseCycle: payload.billingCycle,
      updatedAt: serverTimestamp(),
      createdAt: existingSnapshot.exists() ? existingSnapshot.data().createdAt : serverTimestamp(),
    },
    { merge: true },
  );

  await addDoc(collection(database, "membershipPurchases"), {
    customerUid: payload.customerUid,
    customerName: payload.customerName,
    customerPublicId,
    billingCycle: payload.billingCycle,
    amount,
    startsAt: startsAt.toISOString(),
    activeUntil: activeUntil.toISOString(),
    createdAt: serverTimestamp(),
  });

  await setDoc(
    doc(database, "users", payload.customerUid),
    {
      verifierCustomerMembershipStatus: "active",
      verifierCustomerMembershipActiveUntil: activeUntil.toISOString(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return {
    amount,
    activeUntil: activeUntil.toISOString(),
  };
}

export interface MembershipBusinessProgramRecord {
  id: string;
  ownerUid: string;
  ownerName: string;
  businessMode: "online" | "offline" | "hybrid";
  discountPercent: number;
  status: "active" | "paused";
  integrationApiKey: string;
  sharePercent: number;
  totalPayoutReceived: number;
  lastCycleKey?: string;
  createdAt: string;
  updatedAt: string;
}

function mapMembershipBusinessProgram(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    ownerUid: String(data.ownerUid ?? ""),
    ownerName: String(data.ownerName ?? "Business"),
    businessMode: (data.businessMode as "online" | "offline" | "hybrid") ?? "online",
    discountPercent: Number(data.discountPercent ?? 10),
    status: (data.status as "active" | "paused") ?? "active",
    integrationApiKey: String(data.integrationApiKey ?? ""),
    sharePercent: Number(data.sharePercent ?? 40),
    totalPayoutReceived: Number(data.totalPayoutReceived ?? 0),
    lastCycleKey: data.lastCycleKey ? String(data.lastCycleKey) : undefined,
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
  } satisfies MembershipBusinessProgramRecord;
}

function createMembershipApiKey(ownerUid: string) {
  return `mapi_${ownerUid.slice(0, 6)}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export async function fetchMembershipBusinessProgram(ownerUid: string) {
  const database = getDb();
  const snapshot = await getDoc(doc(database, "membershipBusinessPrograms", ownerUid));
  if (!snapshot.exists()) return null;
  return mapMembershipBusinessProgram(snapshot.id, snapshot.data());
}

export async function upsertMembershipBusinessProgram(payload: {
  ownerUid: string;
  ownerName: string;
  businessMode: "online" | "offline" | "hybrid";
  discountPercent: number;
}) {
  const database = getDb();
  const canParticipate = await userCanCreateBusinessGroup(payload.ownerUid);
  if (!canParticipate) {
    throw new Error("Only verified business users can join membership program.");
  }
  const settings = await fetchMembershipEconomicsSettings();
  if (payload.discountPercent < settings.minimumDiscountPercent) {
    throw new Error(
      `Discount percent must be at least ${settings.minimumDiscountPercent}% for membership.`,
    );
  }

  const existing = await fetchMembershipBusinessProgram(payload.ownerUid);
  const ref = doc(database, "membershipBusinessPrograms", payload.ownerUid);
  if (existing) {
    await updateDoc(ref, {
      ownerName: payload.ownerName,
      businessMode: payload.businessMode,
      discountPercent: payload.discountPercent,
      sharePercent: settings.businessSharePercent,
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(ref, {
      ownerUid: payload.ownerUid,
      ownerName: payload.ownerName,
      businessMode: payload.businessMode,
      discountPercent: payload.discountPercent,
      status: "active",
      integrationApiKey: createMembershipApiKey(payload.ownerUid),
      sharePercent: settings.businessSharePercent,
      totalPayoutReceived: 0,
      lastCycleKey: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  const nextSnapshot = await getDoc(ref);
  return mapMembershipBusinessProgram(nextSnapshot.id, nextSnapshot.data() ?? {});
}

export async function rotateMembershipBusinessApiKey(ownerUid: string) {
  const database = getDb();
  const existing = await fetchMembershipBusinessProgram(ownerUid);
  if (!existing) throw new Error("Business membership program is not configured.");
  const integrationApiKey = createMembershipApiKey(ownerUid);
  await updateDoc(doc(database, "membershipBusinessPrograms", ownerUid), {
    integrationApiKey,
    updatedAt: serverTimestamp(),
  });
  return integrationApiKey;
}

export async function setMembershipBusinessProgramStatus(payload: {
  ownerUid: string;
  adminUid: string;
  status: "active" | "paused";
}) {
  const database = getDb();
  await updateDoc(doc(database, "membershipBusinessPrograms", payload.ownerUid), {
    status: payload.status,
    reviewedBy: payload.adminUid,
    updatedAt: serverTimestamp(),
  });
}

export async function fetchAdminMembershipPrograms() {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "membershipBusinessPrograms"), limit(400)),
  );
  return snapshots.docs
    .map((snapshot) => mapMembershipBusinessProgram(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export interface MembershipDiscountCheckResult {
  businessOwnerUid: string;
  customerUid?: string;
  customerPublicId: string;
  isMembershipActive: boolean;
  discountPercent: number;
  discountAmount: number;
  finalAmount: number;
  minimumDiscountPercent: number;
}

export async function validateVerifierMembershipDiscount(payload: {
  businessOwnerUid: string;
  integrationApiKey: string;
  customerPublicId: string;
  transactionValue: number;
  source: "online" | "offline";
  externalOrderId?: string;
}) {
  if (payload.transactionValue <= 0) {
    throw new Error("Transaction value must be greater than zero.");
  }

  const database = getDb();
  const settings = await fetchMembershipEconomicsSettings();
  const program = await fetchMembershipBusinessProgram(payload.businessOwnerUid);
  if (!program) {
    throw new Error("Business has not configured membership participation yet.");
  }
  if (program.status !== "active") {
    throw new Error("Business membership participation is not active.");
  }
  if (program.integrationApiKey !== payload.integrationApiKey.trim()) {
    throw new Error("Invalid integration API key.");
  }

  const normalizedPublicId = payload.customerPublicId.trim();
  const customerUid =
    (await getUserUidByPublicId(normalizedPublicId)) ??
    (await getUserUidByPublicId(normalizedPublicId.toUpperCase()));
  const membership = customerUid
    ? await fetchVerifierCustomerMembership(customerUid)
    : null;
  const isMembershipActive = Boolean(
    membership && new Date(membership.activeUntil) > new Date(),
  );
  const discountPercent = isMembershipActive
    ? Math.max(program.discountPercent, settings.minimumDiscountPercent)
    : 0;
  const discountAmount = Math.round((payload.transactionValue * discountPercent) / 100);
  const finalAmount = Math.max(payload.transactionValue - discountAmount, 0);

  await addDoc(collection(database, "membershipDiscountChecks"), {
    businessOwnerUid: payload.businessOwnerUid,
    customerUid: customerUid ?? null,
    customerPublicId: normalizedPublicId,
    source: payload.source,
    externalOrderId: payload.externalOrderId ?? null,
    transactionValue: payload.transactionValue,
    isMembershipActive,
    discountPercent,
    discountAmount,
    finalAmount,
    createdAt: serverTimestamp(),
  });

  return {
    businessOwnerUid: payload.businessOwnerUid,
    customerUid: customerUid ?? undefined,
    customerPublicId: normalizedPublicId,
    isMembershipActive,
    discountPercent,
    discountAmount,
    finalAmount,
    minimumDiscountPercent: settings.minimumDiscountPercent,
  } satisfies MembershipDiscountCheckResult;
}

export interface MembershipBusinessTransactionRecord {
  id: string;
  businessOwnerUid: string;
  source: "online" | "offline";
  externalOrderId: string;
  customerUid?: string;
  customerPublicId?: string;
  transactionValue: number;
  membershipApplied: boolean;
  eligibleForScoring: boolean;
  ineligibilityReason?: string;
  occurredAt: string;
  createdAt: string;
}

function mapMembershipBusinessTransaction(
  snapshotId: string,
  data: Record<string, unknown>,
) {
  return {
    id: snapshotId,
    businessOwnerUid: String(data.businessOwnerUid ?? ""),
    source: (data.source as "online" | "offline") ?? "online",
    externalOrderId: String(data.externalOrderId ?? ""),
    customerUid: data.customerUid ? String(data.customerUid) : undefined,
    customerPublicId: data.customerPublicId ? String(data.customerPublicId) : undefined,
    transactionValue: Number(data.transactionValue ?? 0),
    membershipApplied: Boolean(data.membershipApplied),
    eligibleForScoring: Boolean(data.eligibleForScoring),
    ineligibilityReason: data.ineligibilityReason
      ? String(data.ineligibilityReason)
      : undefined,
    occurredAt: String(data.occurredAt ?? new Date().toISOString()),
    createdAt: toISODate(data.createdAt),
  } satisfies MembershipBusinessTransactionRecord;
}

export async function createMembershipBusinessTransaction(payload: {
  businessOwnerUid: string;
  source: "online" | "offline";
  externalOrderId: string;
  transactionValue: number;
  customerPublicId?: string;
  occurredAt?: string;
}) {
  if (payload.transactionValue <= 0) {
    throw new Error("Transaction value must be greater than zero.");
  }
  if (!payload.externalOrderId.trim()) {
    throw new Error("External order/reference ID is required.");
  }

  const database = getDb();
  const normalizedExternalOrderId = payload.externalOrderId.trim();
  const settings = await fetchMembershipEconomicsSettings();
  const program = await fetchMembershipBusinessProgram(payload.businessOwnerUid);
  if (!program || program.status !== "active") {
    throw new Error("Membership business program is not active for this user.");
  }

  const existingRows = await getDocs(
    query(
      collection(database, "membershipTransactions"),
      where("businessOwnerUid", "==", payload.businessOwnerUid),
      limit(2000),
    ),
  );
  const hasDuplicateOrder = existingRows.docs.some((row) => {
    const data = row.data();
    const rowOrderId = String(data.externalOrderId ?? "").toLowerCase();
    const rowSource = String(data.source ?? "");
    return (
      rowSource === payload.source &&
      rowOrderId === normalizedExternalOrderId.toLowerCase()
    );
  });
  if (hasDuplicateOrder) {
    throw new Error(
      `Transaction reference "${normalizedExternalOrderId}" is already logged for ${payload.source}.`,
    );
  }

  const normalizedPublicId = payload.customerPublicId?.trim();
  const customerUid = normalizedPublicId
    ? ((await getUserUidByPublicId(normalizedPublicId)) ??
      (await getUserUidByPublicId(normalizedPublicId.toUpperCase())))
    : null;
  const membership = customerUid
    ? await fetchVerifierCustomerMembership(customerUid)
    : null;
  const membershipApplied = Boolean(
    membership && new Date(membership.activeUntil) > new Date(),
  );

  const eligibleForScoring = payload.transactionValue >= settings.minTransactionValue;
  const ineligibilityReason = eligibleForScoring
    ? null
    : `Transaction below minimum value INR ${settings.minTransactionValue}`;
  const occurredAt = payload.occurredAt ? new Date(payload.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    throw new Error("Invalid occurred date.");
  }

  const ref = await addDoc(collection(database, "membershipTransactions"), {
    businessOwnerUid: payload.businessOwnerUid,
    source: payload.source,
    externalOrderId: normalizedExternalOrderId,
    customerUid,
    customerPublicId: normalizedPublicId ?? null,
    transactionValue: payload.transactionValue,
    membershipApplied,
    eligibleForScoring,
    ineligibilityReason,
    occurredAt: occurredAt.toISOString(),
    createdAt: serverTimestamp(),
  });

  return ref.id;
}

export async function bulkCreateMembershipBusinessTransactions(payload: {
  businessOwnerUid: string;
  source: "online" | "offline";
  rows: Array<{
    externalOrderId: string;
    transactionValue: number;
    customerPublicId?: string;
    occurredAt?: string;
  }>;
}) {
  const successes: string[] = [];
  const failures: Array<{ externalOrderId: string; reason: string }> = [];
  for (const row of payload.rows) {
    try {
      const id = await createMembershipBusinessTransaction({
        businessOwnerUid: payload.businessOwnerUid,
        source: payload.source,
        externalOrderId: row.externalOrderId,
        transactionValue: row.transactionValue,
        customerPublicId: row.customerPublicId,
        occurredAt: row.occurredAt,
      });
      successes.push(id);
    } catch (error) {
      failures.push({
        externalOrderId: row.externalOrderId,
        reason: error instanceof Error ? error.message : "Unknown import error",
      });
    }
  }
  return {
    successCount: successes.length,
    failureCount: failures.length,
    createdIds: successes,
    failures,
  };
}

export async function fetchMembershipTransactionsByBusiness(
  ownerUid: string,
  monthKey?: string,
) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "membershipTransactions"),
      where("businessOwnerUid", "==", ownerUid),
      limit(2000),
    ),
  );
  const rows = snapshots.docs
    .map((snapshot) => mapMembershipBusinessTransaction(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  if (!monthKey) return rows;
  return rows.filter((row) => monthKeyFromISO(row.occurredAt) === monthKey);
}

export async function fetchAdminMembershipTransactions(monthKey?: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "membershipTransactions"), limit(2500)),
  );
  const rows = snapshots.docs
    .map((snapshot) => mapMembershipBusinessTransaction(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  if (!monthKey) return rows;
  return rows.filter((row) => monthKeyFromISO(row.occurredAt) === monthKey);
}

export interface MembershipMonthlyEligibilityRecord {
  monthKey: string;
  onlineTransactions: number;
  offlineTransactions: number;
  eligibleTransactions: number;
  eligibleGrossValue: number;
  isEligible: boolean;
  reasons: string[];
}

export interface MembershipBusinessCycleReportRecord {
  id: string;
  cycleId: string;
  cycleKey: string;
  ownerUid: string;
  ownerName: string;
  eligibleTransactions: number;
  eligibleGrossValue: number;
  score: number;
  payoutAmount: number;
  isEligible: boolean;
  missedReasons: string[];
  monthlyBreakdown: MembershipMonthlyEligibilityRecord[];
  createdAt: string;
}

export interface MembershipDistributionCycleRecord {
  id: string;
  cycleKey: string;
  startMonthKey: string;
  endMonthKey: string;
  monthKeys: string[];
  totalMembershipRevenue: number;
  businessSharePool: number;
  reserveAmount: number;
  distributablePool: number;
  distributedAmount: number;
  unallocatedAmount: number;
  status: "completed" | "no_eligible_businesses";
  participantsCount: number;
  eligibleBusinessesCount: number;
  createdBy: string;
  createdAt: string;
}

function mapMembershipDistributionCycle(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    cycleKey: String(data.cycleKey ?? snapshotId),
    startMonthKey: String(data.startMonthKey ?? ""),
    endMonthKey: String(data.endMonthKey ?? ""),
    monthKeys: (data.monthKeys as string[]) ?? [],
    totalMembershipRevenue: Number(data.totalMembershipRevenue ?? 0),
    businessSharePool: Number(data.businessSharePool ?? 0),
    reserveAmount: Number(data.reserveAmount ?? 0),
    distributablePool: Number(data.distributablePool ?? 0),
    distributedAmount: Number(data.distributedAmount ?? 0),
    unallocatedAmount: Number(data.unallocatedAmount ?? 0),
    status: (data.status as "completed" | "no_eligible_businesses") ?? "completed",
    participantsCount: Number(data.participantsCount ?? 0),
    eligibleBusinessesCount: Number(data.eligibleBusinessesCount ?? 0),
    createdBy: String(data.createdBy ?? ""),
    createdAt: toISODate(data.createdAt),
  } satisfies MembershipDistributionCycleRecord;
}

function mapMembershipBusinessCycleReport(
  snapshotId: string,
  data: Record<string, unknown>,
) {
  return {
    id: snapshotId,
    cycleId: String(data.cycleId ?? ""),
    cycleKey: String(data.cycleKey ?? ""),
    ownerUid: String(data.ownerUid ?? ""),
    ownerName: String(data.ownerName ?? "Business"),
    eligibleTransactions: Number(data.eligibleTransactions ?? 0),
    eligibleGrossValue: Number(data.eligibleGrossValue ?? 0),
    score: Number(data.score ?? 0),
    payoutAmount: Number(data.payoutAmount ?? 0),
    isEligible: Boolean(data.isEligible),
    missedReasons: (data.missedReasons as string[]) ?? [],
    monthlyBreakdown:
      (data.monthlyBreakdown as MembershipMonthlyEligibilityRecord[]) ?? [],
    createdAt: toISODate(data.createdAt),
  } satisfies MembershipBusinessCycleReportRecord;
}

function buildMonthlyEligibility(
  monthKey: string,
  rows: MembershipBusinessTransactionRecord[],
  settings: MembershipEconomicsSettings,
) {
  const monthRows = rows.filter((row) => monthKeyFromISO(row.occurredAt) === monthKey);
  const onlineRows = monthRows.filter(
    (row) => row.source === "online" && row.eligibleForScoring,
  );
  const offlineRows = monthRows.filter(
    (row) => row.source === "offline" && row.eligibleForScoring,
  );

  const onlineTransactions = onlineRows.length;
  const offlineTransactions = offlineRows.length;
  const onlineGross = onlineRows.reduce((sum, row) => sum + row.transactionValue, 0);
  const offlineGross = offlineRows.reduce((sum, row) => sum + row.transactionValue, 0);

  const reasons: string[] = [];
  const onlineEligible = onlineTransactions >= settings.onlineMinTransactions;
  const offlineEligible = offlineTransactions >= settings.offlineMinTransactions;
  if (onlineTransactions > 0 && !onlineEligible) {
    reasons.push(
      `Online transactions ${onlineTransactions} below minimum ${settings.onlineMinTransactions}.`,
    );
  }
  if (offlineTransactions > 0 && !offlineEligible) {
    reasons.push(
      `Offline transactions ${offlineTransactions} below minimum ${settings.offlineMinTransactions}.`,
    );
  }
  if (!onlineTransactions && !offlineTransactions) {
    reasons.push("No eligible-value transactions submitted for this month.");
  }

  let eligibleTransactions = 0;
  let eligibleGrossValue = 0;
  if (onlineEligible) {
    eligibleTransactions += onlineTransactions;
    eligibleGrossValue += onlineGross;
  }
  if (offlineEligible) {
    eligibleTransactions += offlineTransactions;
    eligibleGrossValue += offlineGross;
  }

  if (eligibleGrossValue > settings.monthlyEligibleGrossCap) {
    eligibleGrossValue = settings.monthlyEligibleGrossCap;
    reasons.push(
      `Eligible gross capped to INR ${settings.monthlyEligibleGrossCap} for this month.`,
    );
  }

  return {
    monthKey,
    onlineTransactions,
    offlineTransactions,
    eligibleTransactions,
    eligibleGrossValue,
    isEligible: eligibleTransactions > 0,
    reasons,
  } satisfies MembershipMonthlyEligibilityRecord;
}

function allocateCappedShares(
  entries: Array<{ ownerUid: string; score: number }>,
  poolAmount: number,
  maxShareCapPercent: number,
) {
  const shares = new Map<string, number>();
  for (const entry of entries) {
    shares.set(entry.ownerUid, 0);
  }
  if (poolAmount <= 0 || !entries.length) return shares;

  const capAmount = (poolAmount * maxShareCapPercent) / 100;
  let remaining = [...entries];
  let guard = 0;
  while (remaining.length > 0 && guard < 25) {
    const distributedSoFar = Array.from(shares.values()).reduce((sum, value) => sum + value, 0);
    const remainingPool = Math.max(poolAmount - distributedSoFar, 0);
    if (remainingPool <= 0.0001) break;

    const scoreTotal = remaining.reduce((sum, row) => sum + row.score, 0);
    if (scoreTotal <= 0) break;
    const nextRemaining: Array<{ ownerUid: string; score: number }> = [];
    let roundDistributed = 0;

    for (const row of remaining) {
      const current = shares.get(row.ownerUid) ?? 0;
      const proportional = remainingPool * (row.score / scoreTotal);
      const room = Math.max(capAmount - current, 0);
      const add = Math.min(proportional, room);
      shares.set(row.ownerUid, current + add);
      roundDistributed += add;
      if (current + add < capAmount - 0.0001) {
        nextRemaining.push(row);
      }
    }

    if (roundDistributed <= 0.0001) break;
    remaining = nextRemaining;
    guard += 1;
  }

  return shares;
}

function applyMinimumFloor(shares: Map<string, number>, minimumAmount: number) {
  if (minimumAmount <= 0) return shares;
  const next = new Map(shares);
  const rows = Array.from(next.entries());
  const underFloor = rows.filter(([, value]) => value > 0 && value < minimumAmount);
  if (!underFloor.length) return next;

  const overFloor = rows.filter(([, value]) => value >= minimumAmount);
  const required = underFloor.reduce((sum, [, value]) => sum + (minimumAmount - value), 0);
  const available = overFloor.reduce((sum, [, value]) => sum + (value - minimumAmount), 0);
  if (required > available || available <= 0) {
    return next;
  }

  for (const [uid] of underFloor) {
    next.set(uid, minimumAmount);
  }
  for (const [uid, value] of overFloor) {
    const removable = value - minimumAmount;
    const reduction = (removable / available) * required;
    next.set(uid, Math.max(value - reduction, minimumAmount));
  }
  return next;
}

function roundShareMap(shares: Map<string, number>) {
  const rows = Array.from(shares.entries()).map(([ownerUid, raw]) => ({
    ownerUid,
    raw,
    floored: Math.floor(raw),
    fraction: raw - Math.floor(raw),
  }));
  const roundedTotal = Math.round(rows.reduce((sum, row) => sum + row.raw, 0));
  let currentTotal = rows.reduce((sum, row) => sum + row.floored, 0);
  rows.sort((a, b) => b.fraction - a.fraction);
  let index = 0;
  while (currentTotal < roundedTotal && rows.length > 0) {
    rows[index % rows.length].floored += 1;
    currentTotal += 1;
    index += 1;
  }

  const output = new Map<string, number>();
  for (const row of rows) {
    output.set(row.ownerUid, row.floored);
  }
  return output;
}

async function fetchMembershipPurchasesInRange(startMonthKey: string, endMonthKey: string) {
  const database = getDb();
  const snapshots = await getDocs(query(collection(database, "membershipPurchases"), limit(5000)));
  return snapshots.docs
    .map((snapshot) => mapMembershipPurchase(snapshot.id, snapshot.data()))
    .filter((row) => inMonthRange(row.createdAt, startMonthKey, endMonthKey));
}

export async function fetchMembershipDistributionCycles() {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "membershipDistributionCycles"),
      orderBy("createdAt", "desc"),
      limit(120),
    ),
  );
  return snapshots.docs.map((snapshot) =>
    mapMembershipDistributionCycle(snapshot.id, snapshot.data()),
  );
}

export async function fetchMembershipReportsByBusiness(ownerUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "membershipBusinessReports"),
      where("ownerUid", "==", ownerUid),
      limit(200),
    ),
  );
  return snapshots.docs
    .map((snapshot) => mapMembershipBusinessCycleReport(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function fetchMembershipReportsByCycle(cycleId: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "membershipBusinessReports"),
      where("cycleId", "==", cycleId),
      limit(500),
    ),
  );
  return snapshots.docs
    .map((snapshot) => mapMembershipBusinessCycleReport(snapshot.id, snapshot.data()))
    .sort((a, b) => b.payoutAmount - a.payoutAmount);
}

export async function generateMembershipDistributionCycle(payload: {
  adminUid: string;
  startMonthKey: string;
  endMonthKey: string;
  cycleKey?: string;
}) {
  const database = getDb();
  const settings = await fetchMembershipEconomicsSettings();
  const monthKeys = listMonthKeysInRange(payload.startMonthKey, payload.endMonthKey);
  const cycleKey =
    payload.cycleKey?.trim() || `${payload.startMonthKey}_to_${payload.endMonthKey}`;

  const existingCycles = await fetchMembershipDistributionCycles();
  if (existingCycles.some((cycle) => cycle.cycleKey === cycleKey)) {
    throw new Error(`Cycle key "${cycleKey}" already exists.`);
  }

  const purchases = await fetchMembershipPurchasesInRange(
    payload.startMonthKey,
    payload.endMonthKey,
  );
  const totalMembershipRevenue = purchases.reduce((sum, row) => sum + row.amount, 0);
  const businessSharePool = Math.round(
    totalMembershipRevenue * (settings.businessSharePercent / 100),
  );
  const reserveAmount = Math.round(
    businessSharePool * (settings.cycleReservePercent / 100),
  );
  const distributablePool = Math.max(businessSharePool - reserveAmount, 0);

  const programs = (await fetchAdminMembershipPrograms()).filter(
    (row) => row.status === "active",
  );
  const participantReports = await Promise.all(
    programs.map(async (program) => {
      const rows = await fetchMembershipTransactionsByBusiness(program.ownerUid);
      const cycleRows = rows.filter((row) =>
        inMonthRange(row.occurredAt, payload.startMonthKey, payload.endMonthKey),
      );
      const monthlyBreakdown = monthKeys.map((monthKey) =>
        buildMonthlyEligibility(monthKey, cycleRows, settings),
      );
      const eligibleTransactions = monthlyBreakdown.reduce(
        (sum, month) => sum + month.eligibleTransactions,
        0,
      );
      const eligibleGrossValue = monthlyBreakdown.reduce(
        (sum, month) => sum + month.eligibleGrossValue,
        0,
      );
      const scoreGross = Math.min(
        eligibleGrossValue,
        settings.maxEligibleGrossValuePerBusiness,
      );
      const score =
        eligibleTransactions > 0
          ? 0.55 * Math.sqrt(eligibleTransactions) + 0.45 * Math.log1p(scoreGross)
          : 0;
      const missedReasons = Array.from(
        new Set(monthlyBreakdown.flatMap((month) => month.reasons)),
      );

      return {
        ownerUid: program.ownerUid,
        ownerName: program.ownerName,
        monthlyBreakdown,
        eligibleTransactions,
        eligibleGrossValue,
        score,
        missedReasons,
      };
    }),
  );

  const eligibleReports = participantReports.filter((report) => report.score > 0);
  const scoreEntries = eligibleReports.map((report) => ({
    ownerUid: report.ownerUid,
    score: report.score,
  }));
  const cappedShares = allocateCappedShares(
    scoreEntries,
    distributablePool,
    settings.maxShareCapPercent,
  );
  const floorAdjustedShares = applyMinimumFloor(
    cappedShares,
    settings.minimumMonthlyPayout,
  );
  const roundedShares = roundShareMap(floorAdjustedShares);

  const cycleRef = await addDoc(collection(database, "membershipDistributionCycles"), {
    cycleKey,
    startMonthKey: payload.startMonthKey,
    endMonthKey: payload.endMonthKey,
    monthKeys,
    totalMembershipRevenue,
    businessSharePool,
    reserveAmount,
    distributablePool,
    distributedAmount: 0,
    unallocatedAmount: distributablePool,
    status: eligibleReports.length ? "completed" : "no_eligible_businesses",
    participantsCount: programs.length,
    eligibleBusinessesCount: eligibleReports.length,
    createdBy: payload.adminUid,
    createdAt: serverTimestamp(),
  });

  let distributedAmount = 0;
  for (const report of participantReports) {
    const payoutAmount = roundedShares.get(report.ownerUid) ?? 0;
    distributedAmount += payoutAmount;
    await addDoc(collection(database, "membershipBusinessReports"), {
      cycleId: cycleRef.id,
      cycleKey,
      ownerUid: report.ownerUid,
      ownerName: report.ownerName,
      eligibleTransactions: report.eligibleTransactions,
      eligibleGrossValue: report.eligibleGrossValue,
      score: report.score,
      payoutAmount,
      isEligible: report.score > 0,
      missedReasons: report.missedReasons,
      monthlyBreakdown: report.monthlyBreakdown,
      createdAt: serverTimestamp(),
    });

    if (payoutAmount > 0) {
      await creditWalletBalance({
        ownerUid: report.ownerUid,
        amount: payoutAmount,
        reason: `Membership distribution payout (${cycleKey})`,
        type: "membership_distribution_credit",
        referenceId: cycleRef.id,
      });
      await updateDoc(doc(database, "membershipBusinessPrograms", report.ownerUid), {
        totalPayoutReceived: increment(payoutAmount),
        lastCycleKey: cycleKey,
        updatedAt: serverTimestamp(),
      });
    }
  }

  await updateDoc(doc(database, "membershipDistributionCycles", cycleRef.id), {
    distributedAmount,
    unallocatedAmount: Math.max(distributablePool - distributedAmount, 0),
    updatedAt: serverTimestamp(),
  });

  return {
    cycleId: cycleRef.id,
    cycleKey,
    totalMembershipRevenue,
    businessSharePool,
    distributablePool,
    distributedAmount,
    participantsCount: programs.length,
    eligibleBusinessesCount: eligibleReports.length,
  };
}

export type PartnershipDealStatus =
  | "open"
  | "agreement_reached"
  | "completed"
  | "cancelled";

export type PartnershipFeeStatus = "pending" | "debited" | "waived";

export interface PartnershipOpportunityRecord {
  businessApplicationId: string;
  ownerUid: string;
  businessName: string;
  businessSlug: string;
  category: string;
  city: string;
  country: string;
  stage: "idea" | "running";
  partnershipCategory?: string;
  partnershipAmountMin?: number;
  partnershipAmountMax?: number;
  yearsInField: number;
  trustScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface PartnershipDealRecord {
  id: string;
  listingBusinessId: string;
  listingBusinessName: string;
  listingBusinessSlug: string;
  listingOwnerUid: string;
  listingOwnerName: string;
  initiatorUid: string;
  initiatorName: string;
  initiatorEmail: string;
  partnershipCategory?: string;
  partnershipAmountMin?: number;
  partnershipAmountMax?: number;
  status: PartnershipDealStatus;
  feeStatus: PartnershipFeeStatus;
  platformFeePercent: number;
  agreedAmount?: number;
  platformFeeAmount: number;
  participantUids: string[];
  lastMessagePreview?: string;
  lastMessageBy?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelledReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PartnershipMessageRecord {
  id: string;
  dealId: string;
  senderUid: string;
  senderName: string;
  senderRole: "owner" | "initiator" | "admin";
  text: string;
  createdAt: string;
}

function mapPartnershipOpportunity(
  snapshotId: string,
  data: Record<string, unknown>,
) {
  return {
    businessApplicationId: snapshotId,
    ownerUid: String(data.ownerUid ?? ""),
    businessName: String(data.businessName ?? ""),
    businessSlug: String(data.slug ?? toSlug(String(data.businessName ?? ""))),
    category: String(data.category ?? "General"),
    city: String(data.city ?? ""),
    country: String(data.country ?? ""),
    stage: (data.stage as "idea" | "running") ?? "running",
    partnershipCategory: data.partnershipCategory
      ? String(data.partnershipCategory)
      : undefined,
    partnershipAmountMin: data.partnershipAmountMin
      ? Number(data.partnershipAmountMin)
      : undefined,
    partnershipAmountMax: data.partnershipAmountMax
      ? Number(data.partnershipAmountMax)
      : undefined,
    yearsInField: Number(data.yearsInField ?? 0),
    trustScore: Number(data.trustScore ?? deriveTrustScore(data)),
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
  } satisfies PartnershipOpportunityRecord;
}

function mapPartnershipDeal(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    listingBusinessId: String(data.listingBusinessId ?? ""),
    listingBusinessName: String(data.listingBusinessName ?? ""),
    listingBusinessSlug: String(data.listingBusinessSlug ?? ""),
    listingOwnerUid: String(data.listingOwnerUid ?? ""),
    listingOwnerName: String(data.listingOwnerName ?? "Business"),
    initiatorUid: String(data.initiatorUid ?? ""),
    initiatorName: String(data.initiatorName ?? "User"),
    initiatorEmail: String(data.initiatorEmail ?? ""),
    partnershipCategory: data.partnershipCategory
      ? String(data.partnershipCategory)
      : undefined,
    partnershipAmountMin: data.partnershipAmountMin
      ? Number(data.partnershipAmountMin)
      : undefined,
    partnershipAmountMax: data.partnershipAmountMax
      ? Number(data.partnershipAmountMax)
      : undefined,
    status: (data.status as PartnershipDealStatus) ?? "open",
    feeStatus: (data.feeStatus as PartnershipFeeStatus) ?? "pending",
    platformFeePercent: Number(data.platformFeePercent ?? 2),
    agreedAmount: data.agreedAmount ? Number(data.agreedAmount) : undefined,
    platformFeeAmount: Number(data.platformFeeAmount ?? 0),
    participantUids: (data.participantUids as string[]) ?? [],
    lastMessagePreview: data.lastMessagePreview
      ? String(data.lastMessagePreview)
      : undefined,
    lastMessageBy: data.lastMessageBy ? String(data.lastMessageBy) : undefined,
    completedAt: data.completedAt ? toISODate(data.completedAt) : undefined,
    cancelledAt: data.cancelledAt ? toISODate(data.cancelledAt) : undefined,
    cancelledReason: data.cancelledReason
      ? String(data.cancelledReason)
      : undefined,
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
  } satisfies PartnershipDealRecord;
}

function mapPartnershipMessage(snapshotId: string, dealId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    dealId,
    senderUid: String(data.senderUid ?? ""),
    senderName: String(data.senderName ?? "User"),
    senderRole: (data.senderRole as "owner" | "initiator" | "admin") ?? "initiator",
    text: String(data.text ?? ""),
    createdAt: toISODate(data.createdAt),
  } satisfies PartnershipMessageRecord;
}

async function ensurePartnershipParticipantsIdentity(payload: {
  ownerUid: string;
  initiatorUid: string;
}) {
  const [ownerProfile, initiatorProfile] = await Promise.all([
    getUserIdentityProfileOrThrow(payload.ownerUid),
    getUserIdentityProfileOrThrow(payload.initiatorUid),
  ]);
  if (!ownerProfile.isIdentityVerified || !initiatorProfile.isIdentityVerified) {
    throw new Error(
      "Both participants must complete identity verification before partnership chat.",
    );
  }
  return { ownerProfile, initiatorProfile };
}

export async function fetchPartnershipOpportunities() {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "businessApplications"),
      where("status", "==", "approved"),
      limit(500),
    ),
  );
  const rows: PartnershipOpportunityRecord[] = [];
  for (const snapshot of snapshots.docs) {
    const data = snapshot.data();
    if (!Boolean(data.lookingForPartnership)) continue;
    rows.push(mapPartnershipOpportunity(snapshot.id, data));
  }
  return rows.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function createPartnershipDeal(payload: {
  listingBusinessId: string;
  initiatorUid: string;
  initiatorName: string;
  initiatorEmail: string;
  openingMessage?: string;
}) {
  const database = getDb();
  const listingSnapshot = await getDoc(doc(database, "businessApplications", payload.listingBusinessId));
  if (!listingSnapshot.exists()) {
    throw new Error("Partnership listing not found.");
  }

  const listingData = listingSnapshot.data();
  if (!listingData.lookingForPartnership) {
    throw new Error("This business is not accepting partnership requests right now.");
  }
  const listing = mapPartnershipOpportunity(listingSnapshot.id, listingData);
  if (listing.ownerUid === payload.initiatorUid) {
    throw new Error("You cannot create a partnership deal with your own business listing.");
  }

  await ensurePartnershipParticipantsIdentity({
    ownerUid: listing.ownerUid,
    initiatorUid: payload.initiatorUid,
  });

  const existingCandidateSnapshots = await getDocs(
    query(
      collection(database, "partnershipDeals"),
      where("participantUids", "array-contains", payload.initiatorUid),
      limit(600),
    ),
  );
  const existingActive = existingCandidateSnapshots.docs
    .map((snapshot) => mapPartnershipDeal(snapshot.id, snapshot.data()))
    .find(
      (row) =>
        row.listingBusinessId === payload.listingBusinessId &&
        row.initiatorUid === payload.initiatorUid &&
        (row.status === "open" || row.status === "agreement_reached"),
    );
  if (existingActive) {
    return existingActive.id;
  }

  const dealRef = await addDoc(collection(database, "partnershipDeals"), {
    listingBusinessId: listing.businessApplicationId,
    listingBusinessName: listing.businessName,
    listingBusinessSlug: listing.businessSlug,
    listingOwnerUid: listing.ownerUid,
    listingOwnerName: listing.businessName,
    initiatorUid: payload.initiatorUid,
    initiatorName: payload.initiatorName,
    initiatorEmail: payload.initiatorEmail,
    partnershipCategory: listing.partnershipCategory ?? null,
    partnershipAmountMin: listing.partnershipAmountMin ?? null,
    partnershipAmountMax: listing.partnershipAmountMax ?? null,
    status: "open",
    feeStatus: "pending",
    platformFeePercent: 2,
    agreedAmount: null,
    platformFeeAmount: 0,
    participantUids: [listing.ownerUid, payload.initiatorUid],
    lastMessagePreview: "",
    lastMessageBy: payload.initiatorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const openingText =
    payload.openingMessage?.trim() ||
    "I am interested in discussing a partnership opportunity.";
  await addDoc(collection(database, "partnershipDeals", dealRef.id, "messages"), {
    senderUid: payload.initiatorUid,
    senderName: payload.initiatorName,
    senderRole: "initiator",
    text: openingText,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(database, "partnershipDeals", dealRef.id), {
    lastMessagePreview: openingText.slice(0, 180),
    updatedAt: serverTimestamp(),
  });

  return dealRef.id;
}

export async function fetchPartnershipDealsByParticipant(participantUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "partnershipDeals"),
      where("participantUids", "array-contains", participantUid),
      limit(600),
    ),
  );
  return snapshots.docs
    .map((snapshot) => mapPartnershipDeal(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function fetchAdminPartnershipDeals() {
  const database = getDb();
  const snapshots = await getDocs(query(collection(database, "partnershipDeals"), limit(800)));
  return snapshots.docs
    .map((snapshot) => mapPartnershipDeal(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function fetchPartnershipDealById(dealId: string) {
  const database = getDb();
  const snapshot = await getDoc(doc(database, "partnershipDeals", dealId));
  if (!snapshot.exists()) return null;
  return mapPartnershipDeal(snapshot.id, snapshot.data());
}

export async function fetchPartnershipMessages(dealId: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "partnershipDeals", dealId, "messages"),
      orderBy("createdAt", "asc"),
      limit(500),
    ),
  );
  return snapshots.docs.map((snapshot) =>
    mapPartnershipMessage(snapshot.id, dealId, snapshot.data()),
  );
}

export async function fetchPartnershipIdentityStatus(dealId: string) {
  const deal = await fetchPartnershipDealById(dealId);
  if (!deal) return null;
  const [owner, initiator] = await Promise.all([
    getUserIdentityProfileOrThrow(deal.listingOwnerUid),
    getUserIdentityProfileOrThrow(deal.initiatorUid),
  ]);
  return {
    ownerUid: owner.uid,
    ownerVerified: owner.isIdentityVerified,
    initiatorUid: initiator.uid,
    initiatorVerified: initiator.isIdentityVerified,
  };
}

async function assertPartnershipAccess(payload: {
  dealId: string;
  actorUid: string;
  adminMode?: boolean;
}) {
  const deal = await fetchPartnershipDealById(payload.dealId);
  if (!deal) throw new Error("Partnership deal not found.");
  const isParticipant = deal.participantUids.includes(payload.actorUid);
  if (!isParticipant && !payload.adminMode) {
    throw new Error("You do not have access to this partnership deal.");
  }
  if (!payload.adminMode) {
    await ensurePartnershipParticipantsIdentity({
      ownerUid: deal.listingOwnerUid,
      initiatorUid: deal.initiatorUid,
    });
  }
  return deal;
}

export async function sendPartnershipMessage(payload: {
  dealId: string;
  senderUid: string;
  senderName: string;
  senderRole: "owner" | "initiator" | "admin";
  text: string;
  adminMode?: boolean;
}) {
  const trimmed = payload.text.trim();
  if (!trimmed) throw new Error("Message cannot be empty.");
  const database = getDb();
  const deal = await assertPartnershipAccess({
    dealId: payload.dealId,
    actorUid: payload.senderUid,
    adminMode: payload.adminMode,
  });
  if (
    !payload.adminMode &&
    !(deal.status === "open" || deal.status === "agreement_reached")
  ) {
    throw new Error("This deal is closed. New chat messages are not allowed.");
  }

  await addDoc(collection(database, "partnershipDeals", payload.dealId, "messages"), {
    senderUid: payload.senderUid,
    senderName: payload.senderName,
    senderRole: payload.senderRole,
    text: trimmed,
    createdAt: serverTimestamp(),
  });

  await updateDoc(doc(database, "partnershipDeals", payload.dealId), {
    participantUids: arrayUnion(payload.senderUid),
    lastMessageBy: payload.senderUid,
    lastMessagePreview: trimmed.slice(0, 180),
    updatedAt: serverTimestamp(),
  });
}

export async function proposePartnershipAgreement(payload: {
  dealId: string;
  actorUid: string;
  actorName: string;
  agreedAmount: number;
}) {
  if (payload.agreedAmount <= 0) {
    throw new Error("Agreed amount must be greater than zero.");
  }
  const database = getDb();
  const deal = await assertPartnershipAccess({
    dealId: payload.dealId,
    actorUid: payload.actorUid,
  });
  if (!(deal.status === "open" || deal.status === "agreement_reached")) {
    throw new Error("Cannot set agreement amount on a closed deal.");
  }

  const platformFeeAmount = Math.round(payload.agreedAmount * (deal.platformFeePercent / 100));
  const text = `${payload.actorName} proposed deal amount INR ${payload.agreedAmount}. Platform fee ${deal.platformFeePercent}% = INR ${platformFeeAmount}.`;

  await updateDoc(doc(database, "partnershipDeals", payload.dealId), {
    status: "agreement_reached",
    agreedAmount: payload.agreedAmount,
    platformFeeAmount,
    feeStatus: "pending",
    lastMessageBy: payload.actorUid,
    lastMessagePreview: text.slice(0, 180),
    updatedAt: serverTimestamp(),
  });
  await addDoc(collection(database, "partnershipDeals", payload.dealId, "messages"), {
    senderUid: payload.actorUid,
    senderName: payload.actorName,
    senderRole: payload.actorUid === deal.listingOwnerUid ? "owner" : "initiator",
    text,
    createdAt: serverTimestamp(),
  });

  return { platformFeeAmount };
}

export async function cancelPartnershipDeal(payload: {
  dealId: string;
  actorUid: string;
  actorName: string;
  reason: string;
  adminMode?: boolean;
}) {
  const reason = payload.reason.trim();
  if (!reason) throw new Error("Cancellation reason is required.");
  const database = getDb();
  const deal = await assertPartnershipAccess({
    dealId: payload.dealId,
    actorUid: payload.actorUid,
    adminMode: payload.adminMode,
  });
  if (!payload.adminMode && deal.status === "completed") {
    throw new Error("Completed partnership deals cannot be cancelled.");
  }

  const message = `Deal cancelled by ${payload.actorName}. Reason: ${reason}`;
  await updateDoc(doc(database, "partnershipDeals", payload.dealId), {
    status: "cancelled",
    cancelledAt: serverTimestamp(),
    cancelledReason: reason,
    lastMessageBy: payload.actorUid,
    lastMessagePreview: message.slice(0, 180),
    updatedAt: serverTimestamp(),
  });
  await addDoc(collection(database, "partnershipDeals", payload.dealId, "messages"), {
    senderUid: payload.actorUid,
    senderName: payload.actorName,
    senderRole: payload.adminMode
      ? "admin"
      : payload.actorUid === deal.listingOwnerUid
        ? "owner"
        : "initiator",
    text: message,
    createdAt: serverTimestamp(),
  });
}

export async function completePartnershipDeal(payload: {
  dealId: string;
  actorUid: string;
  actorName: string;
}) {
  const database = getDb();
  const deal = await assertPartnershipAccess({
    dealId: payload.dealId,
    actorUid: payload.actorUid,
  });
  if (deal.status !== "agreement_reached") {
    throw new Error("Agreement amount must be finalized before completion.");
  }
  const amount = deal.agreedAmount ?? 0;
  if (amount <= 0) {
    throw new Error("Agreement amount missing. Set agreed amount first.");
  }

  const feeAmount =
    deal.platformFeeAmount > 0
      ? deal.platformFeeAmount
      : Math.round(amount * (deal.platformFeePercent / 100));
  if (feeAmount > 0) {
    await debitWalletBalance({
      ownerUid: deal.listingOwnerUid,
      amount: feeAmount,
      reason: `Partnership completion fee for ${deal.listingBusinessName}`,
      type: "partnership_fee_debit",
      referenceId: payload.dealId,
    });
  }

  const completionMessage = `${payload.actorName} marked deal as completed. Platform fee debited: INR ${feeAmount}.`;
  await updateDoc(doc(database, "partnershipDeals", payload.dealId), {
    status: "completed",
    feeStatus: feeAmount > 0 ? "debited" : "waived",
    platformFeeAmount: feeAmount,
    completedAt: serverTimestamp(),
    lastMessageBy: payload.actorUid,
    lastMessagePreview: completionMessage.slice(0, 180),
    updatedAt: serverTimestamp(),
  });
  await addDoc(collection(database, "partnershipDeals", payload.dealId, "messages"), {
    senderUid: payload.actorUid,
    senderName: payload.actorName,
    senderRole: payload.actorUid === deal.listingOwnerUid ? "owner" : "initiator",
    text: completionMessage,
    createdAt: serverTimestamp(),
  });
  await addDoc(collection(database, "partnershipFeeLedgers"), {
    dealId: payload.dealId,
    payerUid: deal.listingOwnerUid,
    payerName: deal.listingOwnerName,
    listingBusinessId: deal.listingBusinessId,
    listingBusinessName: deal.listingBusinessName,
    agreedAmount: amount,
    feePercent: deal.platformFeePercent,
    feeAmount,
    status: feeAmount > 0 ? "debited" : "waived",
    createdAt: serverTimestamp(),
    createdBy: payload.actorUid,
  });

  return { feeAmount };
}
