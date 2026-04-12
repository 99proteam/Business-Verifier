import { User } from "firebase/auth";
import {
  addDoc,
  arrayUnion,
  collection,
  collectionGroup,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
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

function randomKeyFragment(length = 8) {
  return Math.random().toString(36).slice(2, 2 + length).toUpperCase();
}

function generateBusinessPublicKey() {
  return `BVB-${randomKeyFragment(4)}-${randomKeyFragment(4)}`;
}

function generateBusinessEmployeeJoinKey() {
  return `BVJ-${randomKeyFragment(6)}-${randomKeyFragment(6)}`;
}

function generateUserPublicId() {
  return `BVU-${randomKeyFragment(4)}-${randomKeyFragment(4)}`;
}

function normalizeHttpUrl(raw: string) {
  const value = raw.trim();
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function getDb() {
  if (!db) {
    throw new Error("Firebase is not configured. Add NEXT_PUBLIC_FIREBASE_* values.");
  }
  return db;
}

function isFirestorePermissionError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("permission_denied") ||
    message.includes("missing or insufficient permissions")
  );
}

function userLookupRef(database: ReturnType<typeof getDb>, uid: string) {
  return doc(database, "userLookup", uid);
}

async function syncUserLookupRecord(
  payload: {
    uid: string;
    email: string;
    displayName: string;
    publicId: string;
    role: string;
  },
) {
  const database = getDb();
  await setDoc(
    userLookupRef(database, payload.uid),
    {
      uid: payload.uid,
      email: payload.email,
      emailNormalized: payload.email.trim().toLowerCase(),
      displayName: payload.displayName,
      publicId: payload.publicId,
      role: payload.role,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

async function generateUniqueUserPublicId() {
  const database = getDb();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = generateUserPublicId();
    const existing = await getDocs(
      query(collection(database, "userLookup"), where("publicId", "==", candidate), limit(1)),
    );
    if (!existing.docs.length) return candidate;
  }
  return `BVU-${Date.now().toString(36).toUpperCase()}`;
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

export interface AutomationJobRunRecord {
  id: string;
  jobKey: string;
  source: string;
  status: "success" | "failed";
  summary: string;
  metadata?: Record<string, string | number | boolean | null>;
  createdAt: string;
}

function mapAutomationJobRun(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    jobKey: String(data.jobKey ?? ""),
    source: String(data.source ?? "manual"),
    status: (data.status as "success" | "failed") ?? "success",
    summary: String(data.summary ?? ""),
    metadata: (data.metadata as Record<string, string | number | boolean | null>) ?? undefined,
    createdAt: toISODate(data.createdAt),
  } satisfies AutomationJobRunRecord;
}

export async function recordAutomationJobRun(payload: {
  jobKey: string;
  source: string;
  status: "success" | "failed";
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  const database = getDb();
  const ref = await addDoc(collection(database, "automationJobRuns"), {
    jobKey: payload.jobKey,
    source: payload.source,
    status: payload.status,
    summary: payload.summary,
    metadata: sanitizeAuditMetadata(payload.metadata) ?? null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function fetchAutomationJobRuns(limitCount = 120) {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "automationJobRuns"), orderBy("createdAt", "desc"), limit(limitCount)),
  );
  return snapshots.docs.map((snapshot) => mapAutomationJobRun(snapshot.id, snapshot.data()));
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
  publicDocumentUrls?: string[];
  questionConversationMode: "public" | "private";
  lookingForPartnership: boolean;
  partnershipCategory?: string;
  partnershipAmountMin?: number;
  partnershipAmountMax?: number;
  wantsProPlan: boolean;
  proDepositAmount?: number;
  proDepositLockMonths?: number;
}

export type BusinessQuestionConversationMode = "public" | "private";

export interface VerificationChecklist {
  mobileVerified: boolean;
  addressVerified: boolean;
  bankAccountVerified: boolean;
  businessInfoVerified: boolean;
  publicDocumentsVerified: boolean;
}

export interface BusinessApplicationRecord extends BusinessApplicationInput {
  id: string;
  ownerUid: string;
  slug: string;
  publicBusinessKey: string;
  employeeJoinKey?: string;
  status: "pending" | "approved" | "rejected";
  isRecommended?: boolean;
  recommendedMarkedBy?: string;
  recommendedMarkedAt?: string;
  certificateId?: string;
  certificateSerial?: string;
  trustScore: number;
  followersCount: number;
  totalLockedDeposit?: number;
  totalAvailableDeposit?: number;
  trustBadgeCode?: string;
  verificationChecklist: VerificationChecklist;
  verificationNotes?: string;
  checklistReviewedBy?: string;
  checklistReviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessQuestionThreadRecord {
  id: string;
  businessId: string;
  businessSlug: string;
  businessName: string;
  ownerUid: string;
  customerUid: string;
  customerName: string;
  customerEmail: string;
  title: string;
  mode: BusinessQuestionConversationMode;
  participantUids: string[];
  status: "open" | "closed";
  lastMessage: string;
  lastMessageByUid: string;
  messagesCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessQuestionMessageRecord {
  id: string;
  senderUid: string;
  senderName: string;
  senderRole: "customer" | "business_owner";
  text: string;
  createdAt: string;
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

export type TrustBadgeWidgetEventType = "impression" | "click";

export interface TrustBadgeWidgetDailyStatRecord {
  id: string;
  businessId: string;
  ownerUid: string;
  businessName: string;
  dateKey: string;
  impressions: number;
  clicks: number;
  lastEventAt: string;
  updatedAt: string;
  createdAt: string;
}

export interface TrustBadgeWidgetSummaryRecord {
  businessId: string;
  businessName: string;
  totalImpressions: number;
  totalClicks: number;
  ctrPercent: number;
  lastEventAt?: string;
  daily: TrustBadgeWidgetDailyStatRecord[];
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

export type EmployeeAccessRequestStatus =
  | "pending"
  | "hold"
  | "approved"
  | "auto_approved"
  | "declined";

export interface EmployeeAccessRequestRecord {
  employeeUid: string;
  employeeName: string;
  employeeEmail: string;
  businessId: string;
  businessName: string;
  businessSlug: string;
  businessPublicKey: string;
  status: EmployeeAccessRequestStatus;
  note?: string;
  autoApproved: boolean;
  reviewedByUid?: string;
  reviewedByName?: string;
  requestedAt: string;
  updatedAt: string;
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
  roleSelectionCompleted: boolean;
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
  businessId?: string;
  businessSlug?: string;
  businessName: string;
  orderReference?: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  expectedOutcome: string;
  evidenceUrls: string[];
  sourceType?: "order_refund" | "product_review" | "business_profile" | "manual";
  sourceId?: string;
  autoGenerated?: boolean;
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
    businessId: data.businessId ? String(data.businessId) : undefined,
    businessSlug: data.businessSlug ? String(data.businessSlug) : undefined,
    businessName: String(data.businessName ?? ""),
    orderReference: data.orderReference ? String(data.orderReference) : undefined,
    title: String(data.title ?? ""),
    description: String(data.description ?? ""),
    priority: (data.priority as SupportTicketInput["priority"]) ?? "medium",
    expectedOutcome: String(data.expectedOutcome ?? ""),
    evidenceUrls: (data.evidenceUrls as string[]) ?? [],
    sourceType: data.sourceType ? (String(data.sourceType) as SupportTicketInput["sourceType"]) : undefined,
    sourceId: data.sourceId ? String(data.sourceId) : undefined,
    autoGenerated: Boolean(data.autoGenerated),
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
  const rawChecklist = (data.verificationChecklist as Record<string, unknown> | undefined) ?? {};
  const checklist = {
    mobileVerified: Boolean(rawChecklist.mobileVerified),
    addressVerified: Boolean(rawChecklist.addressVerified),
    bankAccountVerified: Boolean(rawChecklist.bankAccountVerified),
    businessInfoVerified: Boolean(rawChecklist.businessInfoVerified),
    publicDocumentsVerified: Boolean(rawChecklist.publicDocumentsVerified),
  } satisfies VerificationChecklist;
  const checklistCompleted = Object.values(checklist).filter(Boolean).length;

  let score = status === "approved" ? 72 : status === "pending" ? 58 : 45;
  score += Math.min(14, Math.max(0, years * 2));
  if (hasCertificate) score += 7;
  if (wantsProPlan) score += 4;
  if (hasDetailedDocs) score += 3;
  score += checklistCompleted * 2;
  return Math.max(35, Math.min(99, Math.round(score)));
}

function mapBusinessApplication(snapshotId: string, data: Record<string, unknown>) {
  const rawChecklist = (data.verificationChecklist as Record<string, unknown> | undefined) ?? {};
  const verificationChecklist = {
    mobileVerified: Boolean(rawChecklist.mobileVerified),
    addressVerified: Boolean(rawChecklist.addressVerified),
    bankAccountVerified: Boolean(rawChecklist.bankAccountVerified),
    businessInfoVerified: Boolean(rawChecklist.businessInfoVerified),
    publicDocumentsVerified: Boolean(rawChecklist.publicDocumentsVerified),
  } satisfies VerificationChecklist;

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
    publicDocumentUrls: (data.publicDocumentUrls as string[]) ?? [],
    questionConversationMode:
      data.questionConversationMode === "private" ? "private" : "public",
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
    publicBusinessKey: String(data.publicBusinessKey ?? `BVB-${snapshotId.slice(0, 8).toUpperCase()}`),
    employeeJoinKey: data.employeeJoinKey ? String(data.employeeJoinKey) : undefined,
    status: (data.status as BusinessApplicationRecord["status"]) ?? "pending",
    isRecommended: Boolean(data.isRecommended),
    recommendedMarkedBy: data.recommendedMarkedBy
      ? String(data.recommendedMarkedBy)
      : undefined,
    recommendedMarkedAt: data.recommendedMarkedAt
      ? toISODate(data.recommendedMarkedAt)
      : undefined,
    certificateId: data.certificateId ? String(data.certificateId) : undefined,
    certificateSerial: data.certificateSerial
      ? String(data.certificateSerial)
      : undefined,
    trustScore: Number(data.trustScore ?? deriveTrustScore(data)),
    followersCount: Number(data.followersCount ?? 0),
    totalLockedDeposit: Number(data.totalLockedDeposit ?? 0),
    totalAvailableDeposit: Number(data.totalAvailableDeposit ?? 0),
    trustBadgeCode: data.trustBadgeCode ? String(data.trustBadgeCode) : undefined,
    verificationChecklist,
    verificationNotes: data.verificationNotes ? String(data.verificationNotes) : undefined,
    checklistReviewedBy: data.checklistReviewedBy ? String(data.checklistReviewedBy) : undefined,
    checklistReviewedAt: data.checklistReviewedAt
      ? toISODate(data.checklistReviewedAt)
      : undefined,
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

function mapTrustBadgeWidgetDailyStat(
  snapshotId: string,
  data: Record<string, unknown>,
): TrustBadgeWidgetDailyStatRecord {
  return {
    id: snapshotId,
    businessId: String(data.businessId ?? ""),
    ownerUid: String(data.ownerUid ?? ""),
    businessName: String(data.businessName ?? ""),
    dateKey: String(data.dateKey ?? ""),
    impressions: Number(data.impressions ?? 0),
    clicks: Number(data.clicks ?? 0),
    lastEventAt: toISODate(data.lastEventAt),
    updatedAt: toISODate(data.updatedAt),
    createdAt: toISODate(data.createdAt),
  } satisfies TrustBadgeWidgetDailyStatRecord;
}

async function fetchPrimaryBusinessByOwner(ownerUid: string) {
  const database = getDb();
  let snapshots = await getDocs(
    query(
      collection(database, "businessApplications"),
      where("ownerUid", "==", ownerUid),
      where("status", "==", "approved"),
      limit(40),
    ),
  );
  let canPatchMissingFields = false;

  if (snapshots.empty) {
    try {
      snapshots = await getDocs(
        query(
          collection(database, "businessApplications"),
          where("ownerUid", "==", ownerUid),
          limit(40),
        ),
      );
      canPatchMissingFields = true;
    } catch (queryError) {
      if (isFirestorePermissionError(queryError)) {
        return null;
      }
      throw queryError;
    }
  }

  const rows = await Promise.all(
    snapshots.docs.map(async (snapshot) => {
      const raw = snapshot.data();
      const missingMetadata =
        !raw.publicBusinessKey || !raw.employeeJoinKey || !raw.questionConversationMode;
      if (canPatchMissingFields && missingMetadata) {
        await updateDoc(doc(database, "businessApplications", snapshot.id), {
          publicBusinessKey: raw.publicBusinessKey || generateBusinessPublicKey(),
          employeeJoinKey: raw.employeeJoinKey || generateBusinessEmployeeJoinKey(),
          questionConversationMode: raw.questionConversationMode || "public",
          updatedAt: serverTimestamp(),
        });
      }
      return mapBusinessApplication(snapshot.id, {
        ...raw,
        publicBusinessKey:
          raw.publicBusinessKey || `BVB-${snapshot.id.slice(0, 8).toUpperCase()}`,
        employeeJoinKey: raw.employeeJoinKey || null,
        questionConversationMode: raw.questionConversationMode || "public",
      });
    }),
  );
  if (!rows.length) return null;
  const approved = rows.find((row) => row.status === "approved");
  return approved ?? rows.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
}

export async function fetchOwnedBusinessProfile(ownerUid: string) {
  return fetchPrimaryBusinessByOwner(ownerUid);
}

export async function ensureUserProfile(user: User) {
  const database = getDb();
  const userRef = doc(database, "users", user.uid);
  const walletRef = doc(database, "wallets", user.uid);
  const existing = await getDoc(userRef);
  const walletSnapshot = await getDoc(walletRef);
  const existingData = existing.exists() ? (existing.data() as Record<string, unknown>) : null;
  const publicId =
    existingData?.publicId && String(existingData.publicId).trim()
      ? String(existingData.publicId)
      : await generateUniqueUserPublicId();

  const basePayload = {
    uid: user.uid,
    email: user.email ?? "",
    emailNormalized: (user.email ?? "").trim().toLowerCase(),
    displayName: user.displayName ?? "User",
    photoURL: user.photoURL ?? "",
    publicId,
    updatedAt: serverTimestamp(),
  };

  if (!existing.exists()) {
    await setDoc(userRef, {
      ...basePayload,
      role: "customer",
      roleSelectionCompleted: false,
      isIdentityVerified: false,
      createdAt: serverTimestamp(),
    });
  } else {
    await updateDoc(userRef, basePayload);
  }

  await syncUserLookupRecord({
    uid: user.uid,
    email: user.email ?? "",
    displayName: user.displayName ?? "User",
    publicId,
    role: existing.exists() ? String(existingData?.role ?? "customer") : "customer",
  });

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
    publicBusinessKey: generateBusinessPublicKey(),
    employeeJoinKey: generateBusinessEmployeeJoinKey(),
    status: "pending" as const,
    isRecommended: false,
    recommendedMarkedBy: null,
    recommendedMarkedAt: null,
    certificateId: null,
    certificateSerial: null,
    followersCount: 0,
    totalLockedDeposit: 0,
    totalAvailableDeposit: 0,
    trustBadgeCode: "",
    publicDocumentUrls: input.publicDocumentUrls ?? [],
    questionConversationMode:
      input.questionConversationMode === "private" ? "private" : "public",
    verificationChecklist: {
      mobileVerified: false,
      addressVerified: false,
      bankAccountVerified: false,
      businessInfoVerified: false,
      publicDocumentsVerified: false,
    } satisfies VerificationChecklist,
    verificationNotes: "",
    checklistReviewedBy: null,
    checklistReviewedAt: null,
  };
  const appRef = await addDoc(collection(database, "businessApplications"), {
    ...draft,
    trustScore: deriveTrustScore(draft),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return appRef.id;
}

export function isVerificationChecklistComplete(checklist: VerificationChecklist) {
  return (
    checklist.mobileVerified &&
    checklist.addressVerified &&
    checklist.bankAccountVerified &&
    checklist.businessInfoVerified &&
    checklist.publicDocumentsVerified
  );
}

export async function adminUpdateBusinessVerificationChecklist(payload: {
  applicationId: string;
  adminUid: string;
  checklist: VerificationChecklist;
  notes?: string;
}) {
  const database = getDb();
  const applicationRef = doc(database, "businessApplications", payload.applicationId);
  const existing = await getDoc(applicationRef);
  if (!existing.exists()) {
    throw new Error("Business application not found.");
  }

  await updateDoc(applicationRef, {
    verificationChecklist: payload.checklist,
    verificationNotes: payload.notes?.trim() || "",
    checklistReviewedBy: payload.adminUid,
    checklistReviewedAt: serverTimestamp(),
    trustScore: deriveTrustScore({
      ...existing.data(),
      verificationChecklist: payload.checklist,
    }),
    updatedAt: serverTimestamp(),
  });

  await recordAuditEvent({
    actorUid: payload.adminUid,
    actorRole: "admin",
    action: "verification_checklist_update",
    targetType: "business_application",
    targetId: payload.applicationId,
    summary: "Updated business verification checklist.",
    metadata: {
      ...payload.checklist,
      checklistComplete: isVerificationChecklistComplete(payload.checklist),
    },
  });
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
  if (!isVerificationChecklistComplete(application.verificationChecklist)) {
    throw new Error("Complete all verification checklist items before issuing certificate.");
  }

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
  const rows = snapshots.docs.map((snapshot) =>
    mapBusinessApplication(snapshot.id, {
      ...snapshot.data(),
      publicBusinessKey:
        snapshot.data().publicBusinessKey || `BVB-${snapshot.id.slice(0, 8).toUpperCase()}`,
      employeeJoinKey: snapshot.data().employeeJoinKey || null,
    }),
  );
  return rows.sort((a, b) => {
    if (b.trustScore !== a.trustScore) return b.trustScore - a.trustScore;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}

export type HomeBusinessMode = "new" | "recommended" | "both";
export type HomeContentModuleType =
  | "new_business_sidebar"
  | "recommended_business"
  | "images_redirect"
  | "videos_url";

export interface HomeMediaItemRecord {
  title: string;
  mediaUrl: string;
  redirectUrl: string;
}

export interface HomePageSettingsRecord {
  businessMode: HomeBusinessMode;
  businessLimit: number;
  newBusinessWindowDays: number;
  enabledModules: HomeContentModuleType[];
  imageItems: HomeMediaItemRecord[];
  videoItems: HomeMediaItemRecord[];
  updatedAt?: string;
}

export interface HomePageShowcaseRecord {
  settings: HomePageSettingsRecord;
  businesses: BusinessApplicationRecord[];
  offeringsByBusiness: Record<string, HomeBusinessOfferingRecord[]>;
}

export interface HomeBusinessOfferingRecord {
  id: string;
  kind: "product" | "service";
  title: string;
  category: string;
  priceLabel: string;
  href: string;
}

const homePageDefaults: HomePageSettingsRecord = {
  businessMode: "both",
  businessLimit: 20,
  newBusinessWindowDays: 30,
  enabledModules: [
    "new_business_sidebar",
    "recommended_business",
    "images_redirect",
    "videos_url",
  ],
  imageItems: [],
  videoItems: [],
};

const allowedHomeModules: HomeContentModuleType[] = [
  "new_business_sidebar",
  "recommended_business",
  "images_redirect",
  "videos_url",
];

function normalizeHomeModules(raw: unknown): HomeContentModuleType[] {
  if (!Array.isArray(raw)) return [...homePageDefaults.enabledModules];
  const values = raw
    .map((entry) => String(entry ?? "").trim() as HomeContentModuleType)
    .filter((entry): entry is HomeContentModuleType =>
      allowedHomeModules.includes(entry),
    );
  const deduped = Array.from(new Set(values));
  return deduped.length ? deduped : [...homePageDefaults.enabledModules];
}

function normalizeHomeMediaItems(raw: unknown): HomeMediaItemRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const row = entry as Record<string, unknown>;
      const title = String(row.title ?? "").trim();
      const mediaUrl = normalizeHttpUrl(String(row.mediaUrl ?? ""));
      const redirectUrl = normalizeHttpUrl(String(row.redirectUrl ?? ""));
      if (!mediaUrl || !redirectUrl) return null;
      return {
        title: title || "Media",
        mediaUrl,
        redirectUrl,
      } satisfies HomeMediaItemRecord;
    })
    .filter((row): row is HomeMediaItemRecord => Boolean(row))
    .slice(0, 30);
}

function mapHomePageSettings(data: Record<string, unknown>) {
  const rawMode = String(data.businessMode ?? homePageDefaults.businessMode).trim();
  const businessMode: HomeBusinessMode =
    rawMode === "new" || rawMode === "recommended" || rawMode === "both"
      ? rawMode
      : "both";
  return {
    businessMode,
    businessLimit: Math.max(1, Math.min(20, Number(data.businessLimit ?? homePageDefaults.businessLimit))),
    newBusinessWindowDays: Math.max(
      1,
      Math.min(180, Number(data.newBusinessWindowDays ?? homePageDefaults.newBusinessWindowDays)),
    ),
    enabledModules: normalizeHomeModules(data.enabledModules),
    imageItems: normalizeHomeMediaItems(data.imageItems),
    videoItems: normalizeHomeMediaItems(data.videoItems),
    updatedAt: data.updatedAt ? toISODate(data.updatedAt) : undefined,
  } satisfies HomePageSettingsRecord;
}

export async function fetchHomePageSettings() {
  const database = getDb();
  const ref = doc(database, "platformSettings", "homepage");
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    return homePageDefaults;
  }
  return mapHomePageSettings(snapshot.data());
}

export async function updateHomePageSettings(payload: {
  adminUid: string;
  businessMode: HomeBusinessMode;
  businessLimit: number;
  newBusinessWindowDays: number;
  enabledModules: HomeContentModuleType[];
  imageItems: HomeMediaItemRecord[];
  videoItems: HomeMediaItemRecord[];
}) {
  const database = getDb();
  await setDoc(
    doc(database, "platformSettings", "homepage"),
    {
      businessMode: payload.businessMode,
      businessLimit: Math.max(1, Math.min(20, Math.round(payload.businessLimit))),
      newBusinessWindowDays: Math.max(
        1,
        Math.min(180, Math.round(payload.newBusinessWindowDays)),
      ),
      enabledModules: normalizeHomeModules(payload.enabledModules),
      imageItems: normalizeHomeMediaItems(payload.imageItems),
      videoItems: normalizeHomeMediaItems(payload.videoItems),
      updatedBy: payload.adminUid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function adminSetBusinessRecommendation(payload: {
  adminUid: string;
  businessId: string;
  isRecommended: boolean;
}) {
  const database = getDb();
  const ref = doc(database, "businessApplications", payload.businessId);
  await updateDoc(ref, {
    isRecommended: payload.isRecommended,
    recommendedMarkedBy: payload.isRecommended ? payload.adminUid : null,
    recommendedMarkedAt: payload.isRecommended ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  });
  await recordAuditEvent({
    actorUid: payload.adminUid,
    actorRole: "admin",
    action: payload.isRecommended ? "business_recommended" : "business_recommendation_removed",
    targetType: "business_application",
    targetId: payload.businessId,
    summary: payload.isRecommended
      ? "Marked business as recommended."
      : "Removed business from recommended list.",
  });
}

export async function fetchHomePageShowcase() {
  const [settings, businesses] = await Promise.all([
    fetchHomePageSettings(),
    fetchPublicBusinessDirectory(),
  ]);
  const [products, services] = await Promise.all([
    fetchPublicDigitalProductsLite(180).catch(() => [] as DigitalProductRecord[]),
    fetchPublicBusinessServices(180).catch(() => [] as BusinessServiceRecord[]),
  ]);

  const now = Date.now();
  const newCutoff = now - settings.newBusinessWindowDays * 24 * 60 * 60 * 1000;
  const newBusinesses = businesses.filter(
    (row) => Date.parse(row.createdAt) >= newCutoff,
  );
  const recommendedBusinesses = businesses.filter((row) => Boolean(row.isRecommended));

  let selected: BusinessApplicationRecord[] = [];
  if (settings.businessMode === "new") {
    selected = newBusinesses;
  } else if (settings.businessMode === "recommended") {
    selected = recommendedBusinesses;
  } else {
    const map = new Map<string, BusinessApplicationRecord>();
    for (const row of recommendedBusinesses) map.set(row.id, row);
    for (const row of newBusinesses) {
      if (!map.has(row.id)) map.set(row.id, row);
    }
    selected = Array.from(map.values()).sort((a, b) => {
      const aRecommended = a.isRecommended ? 1 : 0;
      const bRecommended = b.isRecommended ? 1 : 0;
      if (bRecommended !== aRecommended) return bRecommended - aRecommended;
      if (b.trustScore !== a.trustScore) return b.trustScore - a.trustScore;
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
  }

  const selectedBusinesses = selected.slice(0, Math.max(1, Math.min(20, settings.businessLimit)));
  const selectedById = new Map(selectedBusinesses.map((row) => [row.id, row]));
  const selectedByOwnerUid = new Map(selectedBusinesses.map((row) => [row.ownerUid, row]));
  const selectedBySlug = new Map(selectedBusinesses.map((row) => [row.slug, row]));
  const offeringsByBusiness = new Map<string, HomeBusinessOfferingRecord[]>();

  function appendOffering(businessId: string, row: HomeBusinessOfferingRecord) {
    const existing = offeringsByBusiness.get(businessId) ?? [];
    if (existing.length >= 4) return;
    if (existing.some((entry) => entry.id === row.id && entry.kind === row.kind)) return;
    offeringsByBusiness.set(businessId, [...existing, row]);
  }

  for (const row of products) {
    const business =
      (row.ownerBusinessSlug ? selectedBySlug.get(row.ownerBusinessSlug) : null) ??
      selectedByOwnerUid.get(row.ownerUid) ??
      null;
    if (!business || !selectedById.has(business.id)) continue;
    appendOffering(business.id, {
      id: row.id,
      kind: "product",
      title: row.title,
      category: row.category,
      priceLabel: `INR ${row.pricingPlans[0]?.price ?? row.price}`,
      href: `/products/${row.uniqueLinkSlug}`,
    });
  }

  for (const row of services) {
    const business =
      (row.ownerBusinessSlug ? selectedBySlug.get(row.ownerBusinessSlug) : null) ??
      selectedByOwnerUid.get(row.ownerUid) ??
      null;
    if (!business || !selectedById.has(business.id)) continue;
    appendOffering(business.id, {
      id: row.id,
      kind: "service",
      title: row.title,
      category: row.category,
      priceLabel: `${row.currency} ${row.startingPrice}`,
      href: row.ownerBusinessSlug
        ? `/business/${row.ownerBusinessSlug}#services`
        : "/directory",
    });
  }

  return {
    settings,
    businesses: selectedBusinesses,
    offeringsByBusiness: Object.fromEntries(offeringsByBusiness.entries()),
  } satisfies HomePageShowcaseRecord;
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

function mapBusinessQuestionThread(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    businessId: String(data.businessId ?? ""),
    businessSlug: String(data.businessSlug ?? ""),
    businessName: String(data.businessName ?? ""),
    ownerUid: String(data.ownerUid ?? ""),
    customerUid: String(data.customerUid ?? ""),
    customerName: String(data.customerName ?? "Customer"),
    customerEmail: String(data.customerEmail ?? ""),
    title: String(data.title ?? ""),
    mode: data.mode === "private" ? "private" : "public",
    participantUids: Array.isArray(data.participantUids)
      ? (data.participantUids as string[])
      : [],
    status: data.status === "closed" ? "closed" : "open",
    lastMessage: String(data.lastMessage ?? ""),
    lastMessageByUid: String(data.lastMessageByUid ?? ""),
    messagesCount: Number(data.messagesCount ?? 0),
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
  } satisfies BusinessQuestionThreadRecord;
}

function mapBusinessQuestionMessage(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    senderUid: String(data.senderUid ?? ""),
    senderName: String(data.senderName ?? "User"),
    senderRole: data.senderRole === "business_owner" ? "business_owner" : "customer",
    text: String(data.text ?? ""),
    createdAt: toISODate(data.createdAt),
  } satisfies BusinessQuestionMessageRecord;
}

function canViewQuestionThread(thread: BusinessQuestionThreadRecord, viewerUid?: string) {
  if (thread.mode === "public") return true;
  if (!viewerUid) return false;
  return (
    thread.ownerUid === viewerUid ||
    thread.customerUid === viewerUid ||
    thread.participantUids.includes(viewerUid)
  );
}

export async function fetchBusinessQuestionThreads(payload: {
  businessId: string;
  viewerUid?: string;
  limitRows?: number;
}) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "businessApplications", payload.businessId, "questions"),
      limit(Math.max(1, Math.min(300, Math.round(payload.limitRows ?? 200)))),
    ),
  );
  const rows = snapshots.docs
    .map((snapshot) => mapBusinessQuestionThread(snapshot.id, snapshot.data()))
    .filter((row) => canViewQuestionThread(row, payload.viewerUid))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return rows;
}

export async function fetchBusinessQuestionMessages(payload: {
  businessId: string;
  threadId: string;
  viewerUid?: string;
}) {
  const database = getDb();
  const threadRef = doc(
    database,
    "businessApplications",
    payload.businessId,
    "questions",
    payload.threadId,
  );
  const threadSnapshot = await getDoc(threadRef);
  if (!threadSnapshot.exists()) return [] as BusinessQuestionMessageRecord[];
  const thread = mapBusinessQuestionThread(threadSnapshot.id, threadSnapshot.data());
  if (!canViewQuestionThread(thread, payload.viewerUid)) {
    throw new Error("You are not allowed to read this conversation.");
  }
  const snapshots = await getDocs(
    query(
      collection(
        database,
        "businessApplications",
        payload.businessId,
        "questions",
        payload.threadId,
        "messages",
      ),
      orderBy("createdAt", "asc"),
      limit(500),
    ),
  );
  return snapshots.docs.map((snapshot) => mapBusinessQuestionMessage(snapshot.id, snapshot.data()));
}

export async function createBusinessQuestionThread(payload: {
  businessId: string;
  customerUid: string;
  customerName: string;
  customerEmail: string;
  title: string;
  text: string;
}) {
  const database = getDb();
  const business = await fetchBusinessApplicationById(payload.businessId);
  if (!business || business.status !== "approved") {
    throw new Error("Business listing not found.");
  }
  const title = payload.title.trim();
  const text = payload.text.trim();
  if (title.length < 3) {
    throw new Error("Question title should be at least 3 characters.");
  }
  if (text.length < 6) {
    throw new Error("Question message should be at least 6 characters.");
  }
  const mode: BusinessQuestionConversationMode =
    business.questionConversationMode === "private" ? "private" : "public";
  const threadRef = await addDoc(
    collection(database, "businessApplications", business.id, "questions"),
    {
      businessId: business.id,
      businessSlug: business.slug,
      businessName: business.businessName,
      ownerUid: business.ownerUid,
      customerUid: payload.customerUid,
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      title,
      mode,
      participantUids: [payload.customerUid, business.ownerUid],
      status: "open",
      lastMessage: text,
      lastMessageByUid: payload.customerUid,
      messagesCount: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
  );
  await addDoc(
    collection(
      database,
      "businessApplications",
      business.id,
      "questions",
      threadRef.id,
      "messages",
    ),
    {
      senderUid: payload.customerUid,
      senderName: payload.customerName,
      senderRole: "customer",
      text,
      createdAt: serverTimestamp(),
    },
  );
  return {
    threadId: threadRef.id,
    mode,
  };
}

export async function sendBusinessQuestionMessage(payload: {
  businessId: string;
  threadId: string;
  senderUid: string;
  senderName: string;
  text: string;
}) {
  const database = getDb();
  const threadRef = doc(
    database,
    "businessApplications",
    payload.businessId,
    "questions",
    payload.threadId,
  );
  const threadSnapshot = await getDoc(threadRef);
  if (!threadSnapshot.exists()) {
    throw new Error("Conversation not found.");
  }
  const thread = mapBusinessQuestionThread(threadSnapshot.id, threadSnapshot.data());
  if (
    payload.senderUid !== thread.customerUid &&
    payload.senderUid !== thread.ownerUid &&
    !thread.participantUids.includes(payload.senderUid)
  ) {
    throw new Error("You are not allowed to send message in this conversation.");
  }
  const text = payload.text.trim();
  if (text.length < 1) {
    throw new Error("Message cannot be empty.");
  }
  await addDoc(
    collection(
      database,
      "businessApplications",
      payload.businessId,
      "questions",
      payload.threadId,
      "messages",
    ),
    {
      senderUid: payload.senderUid,
      senderName: payload.senderName,
      senderRole: payload.senderUid === thread.ownerUid ? "business_owner" : "customer",
      text,
      createdAt: serverTimestamp(),
    },
  );
  await updateDoc(threadRef, {
    lastMessage: text,
    lastMessageByUid: payload.senderUid,
    messagesCount: increment(1),
    updatedAt: serverTimestamp(),
  });
}

export async function updateBusinessQuestionConversationMode(payload: {
  ownerUid: string;
  mode: BusinessQuestionConversationMode;
}) {
  const database = getDb();
  const business = await fetchPrimaryBusinessByOwner(payload.ownerUid);
  if (!business) {
    throw new Error("Business profile not found.");
  }
  await updateDoc(doc(database, "businessApplications", business.id), {
    questionConversationMode: payload.mode,
    updatedAt: serverTimestamp(),
  });
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

export async function recordTrustBadgeWidgetEvent(payload: {
  businessId: string;
  eventType: TrustBadgeWidgetEventType;
}) {
  const business = await fetchBusinessApplicationById(payload.businessId);
  if (!business || business.status !== "approved") {
    return false;
  }
  const database = getDb();
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);
  const statRef = doc(database, "trustBadgeWidgetDailyStats", `${business.id}_${dateKey}`);
  const impressionInc = payload.eventType === "impression" ? 1 : 0;
  const clickInc = payload.eventType === "click" ? 1 : 0;

  await runTransaction(database, async (transaction) => {
    const snapshot = await transaction.get(statRef);
    if (!snapshot.exists()) {
      transaction.set(statRef, {
        businessId: business.id,
        ownerUid: business.ownerUid,
        businessName: business.businessName,
        dateKey,
        impressions: impressionInc,
        clicks: clickInc,
        lastEventAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return;
    }

    const current = snapshot.data();
    transaction.update(statRef, {
      impressions: Math.max(0, Number(current.impressions ?? 0) + impressionInc),
      clicks: Math.max(0, Number(current.clicks ?? 0) + clickInc),
      lastEventAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  return true;
}

export async function fetchTrustBadgeWidgetSummaryByOwner(
  ownerUid: string,
  days = 30,
): Promise<TrustBadgeWidgetSummaryRecord | null> {
  const badge = await fetchOwnedBusinessTrustBadge(ownerUid);
  if (!badge) return null;

  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "trustBadgeWidgetDailyStats"),
      where("businessId", "==", badge.businessId),
      limit(540),
    ),
  );

  const allRows = snapshots.docs
    .map((snapshot) => mapTrustBadgeWidgetDailyStat(snapshot.id, snapshot.data()))
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));

  const limitedDays = Math.max(1, Math.min(365, Math.round(days)));
  const daily = allRows.slice(0, limitedDays);
  const totalImpressions = allRows.reduce((sum, row) => sum + row.impressions, 0);
  const totalClicks = allRows.reduce((sum, row) => sum + row.clicks, 0);
  const ctrPercent =
    totalImpressions > 0 ? Number(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0;
  const lastEventAt = allRows
    .map((row) => Date.parse(row.lastEventAt))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0];

  return {
    businessId: badge.businessId,
    businessName: badge.businessName,
    totalImpressions,
    totalClicks,
    ctrPercent,
    lastEventAt: Number.isFinite(lastEventAt)
      ? new Date(lastEventAt).toISOString()
      : undefined,
    daily,
  } satisfies TrustBadgeWidgetSummaryRecord;
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
  publicId?: string;
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
    roleSelectionCompleted: Boolean(data.roleSelectionCompleted),
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
    query(collection(database, "userLookup"), where("emailNormalized", "==", normalized), limit(1)),
  );
  const firstNormalized = byNormalized.docs[0];
  if (firstNormalized) {
    const data = firstNormalized.data();
    return {
      uid: firstNormalized.id,
      displayName: String(data.displayName ?? "User"),
      email: String(data.email ?? normalized),
      role: String(data.role ?? "customer"),
      publicId: data.publicId ? String(data.publicId) : undefined,
    } satisfies UserLookupResult;
  }

  const byLowerEmail = await getDocs(
    query(collection(database, "userLookup"), where("email", "==", normalized), limit(1)),
  );
  const firstLowerEmail = byLowerEmail.docs[0];
  if (firstLowerEmail) {
    const data = firstLowerEmail.data();
    return {
      uid: firstLowerEmail.id,
      displayName: String(data.displayName ?? "User"),
      email: String(data.email ?? normalized),
      role: String(data.role ?? "customer"),
      publicId: data.publicId ? String(data.publicId) : undefined,
    } satisfies UserLookupResult;
  }

  const byRawEmail = await getDocs(
    query(collection(database, "userLookup"), where("email", "==", email), limit(1)),
  );
  const firstRawEmail = byRawEmail.docs[0];
  if (!firstRawEmail) return null;
  const data = firstRawEmail.data();
  return {
    uid: firstRawEmail.id,
    displayName: String(data.displayName ?? "User"),
    email: String(data.email ?? email),
    role: String(data.role ?? "customer"),
    publicId: data.publicId ? String(data.publicId) : undefined,
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

export async function fetchBusinessByPublicKey(publicBusinessKey: string) {
  const key = publicBusinessKey.trim().toUpperCase();
  if (!key) return null;
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "businessApplications"),
      where("publicBusinessKey", "==", key),
      limit(1),
    ),
  );
  const row = snapshots.docs[0];
  if (!row) return null;
  return mapBusinessApplication(row.id, row.data());
}

async function attachEmployeeToBusiness(payload: {
  business: BusinessApplicationRecord;
  ownerUid: string;
  ownerName: string;
  employee: UserLookupResult;
  title?: string;
}) {
  const database = getDb();
  const employeeRef = doc(
    database,
    "businessApplications",
    payload.business.id,
    "employees",
    payload.employee.uid,
  );
  const existing = await getDoc(employeeRef);
  if (existing.exists()) {
    return false;
  }
  const employeeTitle = payload.title?.trim() || "Team member";
  const employeePublicId =
    payload.employee.publicId ||
    (await getUserIdentityProfileOrThrow(payload.employee.uid)).publicId;
  await setDoc(employeeRef, {
    employeeUid: payload.employee.uid,
    employeeName: payload.employee.displayName,
    employeeEmail: payload.employee.email,
    title: employeeTitle,
    addedByUid: payload.ownerUid,
    addedByName: payload.ownerName,
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(database, "users", payload.employee.uid, "employments", payload.business.id), {
    businessId: payload.business.id,
    businessName: payload.business.businessName,
    businessSlug: payload.business.slug,
    ownerUid: payload.business.ownerUid,
    ownerName: payload.ownerName,
    title: employeeTitle,
    assignedAt: serverTimestamp(),
  });

  await updateDoc(doc(database, "users", payload.employee.uid), {
    role: "employee",
    roleSelectionCompleted: true,
    updatedAt: serverTimestamp(),
  });
  await syncUserLookupRecord({
    uid: payload.employee.uid,
    email: payload.employee.email,
    displayName: payload.employee.displayName,
    publicId: employeePublicId,
    role: "employee",
  });
  return true;
}

function mapEmployeeAccessRequest(
  snapshotId: string,
  data: Record<string, unknown>,
): EmployeeAccessRequestRecord {
  return {
    employeeUid: snapshotId,
    employeeName: String(data.employeeName ?? "Employee"),
    employeeEmail: String(data.employeeEmail ?? ""),
    businessId: String(data.businessId ?? ""),
    businessName: String(data.businessName ?? ""),
    businessSlug: String(data.businessSlug ?? ""),
    businessPublicKey: String(data.businessPublicKey ?? ""),
    status: (data.status as EmployeeAccessRequestStatus) ?? "pending",
    note: data.note ? String(data.note) : undefined,
    autoApproved: Boolean(data.autoApproved),
    reviewedByUid: data.reviewedByUid ? String(data.reviewedByUid) : undefined,
    reviewedByName: data.reviewedByName ? String(data.reviewedByName) : undefined,
    requestedAt: toISODate(data.requestedAt),
    updatedAt: toISODate(data.updatedAt),
  };
}

export async function regenerateBusinessEmployeeJoinKey(ownerUid: string) {
  const database = getDb();
  const business = await fetchPrimaryBusinessByOwner(ownerUid);
  if (!business) throw new Error("Business profile not found.");
  const nextKey = generateBusinessEmployeeJoinKey();
  await updateDoc(doc(database, "businessApplications", business.id), {
    employeeJoinKey: nextKey,
    updatedAt: serverTimestamp(),
  });
  return nextKey;
}

export async function requestEmployeeBusinessAccess(payload: {
  employeeUid: string;
  employeeName: string;
  employeeEmail: string;
  businessPublicKey: string;
  privateJoinKey?: string;
  title?: string;
}) {
  const database = getDb();
  const business = await fetchBusinessByPublicKey(payload.businessPublicKey);
  if (!business || business.status !== "approved") {
    throw new Error("Business not found with this key.");
  }
  if (business.ownerUid === payload.employeeUid) {
    throw new Error("Business owner cannot request as employee.");
  }

  const employeeProfile = await getUserIdentityProfileOrThrow(payload.employeeUid);
  const employee: UserLookupResult = {
    uid: employeeProfile.uid,
    email: employeeProfile.email,
    displayName: employeeProfile.displayName,
    role: employeeProfile.role,
    publicId: employeeProfile.publicId,
  };
  const requestRef = doc(
    database,
    "businessApplications",
    business.id,
    "employeeRequests",
    payload.employeeUid,
  );

  const providedKey = payload.privateJoinKey?.trim() ?? "";
  const canAutoApprove =
    Boolean(business.employeeJoinKey) && providedKey === String(business.employeeJoinKey);

  if (canAutoApprove) {
    await attachEmployeeToBusiness({
      business,
      ownerUid: business.ownerUid,
      ownerName: business.businessName,
      employee,
      title: payload.title,
    });
    await setDoc(
      requestRef,
      {
        employeeUid: payload.employeeUid,
        employeeName: payload.employeeName,
        employeeEmail: payload.employeeEmail,
        businessId: business.id,
        businessName: business.businessName,
        businessSlug: business.slug,
        businessPublicKey: business.publicBusinessKey,
        status: "auto_approved",
        note: "Auto-approved using valid private business key.",
        autoApproved: true,
        reviewedByUid: business.ownerUid,
        reviewedByName: business.businessName,
        requestedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    return {
      status: "auto_approved" as const,
      businessName: business.businessName,
      businessSlug: business.slug,
    };
  }

  await setDoc(
    requestRef,
    {
      employeeUid: payload.employeeUid,
      employeeName: payload.employeeName,
      employeeEmail: payload.employeeEmail,
      businessId: business.id,
      businessName: business.businessName,
      businessSlug: business.slug,
      businessPublicKey: business.publicBusinessKey,
      status: "pending",
      note: "Awaiting business owner review.",
      autoApproved: false,
      requestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await updateDoc(doc(database, "users", payload.employeeUid), {
    role: "employee",
    roleSelectionCompleted: true,
    updatedAt: serverTimestamp(),
  });
  await syncUserLookupRecord({
    uid: payload.employeeUid,
    email: payload.employeeEmail,
    displayName: payload.employeeName,
    publicId: employeeProfile.publicId,
    role: "employee",
  });
  return {
    status: "pending" as const,
    businessName: business.businessName,
    businessSlug: business.slug,
  };
}

export async function fetchBusinessEmployeeRequests(ownerUid: string) {
  const database = getDb();
  const business = await fetchPrimaryBusinessByOwner(ownerUid);
  if (!business) return [];
  const snapshots = await getDocs(
    query(
      collection(database, "businessApplications", business.id, "employeeRequests"),
      limit(300),
    ),
  );
  return snapshots.docs
    .map((snapshot) => mapEmployeeAccessRequest(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function reviewBusinessEmployeeRequest(payload: {
  ownerUid: string;
  ownerName: string;
  employeeUid: string;
  action: "approve" | "hold" | "decline";
  note?: string;
  title?: string;
}) {
  const database = getDb();
  const business = await fetchPrimaryBusinessByOwner(payload.ownerUid);
  if (!business) throw new Error("Business profile not found.");

  const requestRef = doc(
    database,
    "businessApplications",
    business.id,
    "employeeRequests",
    payload.employeeUid,
  );
  const requestSnapshot = await getDoc(requestRef);
  if (!requestSnapshot.exists()) {
    throw new Error("Employee request not found.");
  }
  const request = mapEmployeeAccessRequest(requestSnapshot.id, requestSnapshot.data());
  if (payload.action === "approve") {
    const employee = await findUserByEmail(request.employeeEmail);
    if (!employee) {
      throw new Error("Employee account no longer exists.");
    }
    await attachEmployeeToBusiness({
      business,
      ownerUid: payload.ownerUid,
      ownerName: payload.ownerName,
      employee,
      title: payload.title,
    });
    await updateDoc(requestRef, {
      status: "approved",
      note: payload.note?.trim() || "Approved by business owner.",
      autoApproved: false,
      reviewedByUid: payload.ownerUid,
      reviewedByName: payload.ownerName,
      updatedAt: serverTimestamp(),
    });
    return;
  }
  await updateDoc(requestRef, {
    status: payload.action === "hold" ? "hold" : "declined",
    note:
      payload.note?.trim() ||
      (payload.action === "hold"
        ? "Request placed on hold."
        : "Request declined by business owner."),
    reviewedByUid: payload.ownerUid,
    reviewedByName: payload.ownerName,
    updatedAt: serverTimestamp(),
  });
}

export async function addBusinessEmployee(payload: {
  ownerUid: string;
  ownerName: string;
  employeeEmail: string;
  title?: string;
}) {
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

  const attached = await attachEmployeeToBusiness({
    business,
    ownerUid: payload.ownerUid,
    ownerName: payload.ownerName,
    employee,
    title: payload.title,
  });
  if (!attached) {
    throw new Error("This account is already added as an employee.");
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

export async function regenerateCurrentUserPublicId(userUid: string) {
  const database = getDb();
  const profile = await getUserIdentityProfileOrThrow(userUid);
  const nextPublicId = await generateUniqueUserPublicId();
  await updateDoc(doc(database, "users", userUid), {
    publicId: nextPublicId,
    updatedAt: serverTimestamp(),
  });
  await syncUserLookupRecord({
    uid: userUid,
    email: profile.email,
    displayName: profile.displayName,
    publicId: nextPublicId,
    role: profile.role,
  });
  return nextPublicId;
}

export async function updateCurrentUserRoleSelection(payload: {
  userUid: string;
  role: "customer" | "employee" | "business_owner";
}) {
  const profile = await getUserIdentityProfileOrThrow(payload.userUid);
  const database = getDb();
  const userRef = doc(database, "users", payload.userUid);
  await updateDoc(userRef, {
    role: payload.role,
    roleSelectionCompleted: true,
    updatedAt: serverTimestamp(),
  });
  await syncUserLookupRecord({
    uid: payload.userUid,
    email: profile.email,
    displayName: profile.displayName,
    publicId: profile.publicId,
    role: payload.role,
  });
}

export async function fetchCurrentUserNavigationContext(userUid: string) {
  const database = getDb();
  const [profile, adminSnapshot] = await Promise.all([
    getUserIdentityProfileOrThrow(userUid),
    getDoc(doc(database, "admins", userUid)),
  ]);
  return {
    role: profile.role,
    roleSelectionCompleted: profile.roleSelectionCompleted,
    isAdmin: adminSnapshot.exists() && Boolean(adminSnapshot.data().active),
  };
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

function userSecurityRef(database: ReturnType<typeof getDb>, userUid: string) {
  return doc(database, "userSecurity", userUid);
}

async function readAuthenticatorState(userUid: string) {
  const database = getDb();
  const securitySnapshot = await getDoc(userSecurityRef(database, userUid));
  if (securitySnapshot.exists()) {
    return parseAuthenticatorData(securitySnapshot.data());
  }
  const userSnapshot = await getDoc(doc(database, "users", userUid));
  if (!userSnapshot.exists()) {
    throw new Error("User profile not found.");
  }
  return parseAuthenticatorData(userSnapshot.data());
}

async function writeAuthenticatorState(
  payload: {
    userUid: string;
    authenticator: Record<string, unknown>;
  },
) {
  const database = getDb();
  await setDoc(
    userSecurityRef(database, payload.userUid),
    {
      authenticator: payload.authenticator,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await setDoc(
    doc(database, "users", payload.userUid),
    {
      authenticator: deleteField(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function fetchAuthenticatorSettings(userUid: string) {
  const state = await readAuthenticatorState(userUid);
  return {
    enabled: state.enabled,
    hasPendingEnrollment: Boolean(state.pendingSecret),
    backupCodesRemaining: state.backupCodes.length,
    enrolledAt: state.enrolledAt,
    updatedAt: state.updatedAt,
  } satisfies AuthenticatorSettingsRecord;
}

export async function initiateAuthenticatorEnrollment(userUid: string) {
  const profile = await getUserIdentityProfileOrThrow(userUid);
  const secret = generateRandomBase32Secret(32);
  const backupCodes = generateBackupCodes(8, 10);
  const accountLabel = profile.email || profile.publicId || userUid;
  const otpauthUri = buildOtpAuthUri({
    secret,
    accountLabel,
    issuer: "Business Verifier",
  });

  await writeAuthenticatorState({
    userUid,
    authenticator: {
      enabled: false,
      pendingSecret: secret,
      pendingBackupCodes: backupCodes,
      updatedAt: serverTimestamp(),
    },
  });

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
  const auth = await readAuthenticatorState(payload.userUid);
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

  await writeAuthenticatorState({
    userUid: payload.userUid,
    authenticator: {
      enabled: true,
      secret: auth.pendingSecret,
      backupCodes: auth.pendingBackupCodes,
      pendingSecret: null,
      pendingBackupCodes: [],
      enrolledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
  });
}

export async function verifyAuthenticatorChallenge(payload: {
  userUid: string;
  code: string;
}) {
  const auth = await readAuthenticatorState(payload.userUid);
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
    await writeAuthenticatorState({
      userUid: payload.userUid,
      authenticator: {
        ...auth,
        backupCodes: remaining,
        updatedAt: serverTimestamp(),
      },
    });
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
  const settings = await fetchAuthenticatorSettings(payload.userUid);
  if (!settings.enabled) return;
  await ensureAuthenticatorFactor({ userUid: payload.userUid, code: payload.code });

  await writeAuthenticatorState({
    userUid: payload.userUid,
    authenticator: {
      enabled: false,
      secret: null,
      backupCodes: [],
      pendingSecret: null,
      pendingBackupCodes: [],
      updatedAt: serverTimestamp(),
    },
  });
}

export async function regenerateAuthenticatorBackupCodes(payload: {
  userUid: string;
  code: string;
}) {
  const auth = await readAuthenticatorState(payload.userUid);
  if (!auth.enabled || !auth.secret) {
    throw new Error("Authenticator is not enabled.");
  }

  await ensureAuthenticatorFactor({ userUid: payload.userUid, code: payload.code });
  const nextCodes = generateBackupCodes(8, 10);
  await writeAuthenticatorState({
    userUid: payload.userUid,
    authenticator: {
      ...auth,
      backupCodes: nextCodes,
      updatedAt: serverTimestamp(),
    },
  });
  return nextCodes;
}

export async function createSupportTicket(input: SupportTicketInput) {
  const database = getDb();
  const participantUids = [input.customerUid];
  let normalizedBusinessName = input.businessName;
  if (input.businessId) {
    const businessSnapshot = await getDoc(
      doc(database, "businessApplications", input.businessId),
    );
    if (businessSnapshot.exists()) {
      const businessData = businessSnapshot.data();
      if (businessData.ownerUid) {
        participantUids.push(String(businessData.ownerUid));
      }
      if (businessData.businessName) {
        normalizedBusinessName = String(businessData.businessName);
      }
    }
  }
  const ticketRef = await addDoc(collection(database, "supportTickets"), {
    ...input,
    businessName: normalizedBusinessName,
    status: "open",
    participantUids: Array.from(new Set(participantUids)),
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

async function createSupportTicketFromReviewSignal(payload: {
  reviewId: string;
  customerUid: string;
  customerName: string;
  customerEmail: string;
  businessName: string;
  productTitle: string;
  comment: string;
  evidenceUrls: string[];
}) {
  const database = getDb();
  const existing = await getDocs(
    query(
      collection(database, "supportTickets"),
      where("customerUid", "==", payload.customerUid),
      where("sourceType", "==", "product_review"),
      where("sourceId", "==", payload.reviewId),
      limit(1),
    ),
  );
  if (!existing.empty) {
    return existing.docs[0].id;
  }

  return createSupportTicket({
    customerUid: payload.customerUid,
    customerName: payload.customerName,
    customerEmail: payload.customerEmail,
    businessName: payload.businessName,
    title: `Review dispute: ${payload.productTitle}`,
    description: payload.comment,
    priority: "high",
    expectedOutcome: "Business clarification or refund if unresolved",
    evidenceUrls: payload.evidenceUrls,
    sourceType: "product_review",
    sourceId: payload.reviewId,
    autoGenerated: true,
  });
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
  stockAvailable?: number;
  pricingPlans?: DigitalProductPricingPlanInput[];
}

export type DigitalProductPricingCycle = "one_time" | "monthly" | "yearly";

export interface DigitalProductPricingPlanInput {
  key?: string;
  name: string;
  billingCycle: DigitalProductPricingCycle;
  price: number;
}

export interface DigitalProductPricingPlanRecord {
  key: string;
  name: string;
  billingCycle: DigitalProductPricingCycle;
  price: number;
}

export interface DigitalProductRecord extends DigitalProductInput {
  id: string;
  uniqueLinkSlug: string;
  pricingPlans: DigitalProductPricingPlanRecord[];
  favoritesCount: number;
  salesCount: number;
  refundCount: number;
  reviewsCount: number;
  averageRating: number;
  ownerTrustScore: number;
  ownerCertificateSerial?: string;
  ownerBusinessSlug?: string;
  externalSource?: CatalogIntegrationProvider;
  externalProductId?: string;
  stockAvailable?: number;
  externalStoreUrl?: string;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type BusinessServiceMode = "online" | "offline" | "hybrid";
export type BusinessServiceDeliveryMode = "remote" | "onsite" | "both";

export interface BusinessServiceInput {
  ownerUid: string;
  ownerName: string;
  title: string;
  description: string;
  category: string;
  startingPrice: number;
  currency: "INR" | "USD";
  serviceMode: BusinessServiceMode;
  deliveryMode: BusinessServiceDeliveryMode;
  stockAvailable?: number;
}

export interface BusinessServiceRecord extends BusinessServiceInput {
  id: string;
  uniqueLinkSlug: string;
  ownerBusinessSlug?: string;
  ownerTrustScore: number;
  ownerCertificateSerial?: string;
  externalSource?: CatalogIntegrationProvider;
  externalProductId?: string;
  stockAvailable?: number;
  externalStoreUrl?: string;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type CatalogIntegrationProvider = "shopify" | "woocommerce";
export type CatalogIntegrationStatus = "active" | "disabled";

export interface CatalogIntegrationRecord {
  id: string;
  ownerUid: string;
  ownerName: string;
  provider: CatalogIntegrationProvider;
  label: string;
  storeUrl: string;
  status: CatalogIntegrationStatus;
  syncEveryHours: number;
  shopifyAccessToken?: string;
  shopifyApiVersion?: string;
  wooConsumerKey?: string;
  wooConsumerSecret?: string;
  lastSyncedAt?: string;
  lastSyncStatus?: "success" | "failed";
  lastSyncMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogSyncRunRecord {
  id: string;
  integrationId: string;
  ownerUid: string;
  provider: CatalogIntegrationProvider;
  status: "success" | "failed";
  importedProducts: number;
  importedServices: number;
  updatedProducts: number;
  updatedServices: number;
  message: string;
  trigger: "manual" | "scheduled";
  createdAt: string;
}

function sanitizePricingPlanKey(value: string) {
  const key = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return key || `plan-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePricingPlans(
  rawPlans: unknown,
  fallbackPrice: number,
): DigitalProductPricingPlanRecord[] {
  const fallback = Math.max(1, Math.round(fallbackPrice));
  if (!Array.isArray(rawPlans) || !rawPlans.length) {
    return [
      {
        key: "standard",
        name: "Standard",
        billingCycle: "one_time",
        price: fallback,
      },
    ];
  }
  const plans = rawPlans
    .map((raw, index) => {
      const row = raw as Record<string, unknown>;
      const name = String(row.name ?? "").trim();
      const price = Number(row.price ?? 0);
      const cycleRaw = String(row.billingCycle ?? "one_time").trim().toLowerCase();
      const billingCycle: DigitalProductPricingCycle =
        cycleRaw === "monthly" || cycleRaw === "yearly" ? cycleRaw : "one_time";
      if (!name || !Number.isFinite(price) || price <= 0) return null;
      const keySeed = String((row.key ?? name) || `plan-${index + 1}`);
      return {
        key: sanitizePricingPlanKey(keySeed),
        name,
        billingCycle,
        price: Math.max(1, Math.round(price)),
      } satisfies DigitalProductPricingPlanRecord;
    })
    .filter((row): row is DigitalProductPricingPlanRecord => Boolean(row));

  if (!plans.length) {
    return [
      {
        key: "standard",
        name: "Standard",
        billingCycle: "one_time",
        price: fallback,
      },
    ];
  }
  const deduped = new Map<string, DigitalProductPricingPlanRecord>();
  for (const plan of plans) {
    if (!deduped.has(plan.key)) {
      deduped.set(plan.key, plan);
    }
  }
  return Array.from(deduped.values());
}

export function resolveProductPricingPlan(
  product: Pick<DigitalProductRecord, "pricingPlans" | "price">,
  planKey?: string,
) {
  const plans = normalizePricingPlans(product.pricingPlans, product.price);
  if (!planKey?.trim()) return plans[0];
  const match = plans.find((plan) => plan.key === planKey.trim().toLowerCase());
  return match ?? plans[0];
}

function mapDigitalProduct(snapshotId: string, data: Record<string, unknown>) {
  const price = Number(data.price ?? 0);
  const pricingPlans = normalizePricingPlans(data.pricingPlans, price);
  return {
    id: snapshotId,
    ownerUid: String(data.ownerUid ?? ""),
    ownerName: String(data.ownerName ?? "Business"),
    title: String(data.title ?? ""),
    description: String(data.description ?? ""),
    price,
    noRefund: Boolean(data.noRefund),
    category: String(data.category ?? "General"),
    uniqueLinkSlug: String(data.uniqueLinkSlug ?? snapshotId),
    pricingPlans,
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
    externalSource:
      data.externalSource === "woocommerce" || data.externalSource === "shopify"
        ? (data.externalSource as CatalogIntegrationProvider)
        : undefined,
    externalProductId: data.externalProductId ? String(data.externalProductId) : undefined,
    stockAvailable:
      data.stockAvailable === null || data.stockAvailable === undefined
        ? undefined
        : Number(data.stockAvailable),
    externalStoreUrl: data.externalStoreUrl ? String(data.externalStoreUrl) : undefined,
    lastSyncedAt: data.lastSyncedAt ? String(data.lastSyncedAt) : undefined,
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
  } satisfies DigitalProductRecord;
}

function mapBusinessService(snapshotId: string, data: Record<string, unknown>) {
  const rawCurrency = String(data.currency ?? "INR").trim().toUpperCase();
  const currency: "INR" | "USD" = rawCurrency === "USD" ? "USD" : "INR";
  const rawServiceMode = String(data.serviceMode ?? "online").trim().toLowerCase();
  const serviceMode: BusinessServiceMode =
    rawServiceMode === "offline" || rawServiceMode === "hybrid"
      ? rawServiceMode
      : "online";
  const rawDelivery = String(data.deliveryMode ?? "remote").trim().toLowerCase();
  const deliveryMode: BusinessServiceDeliveryMode =
    rawDelivery === "onsite" || rawDelivery === "both" ? rawDelivery : "remote";

  return {
    id: snapshotId,
    ownerUid: String(data.ownerUid ?? ""),
    ownerName: String(data.ownerName ?? "Business"),
    title: String(data.title ?? ""),
    description: String(data.description ?? ""),
    category: String(data.category ?? "General"),
    startingPrice: Math.max(1, Math.round(Number(data.startingPrice ?? 0))),
    currency,
    serviceMode,
    deliveryMode,
    uniqueLinkSlug: String(data.uniqueLinkSlug ?? snapshotId),
    ownerBusinessSlug: data.ownerBusinessSlug ? String(data.ownerBusinessSlug) : undefined,
    ownerTrustScore: Number(data.ownerTrustScore ?? 0),
    ownerCertificateSerial: data.ownerCertificateSerial
      ? String(data.ownerCertificateSerial)
      : undefined,
    externalSource:
      data.externalSource === "woocommerce" || data.externalSource === "shopify"
        ? (data.externalSource as CatalogIntegrationProvider)
        : undefined,
    externalProductId: data.externalProductId ? String(data.externalProductId) : undefined,
    stockAvailable:
      data.stockAvailable === null || data.stockAvailable === undefined
        ? undefined
        : Number(data.stockAvailable),
    externalStoreUrl: data.externalStoreUrl ? String(data.externalStoreUrl) : undefined,
    lastSyncedAt: data.lastSyncedAt ? String(data.lastSyncedAt) : undefined,
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
  } satisfies BusinessServiceRecord;
}

type ExternalCatalogItem = {
  externalId: string;
  title: string;
  description: string;
  category: string;
  price: number;
  currency: "INR" | "USD";
  stock: number;
  sourceUrl?: string;
};

function normalizeStoreUrl(raw: string) {
  const input = raw.trim();
  if (!input) return "";
  const normalized = input.startsWith("http://") || input.startsWith("https://")
    ? input
    : `https://${input}`;
  try {
    const url = new URL(normalized);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

function mapCatalogIntegration(snapshotId: string, data: Record<string, unknown>) {
  const provider = String(data.provider ?? "shopify").trim().toLowerCase();
  return {
    id: snapshotId,
    ownerUid: String(data.ownerUid ?? ""),
    ownerName: String(data.ownerName ?? "Business"),
    provider: provider === "woocommerce" ? "woocommerce" : "shopify",
    label: String(data.label ?? "Catalog Integration"),
    storeUrl: String(data.storeUrl ?? ""),
    status: String(data.status ?? "active") === "disabled" ? "disabled" : "active",
    syncEveryHours: Math.max(6, Math.min(168, Number(data.syncEveryHours ?? 24))),
    shopifyAccessToken: data.shopifyAccessToken ? String(data.shopifyAccessToken) : undefined,
    shopifyApiVersion: data.shopifyApiVersion ? String(data.shopifyApiVersion) : undefined,
    wooConsumerKey: data.wooConsumerKey ? String(data.wooConsumerKey) : undefined,
    wooConsumerSecret: data.wooConsumerSecret ? String(data.wooConsumerSecret) : undefined,
    lastSyncedAt: data.lastSyncedAt ? String(data.lastSyncedAt) : undefined,
    lastSyncStatus:
      data.lastSyncStatus === "failed" || data.lastSyncStatus === "success"
        ? (data.lastSyncStatus as "success" | "failed")
        : undefined,
    lastSyncMessage: data.lastSyncMessage ? String(data.lastSyncMessage) : undefined,
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
  } satisfies CatalogIntegrationRecord;
}

function mapCatalogSyncRun(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    integrationId: String(data.integrationId ?? ""),
    ownerUid: String(data.ownerUid ?? ""),
    provider: String(data.provider ?? "shopify") === "woocommerce" ? "woocommerce" : "shopify",
    status: data.status === "failed" ? "failed" : "success",
    importedProducts: Number(data.importedProducts ?? 0),
    importedServices: Number(data.importedServices ?? 0),
    updatedProducts: Number(data.updatedProducts ?? 0),
    updatedServices: Number(data.updatedServices ?? 0),
    message: String(data.message ?? ""),
    trigger: data.trigger === "scheduled" ? "scheduled" : "manual",
    createdAt: toISODate(data.createdAt),
  } satisfies CatalogSyncRunRecord;
}

async function fetchShopifyCatalogItems(integration: CatalogIntegrationRecord) {
  const storeUrl = normalizeStoreUrl(integration.storeUrl);
  if (!storeUrl || !integration.shopifyAccessToken) {
    throw new Error("Shopify integration credentials are incomplete.");
  }
  const apiVersion = integration.shopifyApiVersion?.trim() || "2024-10";
  const endpoint = `${storeUrl}/admin/api/${apiVersion}/products.json?limit=120`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      accept: "application/json",
      "X-Shopify-Access-Token": integration.shopifyAccessToken,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Shopify API returned ${response.status}.`);
  }
  const body = (await response.json()) as {
    products?: Array<Record<string, unknown>>;
  };
  const products = Array.isArray(body.products) ? body.products : [];
  return products.map((item) => {
    const variants = Array.isArray(item.variants) ? (item.variants as Array<Record<string, unknown>>) : [];
    const firstVariant = variants[0] ?? {};
    const price = Number(firstVariant.price ?? 0);
    const currencyRaw = String(firstVariant.currency ?? "INR").toUpperCase();
    const currency: "INR" | "USD" = currencyRaw === "USD" ? "USD" : "INR";
    const stock = variants.reduce((sum, variant) => sum + Number(variant.inventory_quantity ?? 0), 0);
    return {
      externalId: String(item.id ?? ""),
      title: String(item.title ?? "Untitled"),
      description: String(item.body_html ?? ""),
      category: String(item.product_type ?? "General"),
      price: Number.isFinite(price) && price > 0 ? price : 1,
      currency,
      stock: Number.isFinite(stock) ? Math.max(0, Math.round(stock)) : 0,
      sourceUrl: item.handle ? `${storeUrl}/products/${String(item.handle)}` : undefined,
    } satisfies ExternalCatalogItem;
  }).filter((row) => Boolean(row.externalId));
}

async function fetchWooCommerceCatalogItems(integration: CatalogIntegrationRecord) {
  const storeUrl = normalizeStoreUrl(integration.storeUrl);
  if (!storeUrl || !integration.wooConsumerKey || !integration.wooConsumerSecret) {
    throw new Error("WooCommerce integration credentials are incomplete.");
  }
  const endpoint = new URL(`${storeUrl}/wp-json/wc/v3/products`);
  endpoint.searchParams.set("per_page", "100");
  endpoint.searchParams.set("page", "1");
  endpoint.searchParams.set("consumer_key", integration.wooConsumerKey);
  endpoint.searchParams.set("consumer_secret", integration.wooConsumerSecret);
  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: {
      accept: "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`WooCommerce API returned ${response.status}.`);
  }
  const body = (await response.json()) as Array<Record<string, unknown>>;
  const products = Array.isArray(body) ? body : [];
  return products.map((item) => {
    const price = Number(item.regular_price ?? item.price ?? 0);
    const stock = Number(item.stock_quantity ?? 0);
    const categories = Array.isArray(item.categories) ? (item.categories as Array<Record<string, unknown>>) : [];
    const primaryCategory = categories[0]?.name ? String(categories[0].name) : "General";
    return {
      externalId: String(item.id ?? ""),
      title: String(item.name ?? "Untitled"),
      description: String(item.short_description ?? item.description ?? ""),
      category: primaryCategory,
      price: Number.isFinite(price) && price > 0 ? price : 1,
      currency: "INR",
      stock: Number.isFinite(stock) ? Math.max(0, Math.round(stock)) : 0,
      sourceUrl: item.permalink ? String(item.permalink) : undefined,
    } satisfies ExternalCatalogItem;
  }).filter((row) => Boolean(row.externalId));
}

function isCatalogServiceCandidate(item: ExternalCatalogItem) {
  const text = `${item.title} ${item.category}`.toLowerCase();
  return /(service|consult|support|repair|mainten|installation|training|coaching)/.test(text);
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
      const [orderSnapshotsResult, reviewSnapshotsResult] = await Promise.allSettled([
        getDocs(query(collection(database, "orders"), where("productId", "==", row.id), limit(400))),
        getDocs(
          query(collection(database, "productReviews"), where("productId", "==", row.id), limit(250)),
        ),
      ]);
      const orders =
        orderSnapshotsResult.status === "fulfilled"
          ? orderSnapshotsResult.value.docs.map((snapshot) => mapOrder(snapshot.id, snapshot.data()))
          : [];
      const salesCount =
        orders.length > 0
          ? orders.filter((order) => order.status !== "refund_requested").length
          : row.salesCount ?? 0;
      const refundCount =
        orders.length > 0
          ? orders.filter((order) => order.status === "refunded").length
          : row.refundCount ?? 0;

      const reviews =
        reviewSnapshotsResult.status === "fulfilled"
          ? reviewSnapshotsResult.value.docs
              .map((snapshot) => mapProductReview(snapshot.id, snapshot.data()))
              .filter((review) => !review.hiddenFromPublic)
          : [];
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
  const owner = await fetchPrimaryBusinessByOwner(input.ownerUid);
  const baseSlug = `${toSlug(input.title)}-${Math.random().toString(36).slice(2, 8)}`;
  const pricingPlans = normalizePricingPlans(input.pricingPlans, input.price);
  const ref = await addDoc(collection(database, "digitalProducts"), {
    ...input,
    price: pricingPlans[0].price,
    pricingPlans,
    uniqueLinkSlug: baseSlug,
    favoritesCount: 0,
    ownerBusinessSlug: owner?.slug ?? null,
    ownerTrustScore: owner?.trustScore ?? 0,
    ownerCertificateSerial: owner?.certificateSerial ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await appendInventoryLog({
    ownerUid: input.ownerUid,
    businessId: owner?.id,
    itemType: "product",
    itemId: ref.id,
    itemTitle: input.title,
    source: "manual_create",
    previousStock: undefined,
    nextStock: input.stockAvailable,
    note: "Created manually from product manager.",
  });
  return ref.id;
}

export async function createBusinessService(input: BusinessServiceInput) {
  const owner = await fetchPrimaryBusinessByOwner(input.ownerUid);
  if (!owner || owner.status !== "approved") {
    throw new Error("Approve your business profile before listing services.");
  }
  const database = getDb();
  const baseSlug = `${toSlug(input.title)}-${Math.random().toString(36).slice(2, 8)}`;
  const ref = await addDoc(collection(database, "businessServices"), {
    ...input,
    startingPrice: Math.max(1, Math.round(input.startingPrice)),
    uniqueLinkSlug: baseSlug,
    ownerBusinessSlug: owner.slug,
    ownerTrustScore: owner.trustScore,
    ownerCertificateSerial: owner.certificateSerial ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await appendInventoryLog({
    ownerUid: input.ownerUid,
    businessId: owner.id,
    itemType: "service",
    itemId: ref.id,
    itemTitle: input.title,
    source: "manual_create",
    previousStock: undefined,
    nextStock: input.stockAvailable,
    note: "Created manually from service manager.",
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

export async function fetchBusinessServicesByOwner(ownerUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "businessServices"), where("ownerUid", "==", ownerUid), limit(100)),
  );
  return snapshots.docs
    .map((snapshot) => mapBusinessService(snapshot.id, snapshot.data()))
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

export async function fetchPublicDigitalProductsLite(limitRows = 120) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "digitalProducts"),
      orderBy("createdAt", "desc"),
      limit(Math.max(1, Math.min(300, Math.round(limitRows)))),
    ),
  );
  return snapshots.docs.map((snapshot) => mapDigitalProduct(snapshot.id, snapshot.data()));
}

export async function fetchPublicBusinessServices(limitRows = 120) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "businessServices"),
      orderBy("createdAt", "desc"),
      limit(Math.max(1, Math.min(300, Math.round(limitRows)))),
    ),
  );
  return snapshots.docs.map((snapshot) => mapBusinessService(snapshot.id, snapshot.data()));
}

export async function upsertCatalogIntegration(payload: {
  ownerUid: string;
  ownerName: string;
  integrationId?: string;
  provider: CatalogIntegrationProvider;
  label: string;
  storeUrl: string;
  syncEveryHours?: number;
  status?: CatalogIntegrationStatus;
  shopifyAccessToken?: string;
  shopifyApiVersion?: string;
  wooConsumerKey?: string;
  wooConsumerSecret?: string;
}) {
  const database = getDb();
  const cleanStoreUrl = normalizeStoreUrl(payload.storeUrl);
  if (!cleanStoreUrl) {
    throw new Error("Store URL is invalid.");
  }
  const basePayload = {
    ownerUid: payload.ownerUid,
    ownerName: payload.ownerName,
    provider: payload.provider,
    label: payload.label.trim() || `${payload.provider} integration`,
    storeUrl: cleanStoreUrl,
    syncEveryHours: Math.max(6, Math.min(168, Math.round(payload.syncEveryHours ?? 24))),
    status: payload.status ?? "active",
    shopifyAccessToken: payload.shopifyAccessToken?.trim() || null,
    shopifyApiVersion: payload.shopifyApiVersion?.trim() || "2024-10",
    wooConsumerKey: payload.wooConsumerKey?.trim() || null,
    wooConsumerSecret: payload.wooConsumerSecret?.trim() || null,
    updatedAt: serverTimestamp(),
  };

  if (payload.integrationId?.trim()) {
    const ref = doc(database, "catalogIntegrations", payload.integrationId.trim());
    await setDoc(ref, basePayload, { merge: true });
    return payload.integrationId.trim();
  }
  const created = await addDoc(collection(database, "catalogIntegrations"), {
    ...basePayload,
    createdAt: serverTimestamp(),
  });
  return created.id;
}

export async function fetchCatalogIntegrationsByOwner(ownerUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "catalogIntegrations"),
      where("ownerUid", "==", ownerUid),
      limit(120),
    ),
  );
  return snapshots.docs
    .map((snapshot) => mapCatalogIntegration(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function fetchCatalogSyncRunsByOwner(ownerUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "catalogSyncRuns"),
      where("ownerUid", "==", ownerUid),
      limit(300),
    ),
  );
  return snapshots.docs
    .map((snapshot) => mapCatalogSyncRun(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function testCatalogIntegrationConnection(payload: {
  provider: CatalogIntegrationProvider;
  storeUrl: string;
  shopifyAccessToken?: string;
  shopifyApiVersion?: string;
  wooConsumerKey?: string;
  wooConsumerSecret?: string;
}) {
  const integration = {
    id: "test",
    ownerUid: "test",
    ownerName: "Test",
    provider: payload.provider,
    label: "Test",
    storeUrl: payload.storeUrl,
    status: "active" as const,
    syncEveryHours: 24,
    shopifyAccessToken: payload.shopifyAccessToken,
    shopifyApiVersion: payload.shopifyApiVersion,
    wooConsumerKey: payload.wooConsumerKey,
    wooConsumerSecret: payload.wooConsumerSecret,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } satisfies CatalogIntegrationRecord;
  const rows =
    integration.provider === "shopify"
      ? await fetchShopifyCatalogItems(integration)
      : await fetchWooCommerceCatalogItems(integration);
  return {
    ok: true,
    sampled: rows.slice(0, 3).map((row) => ({
      title: row.title,
      category: row.category,
      price: row.price,
      stock: row.stock,
    })),
    totalFetched: rows.length,
  };
}

async function upsertExternalProduct(payload: {
  ownerUid: string;
  ownerName: string;
  ownerBusinessSlug?: string;
  ownerTrustScore: number;
  ownerCertificateSerial?: string;
  provider: CatalogIntegrationProvider;
  item: ExternalCatalogItem;
}) {
  const database = getDb();
  const syncDocId = `${payload.ownerUid}_${payload.provider}_${payload.item.externalId}`
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 120);
  const productRef = doc(database, "digitalProducts", syncDocId);
  const row = await getDoc(productRef);
  const previousStock = row.exists() ? Number(row.data().stockAvailable ?? 0) : undefined;
  const data = {
    ownerUid: payload.ownerUid,
    ownerName: payload.ownerName,
    title: payload.item.title,
    description: payload.item.description || "Imported from external store.",
    category: payload.item.category || "General",
    price: Math.max(1, Math.round(payload.item.price)),
    pricingPlans: [
      {
        key: "standard",
        name: "Standard",
        billingCycle: "one_time",
        price: Math.max(1, Math.round(payload.item.price)),
      },
    ],
    noRefund: false,
    ownerBusinessSlug: payload.ownerBusinessSlug ?? null,
    ownerTrustScore: payload.ownerTrustScore,
    ownerCertificateSerial: payload.ownerCertificateSerial ?? null,
    externalSource: payload.provider,
    externalProductId: payload.item.externalId,
    externalStoreUrl: payload.item.sourceUrl ?? null,
    stockAvailable: payload.item.stock,
    lastSyncedAt: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  };
  if (row.exists()) {
    await updateDoc(productRef, data);
    if (previousStock !== payload.item.stock) {
      await appendInventoryLog({
        ownerUid: payload.ownerUid,
        itemType: "product",
        itemId: productRef.id,
        itemTitle: payload.item.title,
        source: "catalog_sync",
        previousStock,
        nextStock: payload.item.stock,
        note: `${payload.provider} sync update`,
      });
    }
    return "updated";
  }
  await setDoc(productRef, {
    ...data,
    uniqueLinkSlug: `${toSlug(payload.item.title)}-${Math.random().toString(36).slice(2, 8)}`,
    favoritesCount: 0,
    salesCount: 0,
    refundCount: 0,
    reviewsCount: 0,
    averageRating: 0,
    createdAt: serverTimestamp(),
  });
  await appendInventoryLog({
    ownerUid: payload.ownerUid,
    itemType: "product",
    itemId: productRef.id,
    itemTitle: payload.item.title,
    source: "catalog_sync",
    previousStock: undefined,
    nextStock: payload.item.stock,
    note: `${payload.provider} sync import`,
  });
  return "created";
}

async function upsertExternalService(payload: {
  ownerUid: string;
  ownerName: string;
  ownerBusinessSlug?: string;
  ownerTrustScore: number;
  ownerCertificateSerial?: string;
  provider: CatalogIntegrationProvider;
  item: ExternalCatalogItem;
}) {
  const database = getDb();
  const syncDocId = `${payload.ownerUid}_${payload.provider}_${payload.item.externalId}`
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 120);
  const serviceRef = doc(database, "businessServices", syncDocId);
  const row = await getDoc(serviceRef);
  const previousStock = row.exists() ? Number(row.data().stockAvailable ?? 0) : undefined;
  const data = {
    ownerUid: payload.ownerUid,
    ownerName: payload.ownerName,
    title: payload.item.title,
    description: payload.item.description || "Imported from external store.",
    category: payload.item.category || "General",
    startingPrice: Math.max(1, Math.round(payload.item.price)),
    currency: payload.item.currency,
    serviceMode: "online",
    deliveryMode: "remote",
    ownerBusinessSlug: payload.ownerBusinessSlug ?? null,
    ownerTrustScore: payload.ownerTrustScore,
    ownerCertificateSerial: payload.ownerCertificateSerial ?? null,
    externalSource: payload.provider,
    externalProductId: payload.item.externalId,
    externalStoreUrl: payload.item.sourceUrl ?? null,
    stockAvailable: payload.item.stock,
    lastSyncedAt: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  };
  if (row.exists()) {
    await updateDoc(serviceRef, data);
    if (previousStock !== payload.item.stock) {
      await appendInventoryLog({
        ownerUid: payload.ownerUid,
        itemType: "service",
        itemId: serviceRef.id,
        itemTitle: payload.item.title,
        source: "catalog_sync",
        previousStock,
        nextStock: payload.item.stock,
        note: `${payload.provider} sync update`,
      });
    }
    return "updated";
  }
  await setDoc(serviceRef, {
    ...data,
    uniqueLinkSlug: `${toSlug(payload.item.title)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: serverTimestamp(),
  });
  await appendInventoryLog({
    ownerUid: payload.ownerUid,
    itemType: "service",
    itemId: serviceRef.id,
    itemTitle: payload.item.title,
    source: "catalog_sync",
    previousStock: undefined,
    nextStock: payload.item.stock,
    note: `${payload.provider} sync import`,
  });
  return "created";
}

export async function syncCatalogIntegrationById(payload: {
  ownerUid: string;
  integrationId: string;
  trigger?: "manual" | "scheduled";
}) {
  const database = getDb();
  const integrationRef = doc(database, "catalogIntegrations", payload.integrationId);
  const integrationSnapshot = await getDoc(integrationRef);
  if (!integrationSnapshot.exists()) {
    throw new Error("Integration not found.");
  }
  const integration = mapCatalogIntegration(integrationSnapshot.id, integrationSnapshot.data());
  if (integration.ownerUid !== payload.ownerUid) {
    throw new Error("Integration owner mismatch.");
  }
  if (integration.status !== "active") {
    throw new Error("Integration is disabled.");
  }

  const business = await fetchPrimaryBusinessByOwner(payload.ownerUid);
  if (!business || business.status !== "approved") {
    throw new Error("Approve business profile before syncing catalog.");
  }

  const items =
    integration.provider === "shopify"
      ? await fetchShopifyCatalogItems(integration)
      : await fetchWooCommerceCatalogItems(integration);

  let importedProducts = 0;
  let importedServices = 0;
  let updatedProducts = 0;
  let updatedServices = 0;

  for (const item of items) {
    if (isCatalogServiceCandidate(item)) {
      const result = await upsertExternalService({
        ownerUid: integration.ownerUid,
        ownerName: integration.ownerName,
        ownerBusinessSlug: business.slug,
        ownerTrustScore: business.trustScore,
        ownerCertificateSerial: business.certificateSerial,
        provider: integration.provider,
        item,
      });
      if (result === "created") importedServices += 1;
      if (result === "updated") updatedServices += 1;
      continue;
    }
    const result = await upsertExternalProduct({
      ownerUid: integration.ownerUid,
      ownerName: integration.ownerName,
      ownerBusinessSlug: business.slug,
      ownerTrustScore: business.trustScore,
      ownerCertificateSerial: business.certificateSerial,
      provider: integration.provider,
      item,
    });
    if (result === "created") importedProducts += 1;
    if (result === "updated") updatedProducts += 1;
  }

  const summary = `Fetched ${items.length} item(s). Products +${importedProducts}/${updatedProducts} updated, services +${importedServices}/${updatedServices} updated.`;
  await updateDoc(integrationRef, {
    lastSyncedAt: new Date().toISOString(),
    lastSyncStatus: "success",
    lastSyncMessage: summary,
    updatedAt: serverTimestamp(),
  });
  await addDoc(collection(database, "catalogSyncRuns"), {
    integrationId: integration.id,
    ownerUid: integration.ownerUid,
    provider: integration.provider,
    status: "success",
    importedProducts,
    importedServices,
    updatedProducts,
    updatedServices,
    message: summary,
    trigger: payload.trigger ?? "manual",
    createdAt: serverTimestamp(),
  });
  return {
    integrationId: integration.id,
    totalFetched: items.length,
    importedProducts,
    importedServices,
    updatedProducts,
    updatedServices,
  };
}

export async function runDueCatalogIntegrationSync(payload?: {
  trigger?: "manual" | "scheduled";
  force?: boolean;
}) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "catalogIntegrations"),
      where("status", "==", "active"),
      limit(300),
    ),
  );
  const integrations = snapshots.docs.map((snapshot) =>
    mapCatalogIntegration(snapshot.id, snapshot.data()),
  );
  const now = Date.now();
  let attempted = 0;
  let synced = 0;
  let failed = 0;

  for (const integration of integrations) {
    const hours = Math.max(6, integration.syncEveryHours || 24);
    const last = integration.lastSyncedAt ? Date.parse(integration.lastSyncedAt) : 0;
    const due = payload?.force ? true : !last || now - last >= hours * 60 * 60 * 1000;
    if (!due) continue;
    attempted += 1;
    try {
      await syncCatalogIntegrationById({
        ownerUid: integration.ownerUid,
        integrationId: integration.id,
        trigger: payload?.trigger ?? "scheduled",
      });
      synced += 1;
    } catch (error) {
      failed += 1;
      await updateDoc(doc(database, "catalogIntegrations", integration.id), {
        lastSyncedAt: new Date().toISOString(),
        lastSyncStatus: "failed",
        lastSyncMessage: error instanceof Error ? error.message : "Sync failed.",
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(database, "catalogSyncRuns"), {
        integrationId: integration.id,
        ownerUid: integration.ownerUid,
        provider: integration.provider,
        status: "failed",
        importedProducts: 0,
        importedServices: 0,
        updatedProducts: 0,
        updatedServices: 0,
        message: error instanceof Error ? error.message : "Sync failed.",
        trigger: payload?.trigger ?? "scheduled",
        createdAt: serverTimestamp(),
      });
    }
  }
  return {
    attempted,
    synced,
    failed,
  };
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

export async function fetchFavoritedProductsByUser(userUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(collectionGroup(database, "favorites"), where("userUid", "==", userUid), limit(300)),
  );
  const productIds = [...new Set(
    snapshots.docs
      .map((snapshot) => snapshot.ref.parent.parent?.id ?? "")
      .filter(Boolean),
  )];
  if (!productIds.length) return [];

  const products = await Promise.all(
    productIds.map(async (productId) => {
      const snapshot = await getDoc(doc(database, "digitalProducts", productId));
      if (!snapshot.exists()) return null;
      return mapDigitalProduct(snapshot.id, snapshot.data());
    }),
  );

  const validRows = products.filter((row) => row !== null) as DigitalProductRecord[];
  const enrichedRows = await enrichProductsWithSocialProof(validRows);
  return enrichedRows.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function sendProductOfferToFavoriteCustomers(payload: {
  productId: string;
  ownerUid: string;
  title: string;
  message: string;
  maxRecipients?: number;
}) {
  const cleanTitle = payload.title.trim();
  const cleanMessage = payload.message.trim();
  if (!cleanTitle || !cleanMessage) {
    throw new Error("Offer title and message are required.");
  }

  const database = getDb();
  const productSnapshot = await getDoc(doc(database, "digitalProducts", payload.productId));
  if (!productSnapshot.exists()) {
    throw new Error("Product not found.");
  }
  const product = mapDigitalProduct(productSnapshot.id, productSnapshot.data());
  if (product.ownerUid !== payload.ownerUid) {
    throw new Error("You can only send offers for your own products.");
  }

  const maxRecipients = Math.max(1, Math.min(payload.maxRecipients ?? 2000, 5000));
  const favoritesSnapshot = await getDocs(
    query(collection(database, "digitalProducts", payload.productId, "favorites"), limit(maxRecipients)),
  );
  const recipientUids = [...new Set(favoritesSnapshot.docs.map((snapshot) => snapshot.id).filter(Boolean))];
  if (!recipientUids.length) {
    return {
      totalFavorites: 0,
      delivered: 0,
    };
  }

  const createdAt = new Date().toISOString();
  const chunks: string[][] = [];
  for (let i = 0; i < recipientUids.length; i += 400) {
    chunks.push(recipientUids.slice(i, i + 400));
  }

  for (const chunk of chunks) {
    const batch = writeBatch(database);
    for (const uid of chunk) {
      const notificationRef = doc(collection(database, "users", uid, "notifications"));
      batch.set(notificationRef, {
        endpointId: "product_offer_broadcast",
        ownerUid: payload.ownerUid,
        category: "offers",
        title: cleanTitle,
        message: cleanMessage,
        productId: product.id,
        productSlug: product.uniqueLinkSlug,
        productTitle: product.title,
        productLink: `/products/${product.uniqueLinkSlug}`,
        isSpam: false,
        createdAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  await addDoc(collection(database, "productOfferBroadcastLogs"), {
    ownerUid: payload.ownerUid,
    productId: product.id,
    productTitle: product.title,
    title: cleanTitle,
    message: cleanMessage,
    delivered: recipientUids.length,
    createdAt: serverTimestamp(),
  });

  await recordAuditEvent({
    actorUid: payload.ownerUid,
    actorRole: "business",
    action: "product_offer_broadcast",
    targetType: "digital_product",
    targetId: product.id,
    summary: `Sent offer broadcast for product ${product.title} to ${recipientUids.length} favorite customers.`,
    metadata: {
      recipientCount: recipientUids.length,
      productSlug: product.uniqueLinkSlug,
      createdAt,
    },
  });

  return {
    totalFavorites: recipientUids.length,
    delivered: recipientUids.length,
  };
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

  if (payload.rating <= 2) {
    await createSupportTicketFromReviewSignal({
      reviewId: reviewRef.id,
      customerUid: payload.customerUid,
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      businessName: product.ownerName,
      productTitle: product.title,
      comment: payload.comment.trim(),
      evidenceUrls: payload.proofUrls,
    });
  }
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

  if (!payload.satisfied) {
    await createSupportTicketFromReviewSignal({
      reviewId: review.id,
      customerUid: review.customerUid,
      customerName: review.customerName,
      customerEmail: review.customerEmail,
      businessName: review.businessOwnerName,
      productTitle: review.productTitle,
      comment: payload.resolutionNote?.trim() || review.comment,
      evidenceUrls: review.proofUrls,
    });
  }
}

export type OrderStatus = "paid" | "refund_requested" | "refunded" | "released";

export interface CheckoutPricingBreakdownRecord {
  baseAmountInr: number;
  discountAmountInr: number;
  shippingAmountInr: number;
  taxAmountInr: number;
  finalAmountInr: number;
  appliedCouponCode?: string;
  appliedCouponId?: string;
  shippingZoneId?: string;
  shippingZoneLabel?: string;
  taxRuleIds: string[];
}

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
  currency: PaymentCurrency;
  baseAmountInr: number;
  discountAmountInr: number;
  shippingAmountInr: number;
  taxAmountInr: number;
  appliedCouponCode?: string;
  appliedCouponId?: string;
  shippingZoneId?: string;
  shippingZoneLabel?: string;
  appliedTaxRuleIds: string[];
  pricingPlanKey?: string;
  pricingPlanName?: string;
  pricingPlanBillingCycle?: DigitalProductPricingCycle;
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
  const normalizedCurrency = normalizePaymentCurrency(data.currency);
  const pricing = (data.pricingBreakdown as Record<string, unknown> | undefined) ?? undefined;
  const baseAmountInr = Number(
    pricing?.baseAmountInr ??
      data.baseAmountInr ??
      data.amount ??
      0,
  );
  const discountAmountInr = Number(pricing?.discountAmountInr ?? data.discountAmountInr ?? 0);
  const shippingAmountInr = Number(pricing?.shippingAmountInr ?? data.shippingAmountInr ?? 0);
  const taxAmountInr = Number(pricing?.taxAmountInr ?? data.taxAmountInr ?? 0);
  const appliedTaxRuleIds = Array.isArray(pricing?.taxRuleIds)
    ? (pricing?.taxRuleIds as unknown[]).map((entry) => String(entry))
    : Array.isArray(data.appliedTaxRuleIds)
      ? (data.appliedTaxRuleIds as unknown[]).map((entry) => String(entry))
      : [];
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
    currency: normalizedCurrency,
    baseAmountInr,
    discountAmountInr,
    shippingAmountInr,
    taxAmountInr,
    appliedCouponCode: data.appliedCouponCode
      ? String(data.appliedCouponCode)
      : pricing?.appliedCouponCode
        ? String(pricing.appliedCouponCode)
        : undefined,
    appliedCouponId: data.appliedCouponId
      ? String(data.appliedCouponId)
      : pricing?.appliedCouponId
        ? String(pricing.appliedCouponId)
        : undefined,
    shippingZoneId: data.shippingZoneId
      ? String(data.shippingZoneId)
      : pricing?.shippingZoneId
        ? String(pricing.shippingZoneId)
        : undefined,
    shippingZoneLabel: data.shippingZoneLabel
      ? String(data.shippingZoneLabel)
      : pricing?.shippingZoneLabel
        ? String(pricing.shippingZoneLabel)
        : undefined,
    appliedTaxRuleIds,
    pricingPlanKey: data.pricingPlanKey ? String(data.pricingPlanKey) : undefined,
    pricingPlanName: data.pricingPlanName ? String(data.pricingPlanName) : undefined,
    pricingPlanBillingCycle: data.pricingPlanBillingCycle
      ? (String(data.pricingPlanBillingCycle) as DigitalProductPricingCycle)
      : undefined,
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
  selectedPlan: DigitalProductPricingPlanRecord;
  paymentIntentId?: string;
  currency?: PaymentCurrency;
  pricingBreakdown?: CheckoutPricingBreakdownRecord;
}) {
  const database = getDb();
  const now = new Date();
  const releaseDate = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
  const refundDeadline = params.product.noRefund ? now : releaseDate;
  const pricingBreakdown = params.pricingBreakdown ?? {
    baseAmountInr: params.selectedPlan.price,
    discountAmountInr: 0,
    shippingAmountInr: 0,
    taxAmountInr: 0,
    finalAmountInr: params.selectedPlan.price,
    taxRuleIds: [],
  };

  const orderRef = await addDoc(collection(database, "orders"), {
    productId: params.product.id,
    productSlug: params.product.uniqueLinkSlug,
    productTitle: params.product.title,
    businessOwnerUid: params.product.ownerUid,
    businessOwnerName: params.product.ownerName,
    customerUid: params.customer.uid,
    customerName: params.customer.name,
    customerEmail: params.customer.email,
    amount: pricingBreakdown.finalAmountInr,
    currency: params.currency ?? "INR",
    baseAmountInr: pricingBreakdown.baseAmountInr,
    discountAmountInr: pricingBreakdown.discountAmountInr,
    shippingAmountInr: pricingBreakdown.shippingAmountInr,
    taxAmountInr: pricingBreakdown.taxAmountInr,
    appliedCouponCode: pricingBreakdown.appliedCouponCode ?? null,
    appliedCouponId: pricingBreakdown.appliedCouponId ?? null,
    shippingZoneId: pricingBreakdown.shippingZoneId ?? null,
    shippingZoneLabel: pricingBreakdown.shippingZoneLabel ?? null,
    appliedTaxRuleIds: pricingBreakdown.taxRuleIds,
    pricingBreakdown,
    pricingPlanKey: params.selectedPlan.key,
    pricingPlanName: params.selectedPlan.name,
    pricingPlanBillingCycle: params.selectedPlan.billingCycle,
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
    amount: pricingBreakdown.finalAmountInr,
    status: "locked",
    releaseAt: releaseDate.toISOString(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  if (pricingBreakdown.appliedCouponId) {
    try {
      await updateDoc(doc(database, "businessShopCoupons", pricingBreakdown.appliedCouponId), {
        usedCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // If coupon record was removed concurrently, keep the order successful.
    }
  }

  return orderRef.id;
}

export async function createOrderFromProduct(
  productSlug: string,
  customer: { uid: string; name: string; email: string },
  pricingPlanKey?: string,
  options?: {
    couponCode?: string;
    shippingZoneId?: string;
    checkoutCountry?: string;
    checkoutCity?: string;
  },
) {
  const product = await fetchDigitalProductBySlug(productSlug);
  if (!product) {
    throw new Error("Product not found.");
  }
  const selectedPlan = resolveProductPricingPlan(product, pricingPlanKey);
  const checkoutPricing = await computeCheckoutPricingForProduct({
    businessOwnerUid: product.ownerUid,
    selectedPlanPriceInr: selectedPlan.price,
    pricingPlanKey: selectedPlan.key,
    customerUid: customer.uid,
    couponCode: options?.couponCode,
    shippingZoneId: options?.shippingZoneId,
    checkoutCountry: options?.checkoutCountry,
    checkoutCity: options?.checkoutCity,
  });

  await debitWalletBalance({
    ownerUid: customer.uid,
    amount: checkoutPricing.finalAmountInr,
    reason: `Purchase: ${product.title} (${selectedPlan.name})`,
    type: "purchase_debit",
    referenceId: product.id,
  });

  return createOrderAndEscrowFromProduct({
    product,
    customer,
    selectedPlan,
    pricingBreakdown: checkoutPricing,
    currency: "INR",
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
  payoutId?: string;
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
export type PaymentCurrency = "INR" | "USD";
export type PaymentProvider = "mock" | "razorpay" | "paypal";

export interface PaymentIntentRecord {
  id: string;
  ownerUid: string;
  ownerName: string;
  ownerEmail: string;
  amount: number;
  currency: PaymentCurrency;
  provider: PaymentProvider;
  purpose: PaymentIntentPurpose;
  status: PaymentIntentStatus;
  productSlug?: string;
  pricingPlanKey?: string;
  pricingBreakdown?: CheckoutPricingBreakdownRecord;
  appliedCouponCode?: string;
  shippingZoneId?: string;
  shippingZoneLabel?: string;
  abandonedCheckoutId?: string;
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
  metadata?: Record<string, string>;
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

export interface WithdrawalFieldRule {
  key: string;
  label: string;
  required: boolean;
  placeholder: string;
  pattern?: string;
}

export interface WithdrawalComplianceSchema {
  country: string;
  methods: string[];
  fieldsByMethod: Record<string, WithdrawalFieldRule[]>;
}

const withdrawalComplianceCatalog: Record<string, WithdrawalComplianceSchema> = {
  india: {
    country: "India",
    methods: ["Bank Transfer", "UPI"],
    fieldsByMethod: {
      "Bank Transfer": [
        { key: "accountName", label: "Account Holder Name", required: true, placeholder: "Account holder" },
        { key: "accountNumber", label: "Account Number", required: true, placeholder: "Bank account number" },
        { key: "ifsc", label: "IFSC", required: true, placeholder: "ABCD0123456", pattern: "^[A-Za-z]{4}0[0-9A-Za-z]{6}$" },
      ],
      UPI: [
        { key: "accountName", label: "Account Holder Name", required: true, placeholder: "Account holder" },
        { key: "upi", label: "UPI ID", required: true, placeholder: "name@bank", pattern: "^[a-zA-Z0-9._-]{2,}@[a-zA-Z]{2,}$" },
      ],
    },
  },
  usa: {
    country: "USA",
    methods: ["Bank Transfer", "PayPal"],
    fieldsByMethod: {
      "Bank Transfer": [
        { key: "accountName", label: "Account Holder Name", required: true, placeholder: "Account holder" },
        { key: "accountNumber", label: "Account Number", required: true, placeholder: "Account number" },
        { key: "routingNumber", label: "Routing Number", required: true, placeholder: "9-digit routing number", pattern: "^[0-9]{9}$" },
      ],
      PayPal: [
        { key: "paypal", label: "PayPal Email", required: true, placeholder: "name@example.com", pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$" },
      ],
    },
  },
  uk: {
    country: "United Kingdom",
    methods: ["Bank Transfer", "PayPal"],
    fieldsByMethod: {
      "Bank Transfer": [
        { key: "accountName", label: "Account Holder Name", required: true, placeholder: "Account holder" },
        { key: "accountNumber", label: "Account Number", required: true, placeholder: "8-digit account number", pattern: "^[0-9]{8}$" },
        { key: "sortCode", label: "Sort Code", required: true, placeholder: "123456", pattern: "^[0-9]{6}$" },
      ],
      PayPal: [
        { key: "paypal", label: "PayPal Email", required: true, placeholder: "name@example.com", pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$" },
      ],
    },
  },
  uae: {
    country: "UAE",
    methods: ["Bank Transfer"],
    fieldsByMethod: {
      "Bank Transfer": [
        { key: "accountName", label: "Account Holder Name", required: true, placeholder: "Account holder" },
        { key: "iban", label: "IBAN", required: true, placeholder: "AE070331234567890123456", pattern: "^[A-Z]{2}[0-9A-Z]{13,30}$" },
        { key: "swift", label: "SWIFT", required: true, placeholder: "AAAAAEAA", pattern: "^[A-Z0-9]{8,11}$" },
      ],
    },
  },
};

const defaultWithdrawalComplianceSchema: WithdrawalComplianceSchema = {
  country: "Global",
  methods: ["Bank Transfer", "PayPal", "UPI"],
  fieldsByMethod: {
    "Bank Transfer": [
      { key: "accountName", label: "Account Holder Name", required: true, placeholder: "Account holder" },
      { key: "accountNumber", label: "Account Number", required: true, placeholder: "Account number" },
      { key: "swift", label: "SWIFT", required: false, placeholder: "SWIFT code" },
      { key: "iban", label: "IBAN", required: false, placeholder: "IBAN" },
    ],
    PayPal: [
      { key: "paypal", label: "PayPal Email", required: true, placeholder: "name@example.com", pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$" },
    ],
    UPI: [
      { key: "upi", label: "UPI ID", required: true, placeholder: "name@bank", pattern: "^[a-zA-Z0-9._-]{2,}@[a-zA-Z]{2,}$" },
    ],
  },
};

function normalizeCountryKey(country: string) {
  return country.trim().toLowerCase().replace(/\./g, "");
}

export function fetchWithdrawalComplianceSchema(country: string) {
  const key = normalizeCountryKey(country);
  return withdrawalComplianceCatalog[key] ?? defaultWithdrawalComplianceSchema;
}

function validateWithdrawalAccountDetails(payload: {
  country: string;
  method: string;
  accountDetails: Record<string, string>;
}) {
  const schema = fetchWithdrawalComplianceSchema(payload.country);
  const method = schema.methods.includes(payload.method) ? payload.method : schema.methods[0];
  const fields = schema.fieldsByMethod[method] ?? [];
  const clean: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(payload.accountDetails)) {
    const value = String(rawValue ?? "").trim();
    if (value) {
      clean[rawKey] = value;
    }
  }

  for (const field of fields) {
    const value = clean[field.key] ?? "";
    if (field.required && !value) {
      throw new Error(`${field.label} is required for ${schema.country} ${method}.`);
    }
    if (value && field.pattern && !new RegExp(field.pattern).test(value)) {
      throw new Error(`${field.label} format is invalid.`);
    }
  }

  return {
    method,
    accountDetails: clean,
    schema,
  };
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
  const validated = validateWithdrawalAccountDetails({
    country: payload.country,
    method: payload.method,
    accountDetails: payload.accountDetails,
  });
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
    method: validated.method,
    accountDetails: validated.accountDetails,
    requiredFieldKeys: (validated.schema.fieldsByMethod[validated.method] ?? []).map(
      (field) => field.key,
    ),
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
    payoutId: data.payoutId ? String(data.payoutId) : undefined,
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
  if (raw === "razorpay") return "razorpay";
  if (raw === "paypal") return "paypal";
  return "mock";
}

function normalizePaymentCurrency(raw: unknown): PaymentCurrency {
  const value = String(raw ?? "INR").trim().toUpperCase();
  return value === "USD" ? "USD" : "INR";
}

function convertAmountForCurrency(amountInInr: number, currency: PaymentCurrency) {
  if (currency === "INR") return Math.max(1, Math.round(amountInInr * 100) / 100);
  const usdInrRate = Math.max(1, Number(process.env.USD_INR_RATE ?? "83"));
  const usdAmount = amountInInr / usdInrRate;
  return Math.max(0.5, Math.round(usdAmount * 100) / 100);
}

function mapPaymentIntent(snapshotId: string, data: Record<string, unknown>) {
  const currency = normalizePaymentCurrency(data.currency);
  const provider = String(data.provider ?? "mock").trim().toLowerCase();
  const breakdownRaw = data.pricingBreakdown as Record<string, unknown> | undefined;
  const pricingBreakdown = breakdownRaw
    ? {
        baseAmountInr: Number(breakdownRaw.baseAmountInr ?? data.amount ?? 0),
        discountAmountInr: Number(breakdownRaw.discountAmountInr ?? 0),
        shippingAmountInr: Number(breakdownRaw.shippingAmountInr ?? 0),
        taxAmountInr: Number(breakdownRaw.taxAmountInr ?? 0),
        finalAmountInr: Number(breakdownRaw.finalAmountInr ?? data.amount ?? 0),
        appliedCouponCode: breakdownRaw.appliedCouponCode
          ? String(breakdownRaw.appliedCouponCode)
          : undefined,
        appliedCouponId: breakdownRaw.appliedCouponId
          ? String(breakdownRaw.appliedCouponId)
          : undefined,
        shippingZoneId: breakdownRaw.shippingZoneId
          ? String(breakdownRaw.shippingZoneId)
          : undefined,
        shippingZoneLabel: breakdownRaw.shippingZoneLabel
          ? String(breakdownRaw.shippingZoneLabel)
          : undefined,
        taxRuleIds: Array.isArray(breakdownRaw.taxRuleIds)
          ? (breakdownRaw.taxRuleIds as unknown[]).map((entry) => String(entry))
          : [],
      }
    : undefined;
  return {
    id: snapshotId,
    ownerUid: String(data.ownerUid ?? ""),
    ownerName: String(data.ownerName ?? "User"),
    ownerEmail: String(data.ownerEmail ?? ""),
    amount: Number(data.amount ?? 0),
    currency,
    provider:
      provider === "razorpay" || provider === "paypal" || provider === "mock"
        ? (provider as PaymentProvider)
        : "mock",
    purpose: (String(data.purpose ?? "wallet_topup") as PaymentIntentPurpose) ?? "wallet_topup",
    status: (String(data.status ?? "created") as PaymentIntentStatus) ?? "created",
    productSlug: data.productSlug ? String(data.productSlug) : undefined,
    pricingPlanKey: data.pricingPlanKey ? String(data.pricingPlanKey) : undefined,
    pricingBreakdown,
    appliedCouponCode: data.appliedCouponCode
      ? String(data.appliedCouponCode)
      : pricingBreakdown?.appliedCouponCode,
    shippingZoneId: data.shippingZoneId
      ? String(data.shippingZoneId)
      : pricingBreakdown?.shippingZoneId,
    shippingZoneLabel: data.shippingZoneLabel
      ? String(data.shippingZoneLabel)
      : pricingBreakdown?.shippingZoneLabel,
    abandonedCheckoutId: data.abandonedCheckoutId ? String(data.abandonedCheckoutId) : undefined,
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
    metadata: (data.metadata as Record<string, string>) ?? undefined,
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
  } satisfies PayoutRecord;
}

export async function createWalletTopupPaymentIntent(payload: {
  ownerUid: string;
  ownerName: string;
  ownerEmail: string;
  amount: number;
  provider?: PaymentProvider;
  currency?: PaymentCurrency;
}) {
  if (payload.amount <= 0) {
    throw new Error("Top-up amount must be greater than zero.");
  }
  const database = getDb();
  const provider = payload.provider ?? paymentProviderFromEnv();
  const currency = normalizePaymentCurrency(payload.currency);
  const amount = convertAmountForCurrency(payload.amount, currency);
  const intentRef = await addDoc(collection(database, "paymentIntents"), {
    ownerUid: payload.ownerUid,
    ownerName: payload.ownerName,
    ownerEmail: payload.ownerEmail,
    amount,
    currency,
    provider,
    purpose: "wallet_topup",
    status: "created",
    paymentUrl: "",
    providerOrderId: "",
    providerPaymentId: "",
    metadata: {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const paymentUrl =
    provider === "razorpay"
      ? `${baseUrl()}/payments/razorpay/${intentRef.id}`
      : provider === "paypal"
        ? `${baseUrl()}/payments/paypal/${intentRef.id}`
      : `${baseUrl()}/payments/mock/${intentRef.id}`;
  await updateDoc(doc(database, "paymentIntents", intentRef.id), {
    paymentUrl,
    providerOrderId: provider === "mock" ? `mock_order_${intentRef.id.slice(0, 14)}` : "",
    updatedAt: serverTimestamp(),
  });
  return intentRef.id;
}

export async function createProductCheckoutPaymentIntent(payload: {
  ownerUid: string;
  ownerName: string;
  ownerEmail: string;
  productSlug: string;
  pricingPlanKey?: string;
  provider?: PaymentProvider;
  currency?: PaymentCurrency;
  couponCode?: string;
  shippingZoneId?: string;
  checkoutCountry?: string;
  checkoutCity?: string;
}) {
  const product = await fetchDigitalProductBySlug(payload.productSlug);
  if (!product) throw new Error("Product not found.");
  const selectedPlan = resolveProductPricingPlan(product, payload.pricingPlanKey);
  const checkoutPricing = await computeCheckoutPricingForProduct({
    businessOwnerUid: product.ownerUid,
    selectedPlanPriceInr: selectedPlan.price,
    pricingPlanKey: selectedPlan.key,
    customerUid: payload.ownerUid,
    couponCode: payload.couponCode,
    shippingZoneId: payload.shippingZoneId,
    checkoutCountry: payload.checkoutCountry,
    checkoutCity: payload.checkoutCity,
  });
  const database = getDb();
  const provider = payload.provider ?? paymentProviderFromEnv();
  const currency = normalizePaymentCurrency(payload.currency);
  const amount = convertAmountForCurrency(checkoutPricing.finalAmountInr, currency);
  const abandonedCheckoutRef = await addDoc(collection(database, "abandonedCheckouts"), {
    ownerUid: payload.ownerUid,
    ownerName: payload.ownerName,
    ownerEmail: payload.ownerEmail,
    businessOwnerUid: product.ownerUid,
    businessOwnerName: product.ownerName,
    productId: product.id,
    productSlug: product.uniqueLinkSlug,
    productTitle: product.title,
    pricingPlanKey: selectedPlan.key,
    pricingPlanName: selectedPlan.name,
    pricingPlanBillingCycle: selectedPlan.billingCycle,
    currency,
    status: "open",
    paymentIntentId: null,
    orderId: null,
    checkoutCountry: payload.checkoutCountry?.trim() || null,
    checkoutCity: payload.checkoutCity?.trim() || null,
    pricingBreakdown: checkoutPricing,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const intentRef = await addDoc(collection(database, "paymentIntents"), {
    ownerUid: payload.ownerUid,
    ownerName: payload.ownerName,
    ownerEmail: payload.ownerEmail,
    amount,
    currency,
    provider,
    purpose: "product_checkout",
    productSlug: product.uniqueLinkSlug,
    pricingPlanKey: selectedPlan.key,
    pricingBreakdown: checkoutPricing,
    appliedCouponCode: checkoutPricing.appliedCouponCode ?? null,
    shippingZoneId: checkoutPricing.shippingZoneId ?? null,
    shippingZoneLabel: checkoutPricing.shippingZoneLabel ?? null,
    abandonedCheckoutId: abandonedCheckoutRef.id,
    status: "created",
    paymentUrl: "",
    providerOrderId: "",
    providerPaymentId: "",
    metadata: {
      productId: product.id,
      productTitle: product.title,
      pricingPlanKey: selectedPlan.key,
      pricingPlanName: selectedPlan.name,
      pricingPlanBillingCycle: selectedPlan.billingCycle,
      baseAmountInr: String(selectedPlan.price),
      discountAmountInr: String(checkoutPricing.discountAmountInr),
      shippingAmountInr: String(checkoutPricing.shippingAmountInr),
      taxAmountInr: String(checkoutPricing.taxAmountInr),
      finalAmountInr: String(checkoutPricing.finalAmountInr),
      appliedCouponCode: checkoutPricing.appliedCouponCode ?? "",
      shippingZoneId: checkoutPricing.shippingZoneId ?? "",
      shippingZoneLabel: checkoutPricing.shippingZoneLabel ?? "",
      abandonedCheckoutId: abandonedCheckoutRef.id,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(database, "abandonedCheckouts", abandonedCheckoutRef.id), {
    paymentIntentId: intentRef.id,
    updatedAt: serverTimestamp(),
  });
  const paymentUrl =
    provider === "razorpay"
      ? `${baseUrl()}/payments/razorpay/${intentRef.id}`
      : provider === "paypal"
        ? `${baseUrl()}/payments/paypal/${intentRef.id}`
      : `${baseUrl()}/payments/mock/${intentRef.id}`;
  await updateDoc(doc(database, "paymentIntents", intentRef.id), {
    paymentUrl,
    providerOrderId: provider === "mock" ? `mock_order_${intentRef.id.slice(0, 14)}` : "",
    updatedAt: serverTimestamp(),
  });
  return intentRef.id;
}

export async function attachPaymentIntentGatewayData(payload: {
  intentId: string;
  providerOrderId: string;
  paymentUrl?: string;
  metadata?: Record<string, string>;
}) {
  const database = getDb();
  const ref = doc(database, "paymentIntents", payload.intentId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    throw new Error("Payment intent not found.");
  }
  const existing = mapPaymentIntent(snapshot.id, snapshot.data());
  const fallbackPath =
    existing.provider === "razorpay"
      ? `/payments/razorpay/${payload.intentId}`
      : existing.provider === "paypal"
        ? `/payments/paypal/${payload.intentId}`
        : `/payments/mock/${payload.intentId}`;
  await updateDoc(ref, {
    providerOrderId: payload.providerOrderId,
    paymentUrl:
      payload.paymentUrl?.trim() ||
      `${baseUrl()}${fallbackPath}`,
    status: "processing",
    metadata: {
      ...((snapshot.data().metadata as Record<string, string> | undefined) ?? {}),
      ...(payload.metadata ?? {}),
    },
    updatedAt: serverTimestamp(),
  });
}

export async function fetchPaymentIntentById(intentId: string) {
  const database = getDb();
  const snapshot = await getDoc(doc(database, "paymentIntents", intentId));
  if (!snapshot.exists()) return null;
  return mapPaymentIntent(snapshot.id, snapshot.data());
}

export async function fetchPaymentIntentByProviderOrderId(providerOrderId: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "paymentIntents"),
      where("providerOrderId", "==", providerOrderId),
      limit(1),
    ),
  );
  const row = snapshots.docs[0];
  return row ? mapPaymentIntent(row.id, row.data()) : null;
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
    const selectedPlan = resolveProductPricingPlan(product, intent.pricingPlanKey);
    orderId = await createOrderAndEscrowFromProduct({
      product,
      customer: {
        uid: intent.ownerUid,
        name: intent.ownerName,
        email: intent.ownerEmail,
      },
      selectedPlan,
      paymentIntentId: intent.id,
      currency: intent.currency,
      pricingBreakdown:
        intent.pricingBreakdown ??
        {
          baseAmountInr: Number(intent.metadata?.baseAmountInr ?? selectedPlan.price),
          discountAmountInr: Number(intent.metadata?.discountAmountInr ?? 0),
          shippingAmountInr: Number(intent.metadata?.shippingAmountInr ?? 0),
          taxAmountInr: Number(intent.metadata?.taxAmountInr ?? 0),
          finalAmountInr: Number(intent.metadata?.finalAmountInr ?? selectedPlan.price),
          appliedCouponCode: intent.appliedCouponCode,
          shippingZoneId: intent.shippingZoneId,
          shippingZoneLabel: intent.shippingZoneLabel,
          taxRuleIds: [],
        },
    });
  }

  await updateDoc(intentRef, {
    status: "paid",
    providerPaymentId:
      payload.providerPaymentId?.trim() ||
      (intent.provider === "mock"
        ? `mock_pay_${intent.id.slice(0, 14)}`
        : intent.provider === "paypal"
          ? `pp_pay_${intent.id.slice(0, 14)}`
          : `rzp_pay_${intent.id.slice(0, 14)}`),
    orderId: orderId ?? null,
    paidAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  if (intent.abandonedCheckoutId) {
    await updateDoc(doc(database, "abandonedCheckouts", intent.abandonedCheckoutId), {
      status: "recovered",
      orderId: orderId ?? null,
      recoveredAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

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
  const intentRef = doc(database, "paymentIntents", payload.intentId);
  await updateDoc(intentRef, {
    status: "failed",
    failureReason: payload.reason,
    updatedAt: serverTimestamp(),
  });
  const intentSnapshot = await getDoc(intentRef);
  if (intentSnapshot.exists()) {
    const intent = mapPaymentIntent(intentSnapshot.id, intentSnapshot.data());
    if (intent.abandonedCheckoutId) {
      await updateDoc(doc(database, "abandonedCheckouts", intent.abandonedCheckoutId), {
        status: "abandoned",
        failureReason: payload.reason,
        updatedAt: serverTimestamp(),
      });
    }
  }
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
    metadata: {
      country: request.country,
      method: request.method,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const providerPayoutId = provider === "mock" ? `mock_payout_${payoutRef.id.slice(0, 14)}` : "";
  const finalStatus: PayoutStatus = provider === "mock" ? "success" : "processing";

  await updateDoc(doc(database, "payouts", payoutRef.id), {
    status: finalStatus,
    providerPayoutId,
    updatedAt: serverTimestamp(),
  });
  await updateDoc(requestRef, {
    payoutId: payoutRef.id,
    payoutStatus: finalStatus,
    payoutReference: providerPayoutId || payoutRef.id,
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
      payoutReference: providerPayoutId || payoutRef.id,
      amount: request.netAmount,
    },
  });

  return {
    payoutId: payoutRef.id,
    status: finalStatus,
    providerPayoutId,
    provider,
    request,
  };
}

export async function fetchPayoutById(payoutId: string) {
  const database = getDb();
  const snapshot = await getDoc(doc(database, "payouts", payoutId));
  if (!snapshot.exists()) return null;
  return mapPayoutRecord(snapshot.id, snapshot.data());
}

export async function fetchPayoutByProviderPayoutId(providerPayoutId: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "payouts"), where("providerPayoutId", "==", providerPayoutId), limit(1)),
  );
  const row = snapshots.docs[0];
  return row ? mapPayoutRecord(row.id, row.data()) : null;
}

export async function attachPayoutProviderReference(payload: {
  payoutId: string;
  providerPayoutId: string;
  metadata?: Record<string, string>;
}) {
  const database = getDb();
  const payoutRef = doc(database, "payouts", payload.payoutId);
  const payoutSnapshot = await getDoc(payoutRef);
  if (!payoutSnapshot.exists()) throw new Error("Payout not found.");
  const payout = mapPayoutRecord(payoutSnapshot.id, payoutSnapshot.data());
  await updateDoc(payoutRef, {
    providerPayoutId: payload.providerPayoutId,
    metadata: {
      ...(payout.metadata ?? {}),
      ...(payload.metadata ?? {}),
    },
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(database, "withdrawalRequests", payout.withdrawalRequestId), {
    payoutReference: payload.providerPayoutId,
    updatedAt: serverTimestamp(),
  });
}

export async function finalizePayoutSettlement(payload: {
  payoutId: string;
  providerPayoutId?: string;
  status: "success" | "failed";
  failureReason?: string;
  actorUid: string;
  actorRole: "admin" | "system";
}) {
  const database = getDb();
  const payoutRef = doc(database, "payouts", payload.payoutId);
  const payoutSnapshot = await getDoc(payoutRef);
  if (!payoutSnapshot.exists()) throw new Error("Payout not found.");
  const payout = mapPayoutRecord(payoutSnapshot.id, payoutSnapshot.data());
  const requestRef = doc(database, "withdrawalRequests", payout.withdrawalRequestId);
  const requestSnapshot = await getDoc(requestRef);
  if (!requestSnapshot.exists()) throw new Error("Withdrawal request not found for payout.");
  const request = mapWithdrawalRecord(requestSnapshot.id, requestSnapshot.data());

  const isSuccess = payload.status === "success";
  await updateDoc(payoutRef, {
    status: isSuccess ? "success" : "failed",
    providerPayoutId: payload.providerPayoutId || payout.providerPayoutId || "",
    failureReason: isSuccess ? "" : payload.failureReason?.trim() || "Payout failed at provider",
    updatedAt: serverTimestamp(),
  });
  await updateDoc(requestRef, {
    payoutStatus: isSuccess ? "success" : "failed",
    payoutReference: payload.providerPayoutId || payout.providerPayoutId || request.payoutReference || request.id,
    payoutProcessedAt: isSuccess ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  });

  if (!isSuccess) {
    const wallet = walletRef(request.ownerUid);
    await updateDoc(wallet, {
      balance: increment(request.amount),
      updatedAt: serverTimestamp(),
    });
    await appendWalletTransaction(request.ownerUid, {
      type: "withdrawal_reversal",
      amount: request.amount,
      reason: `Withdrawal ${request.id} reversed after payout failure`,
      referenceId: request.id,
    });
    await updateDoc(requestRef, {
      status: "declined",
      declineReason: payload.failureReason?.trim() || "Payout provider failure",
      updatedAt: serverTimestamp(),
    });
  }

  await recordAuditEvent({
    actorUid: payload.actorUid,
    actorRole: payload.actorRole,
    action: isSuccess ? "withdrawal_payout_settled" : "withdrawal_payout_failed",
    targetType: "payout",
    targetId: payload.payoutId,
    summary: isSuccess
      ? `Payout ${payload.payoutId} marked successful.`
      : `Payout ${payload.payoutId} failed and withdrawal was reversed.`,
    metadata: {
      requestId: request.id,
      providerPayoutId: payload.providerPayoutId || payout.providerPayoutId || "",
      failureReason: payload.failureReason ?? null,
    },
  });
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

export async function fetchWithdrawalRequestById(requestId: string) {
  const database = getDb();
  const snapshot = await getDoc(doc(database, "withdrawalRequests", requestId));
  if (!snapshot.exists()) return null;
  return mapWithdrawalRecord(snapshot.id, snapshot.data());
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
  moderatorUids: string[];
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
    moderatorUids: (data.moderatorUids as string[]) ?? [],
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
    moderatorUids: [payload.ownerUid],
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

async function isEmployeeOfBusinessOwner(ownerUid: string, employeeUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "users", employeeUid, "employments"),
      where("ownerUid", "==", ownerUid),
      limit(1),
    ),
  );
  return !snapshots.empty;
}

export async function updateGroupModerators(payload: {
  groupId: string;
  ownerUid: string;
  moderatorUids: string[];
}) {
  const database = getDb();
  const group = await fetchGroupById(payload.groupId);
  if (!group) throw new Error("Group not found.");
  if (group.ownerUid !== payload.ownerUid) {
    throw new Error("Only group owner can update moderators.");
  }

  const normalized = [
    ...new Set(payload.moderatorUids.map((uid) => uid.trim()).filter(Boolean)),
  ];
  const finalModerators = new Set<string>([payload.ownerUid]);
  for (const uid of normalized) {
    if (uid === payload.ownerUid) {
      finalModerators.add(uid);
      continue;
    }
    const isEmployee = await isEmployeeOfBusinessOwner(payload.ownerUid, uid);
    if (isEmployee) {
      finalModerators.add(uid);
    }
  }

  await updateDoc(doc(database, "groups", payload.groupId), {
    moderatorUids: Array.from(finalModerators),
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

  const isModerator = group.moderatorUids.includes(payload.senderUid);
  if (
    group.adminOnlyMessaging &&
    payload.senderUid !== group.ownerUid &&
    payload.senderRole !== "admin" &&
    !isModerator
  ) {
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

export interface PublicSearchHitRecord {
  id: string;
  type: "business" | "product" | "service" | "group" | "partnership";
  title: string;
  subtitle: string;
  href: string;
  score: number;
}

function rankSearchText(text: string, queryText: string) {
  const normalized = text.toLowerCase();
  const query = queryText.toLowerCase();
  if (normalized === query) return 120;
  if (normalized.startsWith(query)) return 90;
  if (normalized.includes(query)) return 60;
  return 0;
}

export async function searchPublicMarketplace(queryText: string, maxRows = 60) {
  const text = queryText.trim().toLowerCase();
  if (!text) return [] as PublicSearchHitRecord[];

  const [businesses, products, services, groups, opportunities] = await Promise.all([
    fetchPublicBusinessDirectory(),
    fetchPublicDigitalProductsLite().catch(() => [] as DigitalProductRecord[]),
    fetchPublicBusinessServices().catch(() => [] as BusinessServiceRecord[]),
    fetchPublicGroups(),
    fetchPartnershipOpportunities(),
  ]);

  const hits: PublicSearchHitRecord[] = [];

  for (const row of businesses) {
    const searchable = `${row.businessName} ${row.publicBusinessKey} ${row.city} ${row.country} ${row.category}`;
    const score = rankSearchText(searchable, text);
    if (!score) continue;
    hits.push({
      id: row.id,
      type: "business",
      title: row.businessName,
      subtitle: `${row.city}, ${row.country} | Trust ${row.trustScore} | Key ${row.publicBusinessKey}`,
      href: `/business/${row.slug}`,
      score: score + row.trustScore / 10,
    });
  }

  for (const row of products) {
    const searchable = `${row.title} ${row.category} ${row.ownerName}`;
    const score = rankSearchText(searchable, text);
    if (!score) continue;
    hits.push({
      id: row.id,
      type: "product",
      title: row.title,
      subtitle: `${row.ownerName} | INR ${row.price}`,
      href: `/products/${row.uniqueLinkSlug}`,
      score: score + row.salesCount / 25,
    });
  }

  for (const row of services) {
    const searchable = `${row.title} ${row.category} ${row.ownerName} ${row.serviceMode} ${row.deliveryMode}`;
    const score = rankSearchText(searchable, text);
    if (!score) continue;
    hits.push({
      id: row.id,
      type: "service",
      title: row.title,
      subtitle: `${row.ownerName} | ${row.currency} ${row.startingPrice}`,
      href: row.ownerBusinessSlug ? `/business/${row.ownerBusinessSlug}#services` : "/directory",
      score: score + row.ownerTrustScore / 20,
    });
  }

  for (const row of groups) {
    const searchable = `${row.title} ${row.description} ${row.ownerName}`;
    const score = rankSearchText(searchable, text);
    if (!score) continue;
    hits.push({
      id: row.id,
      type: "group",
      title: row.title,
      subtitle: `${row.membersCount} members | ${row.adminOnlyMessaging ? "Admin-only chat" : "Public chat"}`,
      href: `/groups/${row.id}`,
      score,
    });
  }

  for (const row of opportunities) {
    const searchable = `${row.businessName} ${row.category} ${row.city} ${row.partnershipCategory ?? ""}`;
    const score = rankSearchText(searchable, text);
    if (!score) continue;
    hits.push({
      id: row.businessApplicationId,
      type: "partnership",
      title: row.businessName,
      subtitle: `${row.partnershipCategory ?? "Partnership"} | ${row.city}, ${row.country}`,
      href: "/partnerships",
      score,
    });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, Math.max(5, maxRows));
}

export type NotificationCategory = "offers" | "updates" | "general" | "emergency";
export type NotificationEndpointStatus = "active" | "blocked" | "spam_review";
export type NotificationEndpointIdentifierType = "permanent" | "temporary";

export interface NotificationEndpointRecord {
  id: string;
  ownerUid: string;
  ownerName: string;
  label: string;
  endpointSecret: string;
  status: NotificationEndpointStatus;
  identifierType: NotificationEndpointIdentifierType;
  expiresAt?: string;
  disconnectedAt?: string;
  sentCount: number;
  billedSentCount: number;
  spamReports: number;
  blockedUntil?: string;
  abuseScore: number;
  recentWindowCount: number;
  recentWindowStartedAt?: string;
  deliveredCount: number;
  failedCount: number;
  lastSentAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationDeliveryLogRecord {
  id: string;
  endpointId: string;
  ownerUid: string;
  category: NotificationCategory;
  attempted: number;
  delivered: number;
  failed: number;
  windowCount: number;
  status: "delivered" | "partial" | "throttled";
  createdAt: string;
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
    identifierType: (data.identifierType as NotificationEndpointIdentifierType) ?? "permanent",
    expiresAt: data.expiresAt ? String(data.expiresAt) : undefined,
    disconnectedAt: data.disconnectedAt ? toISODate(data.disconnectedAt) : undefined,
    sentCount: Number(data.sentCount ?? 0),
    billedSentCount: Number(data.billedSentCount ?? 0),
    spamReports: Number(data.spamReports ?? 0),
    blockedUntil: data.blockedUntil ? toISODate(data.blockedUntil) : undefined,
    abuseScore: Number(data.abuseScore ?? 0),
    recentWindowCount: Number(data.recentWindowCount ?? 0),
    recentWindowStartedAt: data.recentWindowStartedAt ? String(data.recentWindowStartedAt) : undefined,
    deliveredCount: Number(data.deliveredCount ?? 0),
    failedCount: Number(data.failedCount ?? 0),
    lastSentAt: data.lastSentAt ? toISODate(data.lastSentAt) : undefined,
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
  } satisfies NotificationEndpointRecord;
}

function mapNotificationDeliveryLog(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    endpointId: String(data.endpointId ?? ""),
    ownerUid: String(data.ownerUid ?? ""),
    category: (data.category as NotificationCategory) ?? "general",
    attempted: Number(data.attempted ?? 0),
    delivered: Number(data.delivered ?? 0),
    failed: Number(data.failed ?? 0),
    windowCount: Number(data.windowCount ?? 0),
    status: (data.status as "delivered" | "partial" | "throttled") ?? "delivered",
    createdAt: toISODate(data.createdAt),
  } satisfies NotificationDeliveryLogRecord;
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
    query(collection(database, "userLookup"), where("publicId", "==", publicId), limit(1)),
  );
  const row = snapshots.docs[0];
  return row ? row.id : null;
}

export async function createNotificationEndpoint(payload: {
  ownerUid: string;
  ownerName: string;
  label: string;
  identifierType?: NotificationEndpointIdentifierType;
  temporaryDurationDays?: number;
}) {
  const database = getDb();
  const canCreate = await userCanCreateBusinessGroup(payload.ownerUid);
  if (!canCreate) {
    throw new Error("Only business users can create notification endpoints.");
  }

  const identifierType = payload.identifierType === "temporary" ? "temporary" : "permanent";
  const temporaryDurationDays =
    identifierType === "temporary"
      ? Math.max(1, Math.min(365, Math.floor(payload.temporaryDurationDays ?? 30)))
      : 0;
  const expiresAt =
    identifierType === "temporary"
      ? new Date(Date.now() + temporaryDurationDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

  const endpointSecret = `nfy_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const endpointRef = await addDoc(collection(database, "notificationEndpoints"), {
    ownerUid: payload.ownerUid,
    ownerName: payload.ownerName,
    label: payload.label,
    endpointSecret,
    status: "active",
    identifierType,
    expiresAt,
    disconnectedAt: null,
    sentCount: 0,
    billedSentCount: 0,
    spamReports: 0,
    abuseScore: 0,
    recentWindowCount: 0,
    recentWindowStartedAt: new Date().toISOString(),
    deliveredCount: 0,
    failedCount: 0,
    blockedUntil: null,
    lastSentAt: null,
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
  if (endpoint.disconnectedAt) {
    throw new Error("Endpoint has been disconnected.");
  }
  if (endpoint.expiresAt && Date.parse(endpoint.expiresAt) <= Date.now()) {
    await updateDoc(doc(database, "notificationEndpoints", payload.endpointId), {
      status: "blocked",
      disconnectedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    throw new Error("Temporary endpoint expired. Create a new endpoint.");
  }
  if (endpoint.blockedUntil && Date.parse(endpoint.blockedUntil) > Date.now()) {
    throw new Error(`Endpoint is temporarily blocked until ${endpoint.blockedUntil}.`);
  }

  const publicIds = [...new Set(payload.recipientPublicIds.map((id) => id.trim()).filter(Boolean))];
  if (!publicIds.length) {
    throw new Error("At least one recipient public ID is required.");
  }
  if (publicIds.length > 200) {
    throw new Error("Maximum 200 recipient IDs allowed per send.");
  }

  const perWindowLimit = Number(process.env.NOTIFICATION_PER_10_MIN_ENDPOINT_LIMIT ?? "1000");
  const windowStartMs = endpoint.recentWindowStartedAt
    ? Date.parse(endpoint.recentWindowStartedAt)
    : 0;
  const now = Date.now();
  const inSameWindow = now - windowStartMs < 10 * 60 * 1000;
  const nextWindowCount = (inSameWindow ? endpoint.recentWindowCount : 0) + publicIds.length;
  if (nextWindowCount > perWindowLimit) {
    const blockedUntil = new Date(now + 30 * 60 * 1000).toISOString();
    await updateDoc(doc(database, "notificationEndpoints", payload.endpointId), {
      status: "spam_review",
      blockedUntil,
      abuseScore: increment(1),
      updatedAt: serverTimestamp(),
    });
    await addDoc(collection(database, "notificationDeliveryLogs"), {
      endpointId: payload.endpointId,
      ownerUid: payload.ownerUid,
      category: payload.category,
      attempted: publicIds.length,
      delivered: 0,
      failed: publicIds.length,
      windowCount: nextWindowCount,
      status: "throttled",
      createdAt: serverTimestamp(),
    });
    throw new Error(
      `Endpoint send rate exceeded (${perWindowLimit}/10min). Endpoint moved to spam review.`,
    );
  }

  let delivered = 0;
  let failed = 0;
  for (const publicId of publicIds) {
    const uid = await getUserUidByPublicId(publicId);
    if (!uid) {
      failed += 1;
      continue;
    }
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
    sentCount: increment(publicIds.length),
    deliveredCount: increment(delivered),
    failedCount: increment(failed),
    abuseScore: failed > delivered ? increment(1) : increment(0),
    recentWindowCount: inSameWindow ? nextWindowCount : publicIds.length,
    recentWindowStartedAt: inSameWindow ? endpoint.recentWindowStartedAt : new Date().toISOString(),
    lastSentAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(database, "notificationDeliveryLogs"), {
    endpointId: payload.endpointId,
    ownerUid: payload.ownerUid,
    category: payload.category,
    attempted: publicIds.length,
    delivered,
    failed,
    windowCount: inSameWindow ? nextWindowCount : publicIds.length,
    status: failed === 0 ? "delivered" : "partial",
    createdAt: serverTimestamp(),
  });

  return delivered;
}

export async function ownerDisconnectNotificationEndpoint(payload: {
  endpointId: string;
  ownerUid: string;
}) {
  const database = getDb();
  const ref = doc(database, "notificationEndpoints", payload.endpointId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    throw new Error("Notification endpoint not found.");
  }
  const endpoint = mapEndpoint(payload.endpointId, snapshot.data());
  if (endpoint.ownerUid !== payload.ownerUid) {
    throw new Error("You cannot disconnect this endpoint.");
  }
  await updateDoc(ref, {
    status: "blocked",
    disconnectedAt: serverTimestamp(),
    blockedUntil: null,
    updatedAt: serverTimestamp(),
  });
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
  const shouldBlock = nextReports >= 20;
  await updateDoc(endpointRef, {
    spamReports: increment(1),
    status: nextReports >= 10 ? "spam_review" : endpoint.status,
    blockedUntil: shouldBlock ? new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString() : null,
    abuseScore: increment(1),
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

export async function fetchNotificationDeliveryLogsByOwner(ownerUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "notificationDeliveryLogs"),
      where("ownerUid", "==", ownerUid),
      orderBy("createdAt", "desc"),
      limit(400),
    ),
  );
  return snapshots.docs.map((snapshot) => mapNotificationDeliveryLog(snapshot.id, snapshot.data()));
}

export async function fetchAdminNotificationDeliveryLogs() {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "notificationDeliveryLogs"), orderBy("createdAt", "desc"), limit(500)),
  );
  return snapshots.docs.map((snapshot) => mapNotificationDeliveryLog(snapshot.id, snapshot.data()));
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

export interface AdTagPlanRecord {
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
}

export interface AdCampaignRecord {
  id: string;
  ownerUid: string;
  ownerName: string;
  title: string;
  imageUrl: string;
  destinationUrl: string;
  placement: AdPlacement;
  cityTargets: string[];
  tagPlanName?: string;
  tagPlanCycle?: "monthly" | "yearly";
  tagPlanMonthlyPrice?: number;
  tagPlanYearlyPrice?: number;
  tagPlanLastBilledMonthKey?: string;
  tagPlanLastBilledYear?: string;
  status: AdCampaignStatus;
  impressions: number;
  clicks: number;
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
    tagPlanName: data.tagPlanName ? String(data.tagPlanName) : undefined,
    tagPlanCycle: data.tagPlanCycle
      ? (String(data.tagPlanCycle) as "monthly" | "yearly")
      : undefined,
    tagPlanMonthlyPrice: data.tagPlanMonthlyPrice
      ? Number(data.tagPlanMonthlyPrice)
      : undefined,
    tagPlanYearlyPrice: data.tagPlanYearlyPrice
      ? Number(data.tagPlanYearlyPrice)
      : undefined,
    tagPlanLastBilledMonthKey: data.tagPlanLastBilledMonthKey
      ? String(data.tagPlanLastBilledMonthKey)
      : undefined,
    tagPlanLastBilledYear: data.tagPlanLastBilledYear
      ? String(data.tagPlanLastBilledYear)
      : undefined,
    status: (data.status as AdCampaignStatus) ?? "draft",
    impressions: Number(data.impressions ?? 0),
    clicks: Number(data.clicks ?? 0),
    billedImpressions: Number(data.billedImpressions ?? 0),
    notes: data.notes ? String(data.notes) : undefined,
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
  } satisfies AdCampaignRecord;
}

function normalizeAdTagPlans(raw: unknown) {
  if (!Array.isArray(raw)) return [] as AdTagPlanRecord[];
  const rows = raw
    .map((entry) => {
      const row = entry as Record<string, unknown>;
      const name = String(row.name ?? "").trim();
      const monthlyPrice = Number(row.monthlyPrice ?? 0);
      const yearlyPrice = Number(row.yearlyPrice ?? 0);
      if (!name || !Number.isFinite(monthlyPrice) || monthlyPrice <= 0) return null;
      return {
        name,
        monthlyPrice: Math.max(1, Math.round(monthlyPrice)),
        yearlyPrice:
          Number.isFinite(yearlyPrice) && yearlyPrice > 0
            ? Math.max(1, Math.round(yearlyPrice))
            : Math.max(1, Math.round(monthlyPrice * 10)),
      } satisfies AdTagPlanRecord;
    })
    .filter((row): row is AdTagPlanRecord => Boolean(row));
  const deduped = new Map<string, AdTagPlanRecord>();
  for (const row of rows) {
    const key = row.name.toLowerCase();
    if (!deduped.has(key)) deduped.set(key, row);
  }
  return Array.from(deduped.values());
}

export async function fetchAdPricingSettings() {
  const database = getDb();
  const ref = doc(database, "platformSettings", "ads");
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    const defaultTagPlans: AdTagPlanRecord[] = [
      { name: "recommended", monthlyPrice: 499, yearlyPrice: 4990 },
    ];
    return {
      homeBannerCpm: 120,
      directoryBannerCpm: 80,
      recommendedTagMonthly: 499,
      recommendedTagYearly: 4990,
      customTagPlans: defaultTagPlans,
      cityTargetingSurchargePercent: 10,
    };
  }
  const customTagPlans = normalizeAdTagPlans(snapshot.data().customTagPlans);
  return {
    homeBannerCpm: Number(snapshot.data().homeBannerCpm ?? 120),
    directoryBannerCpm: Number(snapshot.data().directoryBannerCpm ?? 80),
    recommendedTagMonthly: Number(snapshot.data().recommendedTagMonthly ?? 499),
    recommendedTagYearly: Number(snapshot.data().recommendedTagYearly ?? 4990),
    customTagPlans,
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
  recommendedTagYearly: number;
  customTagPlans: AdTagPlanRecord[];
  cityTargetingSurchargePercent: number;
}) {
  const database = getDb();
  await setDoc(
    doc(database, "platformSettings", "ads"),
    {
      homeBannerCpm: payload.homeBannerCpm,
      directoryBannerCpm: payload.directoryBannerCpm,
      recommendedTagMonthly: payload.recommendedTagMonthly,
      recommendedTagYearly: payload.recommendedTagYearly,
      customTagPlans: normalizeAdTagPlans(payload.customTagPlans),
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
  tagPlanName?: string;
  tagPlanCycle?: "monthly" | "yearly";
  tagPlanMonthlyPrice?: number;
  tagPlanYearlyPrice?: number;
}) {
  const database = getDb();
  const canCreate = await userCanCreateBusinessGroup(payload.ownerUid);
  if (!canCreate) {
    throw new Error("Only business users can create ad campaigns.");
  }
  const normalizedImageUrl = normalizeHttpUrl(payload.imageUrl);
  const normalizedDestinationUrl = normalizeHttpUrl(payload.destinationUrl);
  if (!normalizedImageUrl || !normalizedDestinationUrl) {
    throw new Error("Ad campaign requires valid http/https image and destination URLs.");
  }

  const ref = await addDoc(collection(database, "adCampaigns"), {
    ownerUid: payload.ownerUid,
    ownerName: payload.ownerName,
    title: payload.title,
    imageUrl: normalizedImageUrl,
    destinationUrl: normalizedDestinationUrl,
    placement: payload.placement,
    cityTargets: payload.cityTargets,
    tagPlanName: payload.tagPlanName ?? null,
    tagPlanCycle: payload.tagPlanCycle ?? null,
    tagPlanMonthlyPrice: payload.tagPlanMonthlyPrice ?? null,
    tagPlanYearlyPrice: payload.tagPlanYearlyPrice ?? null,
    tagPlanLastBilledMonthKey: null,
    tagPlanLastBilledYear: null,
    status: "draft",
    impressions: 0,
    clicks: 0,
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

export async function registerAdClick(campaignId: string) {
  const database = getDb();
  await updateDoc(doc(database, "adCampaigns", campaignId), {
    clicks: increment(1),
    updatedAt: serverTimestamp(),
  });
}

export interface AdPerformanceReportRow {
  campaignId: string;
  ownerUid: string;
  ownerName: string;
  title: string;
  placement: AdPlacement;
  cityTargets: string[];
  status: AdCampaignStatus;
  impressions: number;
  clicks: number;
  ctrPercent: number;
  estimatedCost: number;
}

export async function buildAdPerformanceReport(payload?: {
  ownerUid?: string;
  onlyActive?: boolean;
}) {
  const campaigns = payload?.ownerUid
    ? await fetchAdCampaignsByOwner(payload.ownerUid)
    : await fetchAdminAdCampaigns();
  const pricing = await fetchAdPricingSettings();
  const rows = campaigns
    .filter((campaign) => (payload?.onlyActive ? campaign.status === "active" : true))
    .map((campaign) => {
      const cpm =
        campaign.placement === "home_banner"
          ? pricing.homeBannerCpm
          : pricing.directoryBannerCpm;
      const cityMultiplier =
        campaign.cityTargets.length > 0
          ? 1 + pricing.cityTargetingSurchargePercent / 100
          : 1;
      const estimatedCost = Math.round(
        Math.ceil(Math.max(campaign.impressions - campaign.billedImpressions, 0) / 1000) *
          cpm *
          cityMultiplier,
      );
      const ctrPercent =
        campaign.impressions > 0
          ? Math.round((campaign.clicks / campaign.impressions) * 10000) / 100
          : 0;
      return {
        campaignId: campaign.id,
        ownerUid: campaign.ownerUid,
        ownerName: campaign.ownerName,
        title: campaign.title,
        placement: campaign.placement,
        cityTargets: campaign.cityTargets,
        status: campaign.status,
        impressions: campaign.impressions,
        clicks: campaign.clicks,
        ctrPercent,
        estimatedCost,
      } satisfies AdPerformanceReportRow;
    })
    .sort((a, b) => b.impressions - a.impressions);

  return {
    summary: {
      campaigns: rows.length,
      impressions: rows.reduce((sum, row) => sum + row.impressions, 0),
      clicks: rows.reduce((sum, row) => sum + row.clicks, 0),
      estimatedCost: rows.reduce((sum, row) => sum + row.estimatedCost, 0),
    },
    rows,
  };
}

export async function buildAdPerformanceCsv(payload?: { ownerUid?: string; onlyActive?: boolean }) {
  const report = await buildAdPerformanceReport(payload);
  const lines = [
    [
      "campaign_id",
      "owner_uid",
      "owner_name",
      "title",
      "placement",
      "city_targets",
      "status",
      "impressions",
      "clicks",
      "ctr_percent",
      "estimated_cost",
    ].join(","),
  ];
  for (const row of report.rows) {
    lines.push(
      [
        row.campaignId,
        row.ownerUid,
        row.ownerName.replace(/,/g, " "),
        row.title.replace(/,/g, " "),
        row.placement,
        row.cityTargets.join("|"),
        row.status,
        row.impressions,
        row.clicks,
        row.ctrPercent,
        row.estimatedCost,
      ].join(","),
    );
  }
  return lines.join("\n");
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
  const digitalSalesCommission = Math.round(grossSales * 0.1);
  const membershipTxSnapshots = await getDocs(
    query(
      collection(database, "membershipTransactions"),
      where("businessOwnerUid", "==", payload.ownerUid),
      limit(5000),
    ),
  );
  const externalSalesGross = membershipTxSnapshots.docs
    .map((snapshot) => {
      const data = snapshot.data();
      return {
        occurredAt: data.occurredAt ? String(data.occurredAt) : toISODate(data.createdAt),
        value: Number(data.transactionValue ?? 0),
      };
    })
    .filter((row) => row.value > 0 && row.occurredAt.startsWith(monthKey))
    .reduce((sum, row) => sum + row.value, 0);
  const externalSalesCommission = Math.round(externalSalesGross * 0.02);
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
  const currentYear = monthKey.slice(0, 4);
  const tagPlanMonthlyCampaignIds: string[] = [];
  const tagPlanYearlyCampaignIds: string[] = [];
  const tagPlanSubscriptionFee = activeCampaigns.reduce((sum, campaign) => {
    if (!campaign.tagPlanName || !campaign.tagPlanCycle) return sum;
    if (campaign.tagPlanCycle === "monthly") {
      const monthlyPrice = Number(campaign.tagPlanMonthlyPrice ?? 0);
      if (monthlyPrice > 0) {
        tagPlanMonthlyCampaignIds.push(campaign.id);
        return sum + monthlyPrice;
      }
      return sum;
    }
    const yearlyPrice = Number(campaign.tagPlanYearlyPrice ?? 0);
    if (yearlyPrice <= 0) return sum;
    if (campaign.tagPlanLastBilledYear === currentYear) {
      return sum;
    }
    tagPlanYearlyCampaignIds.push(campaign.id);
    return sum + yearlyPrice;
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
      label: "Digital product commission (10%)",
      amount: digitalSalesCommission,
      details: `Platform product sales INR ${grossSales}`,
    },
    {
      label: "External sales reporting commission (2%)",
      amount: externalSalesCommission,
      details: `Uploaded online/offline sales INR ${externalSalesGross}`,
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
      label: "Ad tag plan subscriptions",
      amount: tagPlanSubscriptionFee,
      details: `${tagPlanMonthlyCampaignIds.length} monthly + ${tagPlanYearlyCampaignIds.length} yearly plan(s)`,
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
    const updates: Record<string, unknown> = {
      billedImpressions: campaign.impressions,
      updatedAt: serverTimestamp(),
    };
    if (tagPlanMonthlyCampaignIds.includes(campaign.id)) {
      updates.tagPlanLastBilledMonthKey = monthKey;
    }
    if (tagPlanYearlyCampaignIds.includes(campaign.id)) {
      updates.tagPlanLastBilledYear = currentYear;
    }
    await updateDoc(doc(database, "adCampaigns", campaign.id), updates);
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

export interface MembershipApiUsageBucketRecord {
  id: string;
  businessOwnerUid: string;
  endpoint: "discount_validate" | "transaction_ingest" | "distribution_cron";
  windowStart: string;
  windowMinutes: number;
  count: number;
  metadata?: Record<string, string | number | boolean | null>;
}

function mapMembershipUsageBucket(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    businessOwnerUid: String(data.businessOwnerUid ?? ""),
    endpoint:
      (data.endpoint as MembershipApiUsageBucketRecord["endpoint"]) ?? "discount_validate",
    windowStart: String(data.windowStart ?? ""),
    windowMinutes: Number(data.windowMinutes ?? 10),
    count: Number(data.count ?? 0),
    metadata:
      (data.metadata as Record<string, string | number | boolean | null>) ?? undefined,
  } satisfies MembershipApiUsageBucketRecord;
}

export async function fetchMembershipApiUsageByBusiness(ownerUid: string, limitRows = 300) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "membershipApiUsageBuckets"),
      where("businessOwnerUid", "==", ownerUid),
      limit(Math.max(1, Math.min(limitRows, 1000))),
    ),
  );
  return snapshots.docs
    .map((snapshot) => mapMembershipUsageBucket(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.windowStart) - Date.parse(a.windowStart));
}

export async function fetchAdminMembershipApiUsage(limitRows = 500) {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "membershipApiUsageBuckets"), limit(Math.max(1, Math.min(limitRows, 2000)))),
  );
  return snapshots.docs
    .map((snapshot) => mapMembershipUsageBucket(snapshot.id, snapshot.data()))
    .sort((a, b) => Date.parse(b.windowStart) - Date.parse(a.windowStart));
}

export async function fetchMembershipEconomicsSettings() {
  const database = getDb();
  const ref = doc(database, "platformSettings", "membershipEconomics");
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
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
  const userRef = doc(database, "users", customerUid);
  const userSnapshot = await getDoc(userRef);
  if (!userSnapshot.exists()) {
    throw new Error("Customer profile not found.");
  }
  const existing = String(userSnapshot.data().publicId ?? "").trim();
  if (existing) return existing;
  const generated = await generateUniqueUserPublicId();
  await updateDoc(userRef, {
    publicId: generated,
    updatedAt: serverTimestamp(),
  });
  await syncUserLookupRecord({
    uid: customerUid,
    email: String(userSnapshot.data().email ?? ""),
    displayName: String(userSnapshot.data().displayName ?? "Customer"),
    publicId: generated,
    role: String(userSnapshot.data().role ?? "customer"),
  });
  return generated;
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

export type BusinessShopThemeKey =
  | "clean_modern"
  | "classic_store"
  | "midnight_premium"
  | "sunrise_market"
  | "minimal_grid";

export type BusinessShopCurrencyMode = "INR" | "USD" | "BOTH";

export interface BusinessShopSettingsInput {
  storeTitle: string;
  storeTagline: string;
  storeDescription: string;
  supportEmail: string;
  supportPhone: string;
  currencyMode: BusinessShopCurrencyMode;
  themeKey: BusinessShopThemeKey;
  themeAccent: string;
  customDomain?: string;
  customDomainStatus:
    | "not_set"
    | "pending_verification"
    | "verified"
    | "rejected";
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string[];
  allowGuestCheckout: boolean;
  autoAcceptOrders: boolean;
  enableCod: boolean;
  enableWallet: boolean;
  publishProducts: boolean;
  publishServices: boolean;
  showStock: boolean;
  showTrustBadge: boolean;
  lowStockThreshold: number;
  orderNotificationEmail: string;
  shippingPolicy: string;
  returnPolicy: string;
}

export interface BusinessShopSettingsRecord extends BusinessShopSettingsInput {
  id: string;
  businessId: string;
  businessSlug: string;
  businessName: string;
  ownerUid: string;
  ownerName: string;
  createdAt: string;
  updatedAt: string;
  lastPublishedAt?: string;
}

export interface PublicBusinessShopBundle {
  business: BusinessApplicationRecord;
  shop: BusinessShopSettingsRecord;
}

export type ShopCouponDiscountType = "percent" | "fixed";

export interface ShopCouponInput {
  code: string;
  label: string;
  description?: string;
  discountType: ShopCouponDiscountType;
  discountValue: number;
  minOrderAmountInr: number;
  maxDiscountAmountInr?: number;
  usageLimitTotal?: number;
  appliesToPlanKeys: string[];
  startsAt?: string;
  endsAt?: string;
  active: boolean;
}

export interface ShopCouponRecord extends ShopCouponInput {
  id: string;
  ownerUid: string;
  businessId: string;
  businessSlug: string;
  usedCount: number;
  createdAt: string;
  updatedAt: string;
}

export type ShopTaxRuleScope = "global" | "country" | "city";

export interface ShopTaxRuleInput {
  label: string;
  scope: ShopTaxRuleScope;
  countryCode?: string;
  city?: string;
  ratePercent: number;
  active: boolean;
}

export interface ShopTaxRuleRecord extends ShopTaxRuleInput {
  id: string;
  ownerUid: string;
  businessId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShopShippingZoneInput {
  label: string;
  countries: string[];
  cities: string[];
  feeInr: number;
  freeShippingMinOrderInr?: number;
  active: boolean;
}

export interface ShopShippingZoneRecord extends ShopShippingZoneInput {
  id: string;
  ownerUid: string;
  businessId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShopInventoryLogRecord {
  id: string;
  ownerUid: string;
  businessId?: string;
  itemType: "product" | "service";
  itemId: string;
  itemTitle: string;
  source: "manual_create" | "manual_adjustment" | "catalog_sync";
  previousStock?: number;
  nextStock?: number;
  change?: number;
  note?: string;
  createdAt: string;
}

export type AbandonedCheckoutStatus = "open" | "recovered" | "abandoned";

export interface AbandonedCheckoutRecord {
  id: string;
  ownerUid: string;
  ownerName: string;
  ownerEmail: string;
  businessOwnerUid: string;
  businessOwnerName: string;
  productId: string;
  productSlug: string;
  productTitle: string;
  pricingPlanKey: string;
  pricingPlanName: string;
  pricingPlanBillingCycle: DigitalProductPricingCycle;
  currency: PaymentCurrency;
  status: AbandonedCheckoutStatus;
  checkoutCountry?: string;
  checkoutCity?: string;
  pricingBreakdown: CheckoutPricingBreakdownRecord;
  paymentIntentId?: string;
  orderId?: string;
  recoveredAt?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShopCheckoutContextRecord {
  coupons: ShopCouponRecord[];
  shippingZones: ShopShippingZoneRecord[];
  taxRules: ShopTaxRuleRecord[];
}

function normalizeCouponCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");
}

function normalizeTaxScope(value: string): ShopTaxRuleScope {
  if (value === "country" || value === "city") return value;
  return "global";
}

function normalizeCountryCode(value: string | undefined) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
}

function normalizeCityName(value: string | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function mapShopCoupon(snapshotId: string, data: Record<string, unknown>) {
  const code = normalizeCouponCode(String(data.code ?? ""));
  return {
    id: snapshotId,
    ownerUid: String(data.ownerUid ?? ""),
    businessId: String(data.businessId ?? ""),
    businessSlug: String(data.businessSlug ?? ""),
    code,
    label: String((data.label ?? code) || "Coupon"),
    description: data.description ? String(data.description) : undefined,
    discountType: data.discountType === "fixed" ? "fixed" : "percent",
    discountValue: Math.max(0, Number(data.discountValue ?? 0)),
    minOrderAmountInr: Math.max(0, Number(data.minOrderAmountInr ?? 0)),
    maxDiscountAmountInr: data.maxDiscountAmountInr
      ? Math.max(0, Number(data.maxDiscountAmountInr))
      : undefined,
    usageLimitTotal: data.usageLimitTotal
      ? Math.max(1, Math.round(Number(data.usageLimitTotal)))
      : undefined,
    appliesToPlanKeys: Array.isArray(data.appliesToPlanKeys)
      ? (data.appliesToPlanKeys as unknown[]).map((entry) => String(entry).trim().toLowerCase()).filter(Boolean)
      : [],
    startsAt: data.startsAt ? String(data.startsAt) : undefined,
    endsAt: data.endsAt ? String(data.endsAt) : undefined,
    active: Boolean(data.active),
    usedCount: Math.max(0, Number(data.usedCount ?? 0)),
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
  } satisfies ShopCouponRecord;
}

function mapShopTaxRule(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    ownerUid: String(data.ownerUid ?? ""),
    businessId: String(data.businessId ?? ""),
    label: String(data.label ?? "Tax rule"),
    scope: normalizeTaxScope(String(data.scope ?? "global")),
    countryCode: data.countryCode ? String(data.countryCode) : undefined,
    city: data.city ? String(data.city) : undefined,
    ratePercent: Math.max(0, Number(data.ratePercent ?? 0)),
    active: Boolean(data.active),
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
  } satisfies ShopTaxRuleRecord;
}

function mapShopShippingZone(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    ownerUid: String(data.ownerUid ?? ""),
    businessId: String(data.businessId ?? ""),
    label: String(data.label ?? "Shipping zone"),
    countries: Array.isArray(data.countries)
      ? (data.countries as unknown[]).map((entry) => String(entry).trim().toUpperCase()).filter(Boolean)
      : [],
    cities: Array.isArray(data.cities)
      ? (data.cities as unknown[]).map((entry) => String(entry).trim().toLowerCase()).filter(Boolean)
      : [],
    feeInr: Math.max(0, Number(data.feeInr ?? 0)),
    freeShippingMinOrderInr: data.freeShippingMinOrderInr
      ? Math.max(0, Number(data.freeShippingMinOrderInr))
      : undefined,
    active: Boolean(data.active),
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
  } satisfies ShopShippingZoneRecord;
}

function mapShopInventoryLog(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    ownerUid: String(data.ownerUid ?? ""),
    businessId: data.businessId ? String(data.businessId) : undefined,
    itemType: data.itemType === "service" ? "service" : "product",
    itemId: String(data.itemId ?? ""),
    itemTitle: String(data.itemTitle ?? ""),
    source: data.source === "catalog_sync"
      ? "catalog_sync"
      : data.source === "manual_adjustment"
        ? "manual_adjustment"
        : "manual_create",
    previousStock: data.previousStock === null || data.previousStock === undefined
      ? undefined
      : Number(data.previousStock),
    nextStock: data.nextStock === null || data.nextStock === undefined
      ? undefined
      : Number(data.nextStock),
    change: data.change === null || data.change === undefined
      ? undefined
      : Number(data.change),
    note: data.note ? String(data.note) : undefined,
    createdAt: toISODate(data.createdAt),
  } satisfies ShopInventoryLogRecord;
}

function mapAbandonedCheckout(snapshotId: string, data: Record<string, unknown>) {
  const pricingRaw = (data.pricingBreakdown as Record<string, unknown> | undefined) ?? {};
  return {
    id: snapshotId,
    ownerUid: String(data.ownerUid ?? ""),
    ownerName: String(data.ownerName ?? "Customer"),
    ownerEmail: String(data.ownerEmail ?? ""),
    businessOwnerUid: String(data.businessOwnerUid ?? ""),
    businessOwnerName: String(data.businessOwnerName ?? "Business"),
    productId: String(data.productId ?? ""),
    productSlug: String(data.productSlug ?? ""),
    productTitle: String(data.productTitle ?? ""),
    pricingPlanKey: String(data.pricingPlanKey ?? ""),
    pricingPlanName: String(data.pricingPlanName ?? ""),
    pricingPlanBillingCycle:
      String(data.pricingPlanBillingCycle ?? "one_time") === "monthly"
        ? "monthly"
        : String(data.pricingPlanBillingCycle ?? "one_time") === "yearly"
          ? "yearly"
          : "one_time",
    currency: normalizePaymentCurrency(data.currency),
    status:
      data.status === "recovered"
        ? "recovered"
        : data.status === "abandoned"
          ? "abandoned"
          : "open",
    checkoutCountry: data.checkoutCountry ? String(data.checkoutCountry) : undefined,
    checkoutCity: data.checkoutCity ? String(data.checkoutCity) : undefined,
    pricingBreakdown: {
      baseAmountInr: Number(pricingRaw.baseAmountInr ?? data.amount ?? 0),
      discountAmountInr: Number(pricingRaw.discountAmountInr ?? 0),
      shippingAmountInr: Number(pricingRaw.shippingAmountInr ?? 0),
      taxAmountInr: Number(pricingRaw.taxAmountInr ?? 0),
      finalAmountInr: Number(pricingRaw.finalAmountInr ?? data.amount ?? 0),
      appliedCouponCode: pricingRaw.appliedCouponCode
        ? String(pricingRaw.appliedCouponCode)
        : undefined,
      appliedCouponId: pricingRaw.appliedCouponId
        ? String(pricingRaw.appliedCouponId)
        : undefined,
      shippingZoneId: pricingRaw.shippingZoneId
        ? String(pricingRaw.shippingZoneId)
        : undefined,
      shippingZoneLabel: pricingRaw.shippingZoneLabel
        ? String(pricingRaw.shippingZoneLabel)
        : undefined,
      taxRuleIds: Array.isArray(pricingRaw.taxRuleIds)
        ? (pricingRaw.taxRuleIds as unknown[]).map((entry) => String(entry))
        : [],
    },
    paymentIntentId: data.paymentIntentId ? String(data.paymentIntentId) : undefined,
    orderId: data.orderId ? String(data.orderId) : undefined,
    recoveredAt: data.recoveredAt ? toISODate(data.recoveredAt) : undefined,
    failureReason: data.failureReason ? String(data.failureReason) : undefined,
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
  } satisfies AbandonedCheckoutRecord;
}

function sortByUpdatedDesc<T extends { updatedAt: string }>(rows: T[]) {
  return [...rows].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

function sortByCreatedDesc<T extends { createdAt: string }>(rows: T[]) {
  return [...rows].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

async function fetchBusinessShopCheckoutContext(
  businessOwnerUid: string,
): Promise<ShopCheckoutContextRecord> {
  const business = await fetchPrimaryBusinessByOwner(businessOwnerUid);
  if (!business) {
    return { coupons: [], shippingZones: [], taxRules: [] };
  }
  const database = getDb();
  const [couponSnapshots, taxSnapshots, shippingSnapshots] = await Promise.all([
    getDocs(
      query(collection(database, "businessShopCoupons"), where("businessId", "==", business.id), limit(150)),
    ),
    getDocs(
      query(collection(database, "businessShopTaxRules"), where("businessId", "==", business.id), limit(120)),
    ),
    getDocs(
      query(collection(database, "businessShopShippingZones"), where("businessId", "==", business.id), limit(120)),
    ),
  ]);
  const coupons = couponSnapshots.docs
    .map((snapshot) => mapShopCoupon(snapshot.id, snapshot.data()))
    .filter((row) => row.active);
  const taxRules = taxSnapshots.docs
    .map((snapshot) => mapShopTaxRule(snapshot.id, snapshot.data()))
    .filter((row) => row.active);
  const shippingZones = shippingSnapshots.docs
    .map((snapshot) => mapShopShippingZone(snapshot.id, snapshot.data()))
    .filter((row) => row.active);
  return {
    coupons: sortByUpdatedDesc(coupons),
    shippingZones: sortByUpdatedDesc(shippingZones),
    taxRules: sortByUpdatedDesc(taxRules),
  };
}

function isCouponEligibleNow(coupon: ShopCouponRecord, now = new Date()) {
  if (!coupon.active) return false;
  if (coupon.startsAt && Date.parse(coupon.startsAt) > now.getTime()) return false;
  if (coupon.endsAt && Date.parse(coupon.endsAt) < now.getTime()) return false;
  if (coupon.usageLimitTotal && coupon.usedCount >= coupon.usageLimitTotal) return false;
  return true;
}

export async function computeCheckoutPricingForProduct(payload: {
  businessOwnerUid: string;
  selectedPlanPriceInr: number;
  pricingPlanKey?: string;
  customerUid?: string;
  couponCode?: string;
  shippingZoneId?: string;
  checkoutCountry?: string;
  checkoutCity?: string;
}) {
  const baseAmountInr = Math.max(1, Math.round(Number(payload.selectedPlanPriceInr) || 0));
  const context = await fetchBusinessShopCheckoutContext(payload.businessOwnerUid);
  const now = new Date();
  let discountAmountInr = 0;
  let shippingAmountInr = 0;
  let appliedCoupon: ShopCouponRecord | null = null;
  let appliedShippingZone: ShopShippingZoneRecord | null = null;

  const requestedCoupon = normalizeCouponCode(payload.couponCode ?? "");
  if (requestedCoupon) {
    const coupon = context.coupons.find((row) => row.code === requestedCoupon);
    if (!coupon) {
      throw new Error("Coupon code is invalid.");
    }
    if (!isCouponEligibleNow(coupon, now)) {
      throw new Error("Coupon is not active.");
    }
    if (coupon.minOrderAmountInr > baseAmountInr) {
      throw new Error(`Coupon requires minimum order INR ${coupon.minOrderAmountInr}.`);
    }
    if (coupon.appliesToPlanKeys.length) {
      const key = String(payload.pricingPlanKey ?? "").trim().toLowerCase();
      if (!coupon.appliesToPlanKeys.includes(key)) {
        throw new Error("Coupon is not valid for selected pricing plan.");
      }
    }
    const rawDiscount =
      coupon.discountType === "fixed"
        ? coupon.discountValue
        : Math.round((baseAmountInr * coupon.discountValue) / 100);
    discountAmountInr = Math.min(
      baseAmountInr,
      coupon.maxDiscountAmountInr
        ? Math.min(rawDiscount, coupon.maxDiscountAmountInr)
        : rawDiscount,
    );
    appliedCoupon = coupon;
  }

  if (payload.shippingZoneId?.trim()) {
    const zone = context.shippingZones.find((row) => row.id === payload.shippingZoneId);
    if (!zone) {
      throw new Error("Shipping zone is invalid.");
    }
    const countryCode = normalizeCountryCode(payload.checkoutCountry);
    const cityName = normalizeCityName(payload.checkoutCity);
    if (zone.countries.length && countryCode && !zone.countries.includes(countryCode)) {
      throw new Error("Shipping zone is not available for selected country.");
    }
    if (zone.cities.length && cityName && !zone.cities.includes(cityName)) {
      throw new Error("Shipping zone is not available for selected city.");
    }
    const subtotalAfterDiscount = Math.max(baseAmountInr - discountAmountInr, 0);
    shippingAmountInr =
      zone.freeShippingMinOrderInr && subtotalAfterDiscount >= zone.freeShippingMinOrderInr
        ? 0
        : zone.feeInr;
    appliedShippingZone = zone;
  }

  const countryCode = normalizeCountryCode(payload.checkoutCountry);
  const cityName = normalizeCityName(payload.checkoutCity);
  const applicableTaxRules = context.taxRules.filter((row) => {
    if (!row.active) return false;
    if (row.scope === "global") return true;
    if (row.scope === "country") {
      return normalizeCountryCode(row.countryCode) === countryCode;
    }
    if (!cityName) return false;
    if (normalizeCityName(row.city) !== cityName) return false;
    if (row.countryCode && countryCode) {
      return normalizeCountryCode(row.countryCode) === countryCode;
    }
    return true;
  });
  const taxableAmount = Math.max(baseAmountInr - discountAmountInr + shippingAmountInr, 0);
  const totalTaxRate = applicableTaxRules.reduce((sum, row) => sum + row.ratePercent, 0);
  const taxAmountInr = Math.max(0, Math.round((taxableAmount * totalTaxRate) / 100));
  const finalAmountInr = Math.max(
    1,
    Math.round(baseAmountInr - discountAmountInr + shippingAmountInr + taxAmountInr),
  );
  return {
    baseAmountInr,
    discountAmountInr,
    shippingAmountInr,
    taxAmountInr,
    finalAmountInr,
    appliedCouponCode: appliedCoupon?.code,
    appliedCouponId: appliedCoupon?.id,
    shippingZoneId: appliedShippingZone?.id,
    shippingZoneLabel: appliedShippingZone?.label,
    taxRuleIds: applicableTaxRules.map((row) => row.id),
  } satisfies CheckoutPricingBreakdownRecord;
}

function normalizeThemeKey(value: string): BusinessShopThemeKey {
  const clean = value.trim();
  if (
    clean === "clean_modern" ||
    clean === "classic_store" ||
    clean === "midnight_premium" ||
    clean === "sunrise_market" ||
    clean === "minimal_grid"
  ) {
    return clean;
  }
  return "clean_modern";
}

function normalizeShopDomain(raw: string | undefined) {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!value) return "";
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)) return "";
  return value;
}

function normalizeSeoKeywords(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 24),
    ),
  );
}

function buildDefaultBusinessShopSettings(
  business: BusinessApplicationRecord,
): Omit<BusinessShopSettingsRecord, "id" | "createdAt" | "updatedAt"> {
  return {
    businessId: business.id,
    businessSlug: business.slug,
    businessName: business.businessName,
    ownerUid: business.ownerUid,
    ownerName: business.businessName,
    storeTitle: `${business.businessName} Store`,
    storeTagline: "Verified store with secure checkout",
    storeDescription:
      "This storefront is powered by Business Verifier with profile transparency, verified identity, and dispute-ready support.",
    supportEmail: business.supportEmail,
    supportPhone: business.supportPhone,
    currencyMode: "BOTH",
    themeKey: "clean_modern",
    themeAccent: "#2563eb",
    customDomain: "",
    customDomainStatus: "not_set",
    seoTitle: `${business.businessName} | Verified Store`,
    seoDescription: `Shop with confidence at ${business.businessName}. Verified business details, secure payments, and transparent support.`,
    seoKeywords: normalizeSeoKeywords([
      business.businessName,
      business.category,
      "verified business",
      "secure shopping",
    ]),
    allowGuestCheckout: false,
    autoAcceptOrders: true,
    enableCod: false,
    enableWallet: true,
    publishProducts: true,
    publishServices: true,
    showStock: true,
    showTrustBadge: true,
    lowStockThreshold: 10,
    orderNotificationEmail: business.supportEmail,
    shippingPolicy: "Shipping and delivery timelines are shared during checkout.",
    returnPolicy:
      "Returns and refunds follow product policy and platform dispute workflow.",
  };
}

function mapBusinessShopSettings(snapshotId: string, data: Record<string, unknown>) {
  return {
    id: snapshotId,
    businessId: String(data.businessId ?? ""),
    businessSlug: String(data.businessSlug ?? ""),
    businessName: String(data.businessName ?? ""),
    ownerUid: String(data.ownerUid ?? ""),
    ownerName: String(data.ownerName ?? "Business"),
    storeTitle: String(data.storeTitle ?? "Store"),
    storeTagline: String(data.storeTagline ?? ""),
    storeDescription: String(data.storeDescription ?? ""),
    supportEmail: String(data.supportEmail ?? ""),
    supportPhone: String(data.supportPhone ?? ""),
    currencyMode:
      String(data.currencyMode ?? "INR") === "USD"
        ? "USD"
        : String(data.currencyMode ?? "INR") === "BOTH"
          ? "BOTH"
          : "INR",
    themeKey: normalizeThemeKey(String(data.themeKey ?? "clean_modern")),
    themeAccent: String(data.themeAccent ?? "#2563eb"),
    customDomain: String(data.customDomain ?? ""),
    customDomainStatus:
      data.customDomainStatus === "verified"
        ? "verified"
        : data.customDomainStatus === "rejected"
          ? "rejected"
          : data.customDomainStatus === "pending_verification"
            ? "pending_verification"
            : "not_set",
    seoTitle: String(data.seoTitle ?? ""),
    seoDescription: String(data.seoDescription ?? ""),
    seoKeywords: Array.isArray(data.seoKeywords)
      ? normalizeSeoKeywords((data.seoKeywords as string[]).map((entry) => String(entry)))
      : [],
    allowGuestCheckout: Boolean(data.allowGuestCheckout),
    autoAcceptOrders: Boolean(data.autoAcceptOrders),
    enableCod: Boolean(data.enableCod),
    enableWallet: Boolean(data.enableWallet),
    publishProducts: Boolean(data.publishProducts),
    publishServices: Boolean(data.publishServices),
    showStock: Boolean(data.showStock),
    showTrustBadge: Boolean(data.showTrustBadge),
    lowStockThreshold: Math.max(0, Math.round(Number(data.lowStockThreshold ?? 10))),
    orderNotificationEmail: String(data.orderNotificationEmail ?? ""),
    shippingPolicy: String(data.shippingPolicy ?? ""),
    returnPolicy: String(data.returnPolicy ?? ""),
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt),
    lastPublishedAt: data.lastPublishedAt ? toISODate(data.lastPublishedAt) : undefined,
  } satisfies BusinessShopSettingsRecord;
}

async function fetchOrCreateBusinessShopSettings(ownerUid: string) {
  const database = getDb();
  const business = await fetchPrimaryBusinessByOwner(ownerUid);
  if (!business) {
    throw new Error(
      "Business profile not found. Complete business onboarding before using shop builder.",
    );
  }
  const shopRef = doc(database, "businessShops", business.id);
  const snapshot = await getDoc(shopRef);
  if (!snapshot.exists()) {
    const defaults = buildDefaultBusinessShopSettings(business);
    await setDoc(shopRef, {
      ...defaults,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const created = await getDoc(shopRef);
    return mapBusinessShopSettings(created.id, created.data() as Record<string, unknown>);
  }
  return mapBusinessShopSettings(snapshot.id, snapshot.data());
}

export async function fetchBusinessShopSettingsByOwner(ownerUid: string) {
  return fetchOrCreateBusinessShopSettings(ownerUid);
}

export async function updateBusinessShopSettings(payload: {
  ownerUid: string;
  settings: Partial<BusinessShopSettingsInput>;
  publishNow?: boolean;
}) {
  const database = getDb();
  const current = await fetchOrCreateBusinessShopSettings(payload.ownerUid);
  if (current.ownerUid !== payload.ownerUid) {
    throw new Error("You do not have access to this shop settings profile.");
  }

  const nextCustomDomain = normalizeShopDomain(payload.settings.customDomain ?? current.customDomain);
  const domainChanged = nextCustomDomain !== normalizeShopDomain(current.customDomain);
  const nextStatus = !nextCustomDomain
    ? "not_set"
    : domainChanged
      ? "pending_verification"
      : payload.settings.customDomainStatus ?? current.customDomainStatus;

  const nextKeywords = payload.settings.seoKeywords
    ? normalizeSeoKeywords(payload.settings.seoKeywords)
    : current.seoKeywords;

  const updates: Record<string, unknown> = {
    storeTitle: payload.settings.storeTitle?.trim() || current.storeTitle,
    storeTagline: payload.settings.storeTagline?.trim() ?? current.storeTagline,
    storeDescription:
      payload.settings.storeDescription?.trim() ?? current.storeDescription,
    supportEmail: payload.settings.supportEmail?.trim() || current.supportEmail,
    supportPhone: payload.settings.supportPhone?.trim() || current.supportPhone,
    currencyMode: payload.settings.currencyMode ?? current.currencyMode,
    themeKey: normalizeThemeKey(payload.settings.themeKey ?? current.themeKey),
    themeAccent: payload.settings.themeAccent?.trim() || current.themeAccent,
    customDomain: nextCustomDomain,
    customDomainStatus: nextStatus,
    seoTitle: payload.settings.seoTitle?.trim() || current.seoTitle,
    seoDescription:
      payload.settings.seoDescription?.trim() || current.seoDescription,
    seoKeywords: nextKeywords,
    allowGuestCheckout: payload.settings.allowGuestCheckout ?? current.allowGuestCheckout,
    autoAcceptOrders: payload.settings.autoAcceptOrders ?? current.autoAcceptOrders,
    enableCod: payload.settings.enableCod ?? current.enableCod,
    enableWallet: payload.settings.enableWallet ?? current.enableWallet,
    publishProducts: payload.settings.publishProducts ?? current.publishProducts,
    publishServices: payload.settings.publishServices ?? current.publishServices,
    showStock: payload.settings.showStock ?? current.showStock,
    showTrustBadge: payload.settings.showTrustBadge ?? current.showTrustBadge,
    lowStockThreshold: Math.max(
      0,
      Math.round(payload.settings.lowStockThreshold ?? current.lowStockThreshold),
    ),
    orderNotificationEmail:
      payload.settings.orderNotificationEmail?.trim() || current.orderNotificationEmail,
    shippingPolicy:
      payload.settings.shippingPolicy?.trim() || current.shippingPolicy,
    returnPolicy: payload.settings.returnPolicy?.trim() || current.returnPolicy,
    updatedAt: serverTimestamp(),
  };
  if (payload.publishNow) {
    updates.lastPublishedAt = serverTimestamp();
  }

  await updateDoc(doc(database, "businessShops", current.businessId), updates);
  const snapshot = await getDoc(doc(database, "businessShops", current.businessId));
  return mapBusinessShopSettings(snapshot.id, snapshot.data() as Record<string, unknown>);
}

export async function fetchPublicBusinessShopBySlug(slug: string) {
  const cleanSlug = slug.trim().toLowerCase();
  if (!cleanSlug) return null;
  const directory = await fetchPublicBusinessDirectory();
  const business = directory.find((row) => row.slug === cleanSlug);
  if (!business) return null;
  const database = getDb();
  const snapshot = await getDoc(doc(database, "businessShops", business.id));
  if (!snapshot.exists()) {
    const defaults = buildDefaultBusinessShopSettings(business);
    return {
      business,
      shop: {
        id: business.id,
        ...defaults,
        createdAt: business.createdAt,
        updatedAt: business.updatedAt,
      } satisfies BusinessShopSettingsRecord,
    } satisfies PublicBusinessShopBundle;
  }
  return {
    business,
    shop: mapBusinessShopSettings(snapshot.id, snapshot.data()),
  } satisfies PublicBusinessShopBundle;
}

export async function fetchShopCheckoutContextByBusinessOwner(ownerUid: string) {
  const context = await fetchBusinessShopCheckoutContext(ownerUid);
  return {
    coupons: context.coupons.filter((row) => isCouponEligibleNow(row)),
    shippingZones: context.shippingZones.filter((row) => row.active),
    taxRules: context.taxRules.filter((row) => row.active),
  } satisfies ShopCheckoutContextRecord;
}

export async function fetchShopCouponsByOwner(ownerUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "businessShopCoupons"), where("ownerUid", "==", ownerUid), limit(200)),
  );
  return sortByUpdatedDesc(
    snapshots.docs.map((snapshot) => mapShopCoupon(snapshot.id, snapshot.data())),
  );
}

export async function upsertShopCoupon(payload: {
  ownerUid: string;
  couponId?: string;
  coupon: Partial<ShopCouponInput> & Pick<ShopCouponInput, "code" | "label">;
}) {
  const database = getDb();
  const shop = await fetchOrCreateBusinessShopSettings(payload.ownerUid);
  const code = normalizeCouponCode(payload.coupon.code);
  if (!code) {
    throw new Error("Coupon code is required.");
  }
  const discountType = payload.coupon.discountType === "fixed" ? "fixed" : "percent";
  const discountValue = Math.max(0, Number(payload.coupon.discountValue ?? 0));
  if (discountType === "percent" && discountValue > 100) {
    throw new Error("Percentage coupon cannot exceed 100.");
  }
  const docPayload = {
    ownerUid: payload.ownerUid,
    businessId: shop.businessId,
    businessSlug: shop.businessSlug,
    code,
    label: payload.coupon.label.trim() || code,
    description: payload.coupon.description?.trim() || null,
    discountType,
    discountValue,
    minOrderAmountInr: Math.max(0, Math.round(Number(payload.coupon.minOrderAmountInr ?? 0))),
    maxDiscountAmountInr: payload.coupon.maxDiscountAmountInr
      ? Math.max(0, Math.round(Number(payload.coupon.maxDiscountAmountInr)))
      : null,
    usageLimitTotal: payload.coupon.usageLimitTotal
      ? Math.max(1, Math.round(Number(payload.coupon.usageLimitTotal)))
      : null,
    appliesToPlanKeys: Array.isArray(payload.coupon.appliesToPlanKeys)
      ? payload.coupon.appliesToPlanKeys
          .map((entry) => String(entry).trim().toLowerCase())
          .filter(Boolean)
      : [],
    startsAt: payload.coupon.startsAt?.trim() || null,
    endsAt: payload.coupon.endsAt?.trim() || null,
    active: payload.coupon.active ?? true,
    updatedAt: serverTimestamp(),
  };

  if (payload.couponId?.trim()) {
    const ref = doc(database, "businessShopCoupons", payload.couponId.trim());
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      throw new Error("Coupon not found.");
    }
    const row = mapShopCoupon(existing.id, existing.data());
    if (row.ownerUid !== payload.ownerUid) {
      throw new Error("You cannot edit this coupon.");
    }
    await setDoc(ref, docPayload, { merge: true });
    return payload.couponId.trim();
  }
  const created = await addDoc(collection(database, "businessShopCoupons"), {
    ...docPayload,
    usedCount: 0,
    createdAt: serverTimestamp(),
  });
  return created.id;
}

export async function removeShopCoupon(payload: { ownerUid: string; couponId: string }) {
  const database = getDb();
  const ref = doc(database, "businessShopCoupons", payload.couponId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return;
  const row = mapShopCoupon(snapshot.id, snapshot.data());
  if (row.ownerUid !== payload.ownerUid) {
    throw new Error("You cannot delete this coupon.");
  }
  await deleteDoc(ref);
}

export async function fetchShopTaxRulesByOwner(ownerUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(collection(database, "businessShopTaxRules"), where("ownerUid", "==", ownerUid), limit(200)),
  );
  return sortByUpdatedDesc(
    snapshots.docs.map((snapshot) => mapShopTaxRule(snapshot.id, snapshot.data())),
  );
}

export async function upsertShopTaxRule(payload: {
  ownerUid: string;
  taxRuleId?: string;
  taxRule: ShopTaxRuleInput;
}) {
  const database = getDb();
  const shop = await fetchOrCreateBusinessShopSettings(payload.ownerUid);
  const scope = normalizeTaxScope(payload.taxRule.scope);
  const docPayload = {
    ownerUid: payload.ownerUid,
    businessId: shop.businessId,
    label: payload.taxRule.label.trim() || "Tax rule",
    scope,
    countryCode:
      scope === "country" || scope === "city"
        ? normalizeCountryCode(payload.taxRule.countryCode) || null
        : null,
    city: scope === "city" ? normalizeCityName(payload.taxRule.city) || null : null,
    ratePercent: Math.max(0, Number(payload.taxRule.ratePercent ?? 0)),
    active: payload.taxRule.active,
    updatedAt: serverTimestamp(),
  };

  if (payload.taxRuleId?.trim()) {
    const ref = doc(database, "businessShopTaxRules", payload.taxRuleId.trim());
    const existing = await getDoc(ref);
    if (!existing.exists()) throw new Error("Tax rule not found.");
    const row = mapShopTaxRule(existing.id, existing.data());
    if (row.ownerUid !== payload.ownerUid) {
      throw new Error("You cannot edit this tax rule.");
    }
    await setDoc(ref, docPayload, { merge: true });
    return payload.taxRuleId.trim();
  }
  const created = await addDoc(collection(database, "businessShopTaxRules"), {
    ...docPayload,
    createdAt: serverTimestamp(),
  });
  return created.id;
}

export async function removeShopTaxRule(payload: { ownerUid: string; taxRuleId: string }) {
  const database = getDb();
  const ref = doc(database, "businessShopTaxRules", payload.taxRuleId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return;
  const row = mapShopTaxRule(snapshot.id, snapshot.data());
  if (row.ownerUid !== payload.ownerUid) {
    throw new Error("You cannot delete this tax rule.");
  }
  await deleteDoc(ref);
}

export async function fetchShopShippingZonesByOwner(ownerUid: string) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "businessShopShippingZones"),
      where("ownerUid", "==", ownerUid),
      limit(200),
    ),
  );
  return sortByUpdatedDesc(
    snapshots.docs.map((snapshot) => mapShopShippingZone(snapshot.id, snapshot.data())),
  );
}

export async function upsertShopShippingZone(payload: {
  ownerUid: string;
  shippingZoneId?: string;
  shippingZone: ShopShippingZoneInput;
}) {
  const database = getDb();
  const shop = await fetchOrCreateBusinessShopSettings(payload.ownerUid);
  const docPayload = {
    ownerUid: payload.ownerUid,
    businessId: shop.businessId,
    label: payload.shippingZone.label.trim() || "Shipping zone",
    countries: payload.shippingZone.countries
      .map((entry) => normalizeCountryCode(entry))
      .filter(Boolean),
    cities: payload.shippingZone.cities
      .map((entry) => normalizeCityName(entry))
      .filter(Boolean),
    feeInr: Math.max(0, Math.round(Number(payload.shippingZone.feeInr ?? 0))),
    freeShippingMinOrderInr: payload.shippingZone.freeShippingMinOrderInr
      ? Math.max(0, Math.round(Number(payload.shippingZone.freeShippingMinOrderInr)))
      : null,
    active: payload.shippingZone.active,
    updatedAt: serverTimestamp(),
  };

  if (payload.shippingZoneId?.trim()) {
    const ref = doc(database, "businessShopShippingZones", payload.shippingZoneId.trim());
    const existing = await getDoc(ref);
    if (!existing.exists()) throw new Error("Shipping zone not found.");
    const row = mapShopShippingZone(existing.id, existing.data());
    if (row.ownerUid !== payload.ownerUid) {
      throw new Error("You cannot edit this shipping zone.");
    }
    await setDoc(ref, docPayload, { merge: true });
    return payload.shippingZoneId.trim();
  }
  const created = await addDoc(collection(database, "businessShopShippingZones"), {
    ...docPayload,
    createdAt: serverTimestamp(),
  });
  return created.id;
}

export async function removeShopShippingZone(payload: { ownerUid: string; shippingZoneId: string }) {
  const database = getDb();
  const ref = doc(database, "businessShopShippingZones", payload.shippingZoneId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return;
  const row = mapShopShippingZone(snapshot.id, snapshot.data());
  if (row.ownerUid !== payload.ownerUid) {
    throw new Error("You cannot delete this shipping zone.");
  }
  await deleteDoc(ref);
}

async function appendInventoryLog(payload: {
  ownerUid: string;
  businessId?: string;
  itemType: "product" | "service";
  itemId: string;
  itemTitle: string;
  source: "manual_create" | "manual_adjustment" | "catalog_sync";
  previousStock?: number;
  nextStock?: number;
  note?: string;
}) {
  const database = getDb();
  const previous =
    payload.previousStock === undefined || payload.previousStock === null
      ? undefined
      : Math.round(Number(payload.previousStock));
  const next =
    payload.nextStock === undefined || payload.nextStock === null
      ? undefined
      : Math.round(Number(payload.nextStock));
  await addDoc(collection(database, "shopInventoryLogs"), {
    ownerUid: payload.ownerUid,
    businessId: payload.businessId ?? null,
    itemType: payload.itemType,
    itemId: payload.itemId,
    itemTitle: payload.itemTitle,
    source: payload.source,
    previousStock: previous ?? null,
    nextStock: next ?? null,
    change:
      previous === undefined || next === undefined ? null : Number(next) - Number(previous),
    note: payload.note?.trim() || null,
    createdAt: serverTimestamp(),
  });
}

export async function fetchShopInventoryLogsByOwner(ownerUid: string, limitRows = 120) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "shopInventoryLogs"),
      where("ownerUid", "==", ownerUid),
      limit(Math.max(1, Math.min(300, Math.round(limitRows)))),
    ),
  );
  return sortByCreatedDesc(
    snapshots.docs.map((snapshot) => mapShopInventoryLog(snapshot.id, snapshot.data())),
  );
}

export async function updateShopInventoryStock(payload: {
  ownerUid: string;
  itemType: "product" | "service";
  itemId: string;
  nextStock: number;
  note?: string;
}) {
  const database = getDb();
  const collectionName = payload.itemType === "service" ? "businessServices" : "digitalProducts";
  const ref = doc(database, collectionName, payload.itemId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error("Item not found.");
  const data = snapshot.data() as Record<string, unknown>;
  const ownerUid = String(data.ownerUid ?? "");
  if (ownerUid !== payload.ownerUid) {
    throw new Error("You cannot update this stock.");
  }
  const currentStock =
    data.stockAvailable === undefined || data.stockAvailable === null
      ? undefined
      : Number(data.stockAvailable);
  const normalizedNextStock = Math.max(0, Math.round(Number(payload.nextStock) || 0));
  await updateDoc(ref, {
    stockAvailable: normalizedNextStock,
    updatedAt: serverTimestamp(),
  });
  await appendInventoryLog({
    ownerUid: payload.ownerUid,
    businessId: data.businessId ? String(data.businessId) : undefined,
    itemType: payload.itemType,
    itemId: payload.itemId,
    itemTitle: String(data.title ?? "Item"),
    source: "manual_adjustment",
    previousStock: currentStock,
    nextStock: normalizedNextStock,
    note: payload.note,
  });
}

export async function fetchAbandonedCheckoutsByBusinessOwner(ownerUid: string, limitRows = 120) {
  const database = getDb();
  const snapshots = await getDocs(
    query(
      collection(database, "abandonedCheckouts"),
      where("businessOwnerUid", "==", ownerUid),
      limit(Math.max(1, Math.min(300, Math.round(limitRows)))),
    ),
  );
  return sortByCreatedDesc(
    snapshots.docs.map((snapshot) => mapAbandonedCheckout(snapshot.id, snapshot.data())),
  );
}

