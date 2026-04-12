import fs from "node:fs";
import path from "node:path";
import { initializeApp } from "firebase/app";
import { createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv();

const cfg = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
for (const [k, v] of Object.entries(cfg)) if (!v) throw new Error(`Missing ${k}`);

const app = initializeApp(cfg);
const auth = getAuth(app);
const db = getFirestore(app);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
const PASS = "Demo@12345";
const RUN = new Date().toISOString().replace(/\D/g, "").slice(0, 14);

const ids = {
  bizA: `demo_business_alpha_${RUN}`,
  bizB: `demo_business_beta_${RUN}`,
  group: `demo_group_${RUN}`,
  endpoint: `demo_endpoint_${RUN}`,
  deal: `demo_deal_${RUN}`,
};

const users = [
  { key: "ownerA", email: "owner.alpha.demo@businessverifier.in", name: "Asha Sharma", role: "business_owner", city: "Bengaluru", country: "India", bal: 92000 },
  { key: "ownerB", email: "owner.beta.demo@businessverifier.in", name: "Ravi Mehta", role: "business_owner", city: "Mumbai", country: "India", bal: 138000 },
  { key: "customerA", email: "customer.neha.demo@businessverifier.in", name: "Neha Patel", role: "customer", city: "Hyderabad", country: "India", bal: 18000 },
  { key: "customerB", email: "customer.arjun.demo@businessverifier.in", name: "Arjun Rao", role: "customer", city: "Pune", country: "India", bal: 12500 },
  { key: "employeeA", email: "employee.priya.demo@businessverifier.in", name: "Priya Nair", role: "employee", city: "Bengaluru", country: "India", bal: 3500 },
];

async function signin(email) {
  await signInWithEmailAndPassword(auth, email, PASS);
}

async function up(pathParts, data, merge = true) {
  try {
    await setDoc(doc(db, ...pathParts), data, merge ? { merge: true } : undefined);
  } catch (error) {
    const location = pathParts.join("/");
    throw new Error(`Write failed at ${location}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function tryUp(pathParts, data, merge = true) {
  try {
    await up(pathParts, data, merge);
  } catch {
    console.warn(`Optional write skipped: ${pathParts.join("/")}`);
  }
}

async function ensureUser(def, idx) {
  let cred;
  try {
    cred = await createUserWithEmailAndPassword(auth, def.email, PASS);
  } catch (e) {
    if (String(e?.code || "").includes("email-already-in-use")) {
      cred = await signInWithEmailAndPassword(auth, def.email, PASS);
    } else {
      throw e;
    }
  }
  const uid = cred.user.uid;
  await updateProfile(cred.user, { displayName: def.name }).catch(() => undefined);
  const publicId = `BVU-DEMO-${String(idx + 1).padStart(3, "0")}`;
  await up(["users", uid], {
    uid, email: def.email, emailNormalized: def.email.toLowerCase(), displayName: def.name, photoURL: "", publicId,
    role: def.role, roleSelectionCompleted: true, isIdentityVerified: true, city: def.city, country: def.country,
    verifierCustomerMembershipStatus: def.role === "customer" ? "inactive" : null,
    verifierCustomerMembershipActiveUntil: null, updatedAt: serverTimestamp(), createdAt: serverTimestamp(),
  });
  await up(["userLookup", uid], { uid, email: def.email, emailNormalized: def.email.toLowerCase(), displayName: def.name, publicId, role: def.role, updatedAt: serverTimestamp() });
  await up(["wallets", uid], { ownerUid: uid, ownerName: def.name, balance: def.bal, lockedForWithdrawal: 0, currency: "INR", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await up(["wallets", uid, "transactions", `demo_open_${RUN}`], { type: "credit", amount: def.bal, reason: `Demo opening balance ${RUN}`, referenceId: `seed_${RUN}`, createdAt: serverTimestamp() });
  await up(["userSecurity", uid], { userUid: uid, authenticatorEnabled: false, backupCodes: [], pendingSecret: null, pendingBackupCodes: [], updatedAt: serverTimestamp(), createdAt: serverTimestamp() });
  return { ...def, uid, publicId };
}

function badgeCode(businessId, slug) {
  return `<iframe src="${APP_URL}/trust-badge/${businessId}" width="360" height="220" style="border:0;border-radius:14px;overflow:hidden;" loading="lazy" title="Business Verifier Trust Badge for ${slug}"></iframe>`;
}

const plusDays = (d) => new Date(Date.now() + d * 86400000).toISOString();
const minusDays = (d) => new Date(Date.now() - d * 86400000).toISOString();
async function main() {
  const byKey = {};
  for (let i = 0; i < users.length; i += 1) {
    const u = await ensureUser(users[i], i);
    byKey[u.key] = u;
    console.log(`User ready: ${u.key} (${u.uid})`);
  }

  const ownerA = byKey.ownerA;
  const ownerB = byKey.ownerB;
  const customerA = byKey.customerA;
  const customerB = byKey.customerB;
  const employeeA = byKey.employeeA;

  const slugA = `alpha-digital-mart-${RUN}`;
  const slugB = `beta-urban-tools-${RUN}`;

  await signin(ownerA.email);
  await up(["businessApplications", ids.bizA], {
    ownerUid: ownerA.uid, businessName: "Alpha Digital Mart", mode: "online", stage: "running", category: "Ecommerce", yearsInField: 6,
    supportEmail: "support@alphadigitalmart.in", supportPhone: "+91-8000101001", address: "MG Road, Bengaluru", city: "Bengaluru", country: "India",
    website: "https://alphadigitalmart.in", bankAccountLast4: "2211", publicDocumentsSummary: "GST certificate and registration documents uploaded.",
    publicDocumentUrls: ["https://images.unsplash.com/photo-1450101499163-c8848c66ca85"], questionConversationMode: "public",
    lookingForPartnership: true, partnershipCategory: "Affiliate + technology", partnershipAmountMin: 60000, partnershipAmountMax: 350000,
    wantsProPlan: false, proDepositAmount: null, proDepositLockMonths: null, slug: slugA, publicBusinessKey: `BVB-DEMO-ALPHA-${RUN.slice(-4)}`,
    employeeJoinKey: `BVJ-DEMO-ALPHA-${RUN.slice(-4)}`, status: "approved", isRecommended: true, recommendedMarkedBy: ownerA.uid,
    recommendedMarkedAt: minusDays(2), certificateId: `demo_cert_alpha_${RUN}`, certificateSerial: `BV-2026-ALPHA-${RUN.slice(-4)}`,
    trustScore: 91, followersCount: 1, totalLockedDeposit: 0, totalAvailableDeposit: 0, trustBadgeCode: badgeCode(ids.bizA, slugA),
    verificationChecklist: { mobileVerified: true, addressVerified: true, bankAccountVerified: true, businessInfoVerified: true, publicDocumentsVerified: true },
    verificationNotes: "Demo verification completed", checklistReviewedBy: ownerA.uid, checklistReviewedAt: minusDays(1), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });

  await signin(ownerB.email);
  await up(["businessApplications", ids.bizB], {
    ownerUid: ownerB.uid, businessName: "Beta Urban Tools", mode: "hybrid", stage: "running", category: "Home Improvement", yearsInField: 9,
    supportEmail: "help@betaurbantools.in", supportPhone: "+91-8000102002", address: "Andheri East, Mumbai", city: "Mumbai", country: "India",
    website: "https://betaurbantools.in", bankAccountLast4: "4455", publicDocumentsSummary: "Trade license and GST uploaded.",
    publicDocumentUrls: ["https://images.unsplash.com/photo-1520607162513-77705c0f0d4a"], questionConversationMode: "private",
    lookingForPartnership: true, partnershipCategory: "Offline distribution", partnershipAmountMin: 120000, partnershipAmountMax: 600000,
    wantsProPlan: true, proDepositAmount: 220000, proDepositLockMonths: 8, slug: slugB, publicBusinessKey: `BVB-DEMO-BETA-${RUN.slice(-4)}`,
    employeeJoinKey: `BVJ-DEMO-BETA-${RUN.slice(-4)}`, status: "approved", isRecommended: true, recommendedMarkedBy: ownerB.uid,
    recommendedMarkedAt: minusDays(3), certificateId: `demo_cert_beta_${RUN}`, certificateSerial: `BV-2026-BETA-${RUN.slice(-4)}`,
    trustScore: 94, followersCount: 1, totalLockedDeposit: 220000, totalAvailableDeposit: 32000, trustBadgeCode: badgeCode(ids.bizB, slugB),
    verificationChecklist: { mobileVerified: true, addressVerified: true, bankAccountVerified: true, businessInfoVerified: true, publicDocumentsVerified: true },
    verificationNotes: "Demo verification completed", checklistReviewedBy: ownerB.uid, checklistReviewedAt: minusDays(1), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  await up(["proDepositLedgers", `demo_deposit_locked_${RUN}`], { businessId: ids.bizB, ownerUid: ownerB.uid, ownerName: ownerB.name, amount: 220000, status: "locked", source: "initial_lock", lockUntil: plusDays(210), note: "Demo Pro lock", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, false);
  await up(["proDepositLedgers", `demo_deposit_available_${RUN}`], { businessId: ids.bizB, ownerUid: ownerB.uid, ownerName: ownerB.name, amount: 32000, status: "available", source: "unlock", lockUntil: minusDays(2), unlockedAt: minusDays(2), note: "Demo unlocked", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, false);
  await tryUp(["trustBadgeWidgetDailyStats", `${ids.bizA}_2026-04-09`], { businessId: ids.bizA, ownerUid: ownerA.uid, businessName: "Alpha Digital Mart", dateKey: "2026-04-09", impressions: 328, clicks: 47, lastEventAt: serverTimestamp(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await tryUp(["trustBadgeWidgetDailyStats", `${ids.bizB}_2026-04-09`], { businessId: ids.bizB, ownerUid: ownerB.uid, businessName: "Beta Urban Tools", dateKey: "2026-04-09", impressions: 412, clicks: 71, lastEventAt: serverTimestamp(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

  await signin(ownerA.email);
  await up(["businessApplications", ids.bizA, "employees", employeeA.uid], { employeeUid: employeeA.uid, employeeName: employeeA.name, employeeEmail: employeeA.email, title: "Support Specialist", addedByUid: ownerA.uid, addedByName: ownerA.name, createdAt: serverTimestamp() });
  await up(["businessApplications", ids.bizA, "employeeRequests", employeeA.uid], { employeeUid: employeeA.uid, employeeName: employeeA.name, employeeEmail: employeeA.email, businessId: ids.bizA, businessName: "Alpha Digital Mart", businessSlug: slugA, businessPublicKey: `BVB-DEMO-ALPHA-${RUN.slice(-4)}`, status: "auto_approved", note: "Auto-approved demo request", autoApproved: true, reviewedByUid: ownerA.uid, reviewedByName: ownerA.name, requestedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await up(["users", employeeA.uid, "employments", ids.bizA], { businessId: ids.bizA, businessName: "Alpha Digital Mart", businessSlug: slugA, ownerUid: ownerA.uid, ownerName: ownerA.name, title: "Support Specialist", assignedAt: serverTimestamp() });

  const p1 = `demo_product_alpha_seo_${RUN}`;
  const p2 = `demo_product_alpha_auto_${RUN}`;
  const p3 = `demo_product_beta_inventory_${RUN}`;
  const p4 = `demo_product_beta_support_${RUN}`;

  await up(["digitalProducts", p1], { ownerUid: ownerA.uid, ownerName: ownerA.name, title: "SEO Health Blueprint", description: "Actionable SEO audit kit and templates.", price: 1499, noRefund: false, category: "Marketing", uniqueLinkSlug: `seo-health-${RUN}`, pricingPlans: [{ key: "standard", name: "Standard", billingCycle: "one_time", price: 1499 }], favoritesCount: 1, salesCount: 2, refundCount: 0, reviewsCount: 1, averageRating: 5, ownerTrustScore: 91, ownerCertificateSerial: `BV-2026-ALPHA-${RUN.slice(-4)}`, ownerBusinessSlug: slugA, stockAvailable: 180, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await up(["digitalProducts", p2], { ownerUid: ownerA.uid, ownerName: ownerA.name, title: "Automation Funnel Toolkit", description: "Prebuilt automation templates and workflows.", price: 2499, noRefund: true, category: "Automation", uniqueLinkSlug: `automation-funnel-${RUN}`, pricingPlans: [{ key: "standard", name: "Standard", billingCycle: "one_time", price: 2499 }], favoritesCount: 1, salesCount: 1, refundCount: 0, reviewsCount: 0, averageRating: 0, ownerTrustScore: 91, ownerCertificateSerial: `BV-2026-ALPHA-${RUN.slice(-4)}`, ownerBusinessSlug: slugA, stockAvailable: 75, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

  await signin(ownerB.email);
  await up(["digitalProducts", p3], { ownerUid: ownerB.uid, ownerName: ownerB.name, title: "Inventory Pulse Console", description: "Inventory dashboard package for small stores.", price: 1999, noRefund: false, category: "Operations", uniqueLinkSlug: `inventory-pulse-${RUN}`, pricingPlans: [{ key: "standard", name: "Standard", billingCycle: "one_time", price: 1999 }], favoritesCount: 1, salesCount: 1, refundCount: 1, reviewsCount: 1, averageRating: 2, ownerTrustScore: 94, ownerCertificateSerial: `BV-2026-BETA-${RUN.slice(-4)}`, ownerBusinessSlug: slugB, stockAvailable: 120, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await up(["digitalProducts", p4], { ownerUid: ownerB.uid, ownerName: ownerB.name, title: "Retail Support Playbook", description: "Support scripts and SLA templates for retail.", price: 899, noRefund: false, category: "Support", uniqueLinkSlug: `retail-playbook-${RUN}`, pricingPlans: [{ key: "standard", name: "Standard", billingCycle: "one_time", price: 899 }], favoritesCount: 0, salesCount: 0, refundCount: 0, reviewsCount: 0, averageRating: 0, ownerTrustScore: 94, ownerCertificateSerial: `BV-2026-BETA-${RUN.slice(-4)}`, ownerBusinessSlug: slugB, stockAvailable: 240, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

  await signin(ownerA.email);
  await up(["businessServices", `demo_service_alpha_${RUN}`], { ownerUid: ownerA.uid, ownerName: ownerA.name, title: "Growth Strategy Consultation", description: "Roadmap consultation for acquisition and retention.", category: "Consulting", startingPrice: 3999, currency: "INR", serviceMode: "online", deliveryMode: "remote", uniqueLinkSlug: `growth-consult-${RUN}`, ownerBusinessSlug: slugA, ownerTrustScore: 91, ownerCertificateSerial: `BV-2026-ALPHA-${RUN.slice(-4)}`, stockAvailable: 30, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await signin(ownerB.email);
  await up(["businessServices", `demo_service_beta_${RUN}`], { ownerUid: ownerB.uid, ownerName: ownerB.name, title: "Store Setup and Calibration", description: "On-site setup and calibration service.", category: "Installation", startingPrice: 89, currency: "USD", serviceMode: "offline", deliveryMode: "onsite", uniqueLinkSlug: `store-calibration-${RUN}`, ownerBusinessSlug: slugB, ownerTrustScore: 94, ownerCertificateSerial: `BV-2026-BETA-${RUN.slice(-4)}`, stockAvailable: 12, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await signin(customerA.email);
  await up(["digitalProducts", p1, "favorites", customerA.uid], { userUid: customerA.uid, userName: customerA.name, createdAt: serverTimestamp() });
  await up(["digitalProducts", p3, "favorites", customerA.uid], { userUid: customerA.uid, userName: customerA.name, createdAt: serverTimestamp() });
  await up(["businessApplications", ids.bizA, "followers", customerA.uid], { followerUid: customerA.uid, followerName: customerA.name, followerEmail: customerA.email, createdAt: serverTimestamp() });
  await up(["users", customerA.uid, "followedBusinesses", ids.bizA], { applicationId: ids.bizA, businessName: "Alpha Digital Mart", businessSlug: slugA, ownerUid: ownerA.uid, followedAt: serverTimestamp() });

  await signin(customerB.email);
  await up(["digitalProducts", p2, "favorites", customerB.uid], { userUid: customerB.uid, userName: customerB.name, createdAt: serverTimestamp() });
  await up(["businessApplications", ids.bizB, "followers", customerB.uid], { followerUid: customerB.uid, followerName: customerB.name, followerEmail: customerB.email, createdAt: serverTimestamp() });
  await up(["users", customerB.uid, "followedBusinesses", ids.bizB], { applicationId: ids.bizB, businessName: "Beta Urban Tools", businessSlug: slugB, ownerUid: ownerB.uid, followedAt: serverTimestamp() });

  const o1 = `demo_order_a1_${RUN}`;
  const o2 = `demo_order_a2_${RUN}`;
  const o3 = `demo_order_b1_${RUN}`;
  await signin(customerA.email);
  await up(["orders", o1], { productId: p1, productSlug: `seo-health-${RUN}`, productTitle: "SEO Health Blueprint", businessOwnerUid: ownerA.uid, businessOwnerName: ownerA.name, customerUid: customerA.uid, customerName: customerA.name, customerEmail: customerA.email, amount: 1499, pricingPlanKey: "standard", pricingPlanName: "Standard", pricingPlanBillingCycle: "one_time", status: "released", noRefund: false, escrowReleaseAt: minusDays(10), refundDeadlineAt: minusDays(10), refundReason: null, refundEvidenceUrls: [], refundTicketId: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, false);
  await up(["orders", o2], { productId: p3, productSlug: `inventory-pulse-${RUN}`, productTitle: "Inventory Pulse Console", businessOwnerUid: ownerB.uid, businessOwnerName: ownerB.name, customerUid: customerA.uid, customerName: customerA.name, customerEmail: customerA.email, amount: 1999, pricingPlanKey: "standard", pricingPlanName: "Standard", pricingPlanBillingCycle: "one_time", status: "refund_requested", noRefund: false, escrowReleaseAt: plusDays(20), refundDeadlineAt: plusDays(20), refundReason: "License key failed after activation.", refundEvidenceUrls: ["https://images.unsplash.com/photo-1498050108023-c5249f4df085"], refundTicketId: `demo_ticket_1_${RUN}`, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, false);

  await signin(customerB.email);
  await up(["orders", o3], { productId: p2, productSlug: `automation-funnel-${RUN}`, productTitle: "Automation Funnel Toolkit", businessOwnerUid: ownerA.uid, businessOwnerName: ownerA.name, customerUid: customerB.uid, customerName: customerB.name, customerEmail: customerB.email, amount: 2499, pricingPlanKey: "standard", pricingPlanName: "Standard", pricingPlanBillingCycle: "one_time", status: "paid", noRefund: true, escrowReleaseAt: plusDays(32), refundDeadlineAt: new Date().toISOString(), refundReason: null, refundEvidenceUrls: [], refundTicketId: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, false);

  const t1 = `demo_ticket_1_${RUN}`;
  const t2 = `demo_ticket_2_${RUN}`;
  await signin(customerA.email);
  await up(["supportTickets", t1], { customerUid: customerA.uid, customerName: customerA.name, customerEmail: customerA.email, businessName: "Beta Urban Tools", orderReference: o2, title: "Refund issue for inventory package", description: "License key is not working and activation failed.", priority: "high", expectedOutcome: "Refund or replacement key.", evidenceUrls: ["https://images.unsplash.com/photo-1515879218367-8466d910aaa4"], sourceType: "order_refund", sourceId: o2, autoGenerated: false, status: "in_discussion", participantUids: [customerA.uid, ownerB.uid], escalationCount: 0, reopenedCount: 0, lastMessagePreview: "Please resolve quickly.", lastMessageBy: customerA.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, false);
  await up(["supportTickets", t1, "messages", `cmsg_${RUN}`], { senderUid: customerA.uid, senderName: customerA.name, senderRole: "customer", text: "Please resolve quickly.", attachments: ["https://images.unsplash.com/photo-1515879218367-8466d910aaa4"], createdAt: serverTimestamp() }, false);

  await signin(customerB.email);
  await up(["supportTickets", t2], { customerUid: customerB.uid, customerName: customerB.name, customerEmail: customerB.email, businessName: "Alpha Digital Mart", orderReference: o3, title: "Need help with setup", description: "Need onboarding support for no-refund toolkit.", priority: "medium", expectedOutcome: "Configuration support.", evidenceUrls: ["https://images.unsplash.com/photo-1461749280684-dccba630e2f6"], sourceType: "business_profile", sourceId: ids.bizA, autoGenerated: false, status: "open", participantUids: [customerB.uid, ownerA.uid], escalationCount: 0, reopenedCount: 0, lastMessagePreview: "Can your team help setup?", lastMessageBy: customerB.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, false);
  await up(["supportTickets", t2, "messages", `cmsg_${RUN}`], { senderUid: customerB.uid, senderName: customerB.name, senderRole: "customer", text: "Can your team help setup?", attachments: [], createdAt: serverTimestamp() }, false);

  await signin(ownerB.email);
  await up(["supportTickets", t1, "messages", `omsg_${RUN}`], { senderUid: ownerB.uid, senderName: ownerB.name, senderRole: "business", text: "Replacement key shared. Please test once.", attachments: [], createdAt: serverTimestamp() }, false);
  await up(["supportTickets", t1], { status: "awaiting_admin", escalationCount: 1, lastMessagePreview: "Replacement key shared.", lastMessageBy: ownerB.uid, updatedAt: serverTimestamp() });

  await signin(ownerA.email);
  await up(["supportTickets", t2, "messages", `omsg_${RUN}`], { senderUid: ownerA.uid, senderName: ownerA.name, senderRole: "business", text: "Sharing onboarding checklist and call slot.", attachments: [], createdAt: serverTimestamp() }, false);
  await up(["supportTickets", t2], { status: "resolved", resolutionReason: "Setup support provided", resolvedBy: ownerA.uid, resolvedAt: serverTimestamp(), lastMessagePreview: "Setup completed.", lastMessageBy: ownerA.uid, updatedAt: serverTimestamp() });

  await signin(customerA.email);
  await up(["productReviews", `demo_review_good_${RUN}`], { productId: p1, productSlug: `seo-health-${RUN}`, productTitle: "SEO Health Blueprint", businessOwnerUid: ownerA.uid, businessOwnerName: ownerA.name, customerUid: customerA.uid, customerName: customerA.name, customerEmail: customerA.email, rating: 5, comment: "Excellent templates and support.", proofUrls: ["https://images.unsplash.com/photo-1557804506-669a67965ba0"], status: "active", businessReply: "Thanks for the feedback.", businessReplyBy: ownerA.uid, businessReplyAt: serverTimestamp(), customerSatisfied: true, resolutionNote: "Happy", hiddenFromPublic: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, false);
  await up(["productReviews", `demo_review_issue_${RUN}`], { productId: p3, productSlug: `inventory-pulse-${RUN}`, productTitle: "Inventory Pulse Console", businessOwnerUid: ownerB.uid, businessOwnerName: ownerB.name, customerUid: customerA.uid, customerName: customerA.name, customerEmail: customerA.email, rating: 2, comment: "Facing activation issue.", proofUrls: ["https://images.unsplash.com/photo-1515879218367-8466d910aaa4"], status: "active", businessReply: "Investigating in support ticket.", businessReplyBy: ownerB.uid, businessReplyAt: serverTimestamp(), customerSatisfied: false, resolutionNote: "Pending", hiddenFromPublic: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, false);

  const qid = `demo_question_${RUN}`;
  await up(["businessApplications", ids.bizA, "questions", qid], { businessId: ids.bizA, businessSlug: slugA, businessName: "Alpha Digital Mart", ownerUid: ownerA.uid, customerUid: customerA.uid, customerName: customerA.name, customerEmail: customerA.email, title: "Do you provide onboarding support?", mode: "public", participantUids: [customerA.uid, ownerA.uid], status: "open", lastMessage: "Need onboarding for 8 member team.", lastMessageByUid: customerA.uid, messagesCount: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, false);
  await up(["businessApplications", ids.bizA, "questions", qid, "messages", `q_c_${RUN}`], { senderUid: customerA.uid, senderName: customerA.name, senderRole: "customer", text: "Need onboarding for 8 member team.", createdAt: serverTimestamp() }, false);
  await signin(ownerA.email);
  await up(["businessApplications", ids.bizA, "questions", qid, "messages", `q_o_${RUN}`], { senderUid: ownerA.uid, senderName: ownerA.name, senderRole: "business_owner", text: "Yes, onboarding support is available.", createdAt: serverTimestamp() }, false);

  await up(["groups", ids.group], { ownerUid: ownerA.uid, ownerName: ownerA.name, title: "Growth Circle India", description: "Verified business growth updates and Q&A.", adminOnlyMessaging: false, moderatorUids: [ownerA.uid, employeeA.uid], membersCount: 3, joinCode: `GROW${RUN.slice(-6)}`, joinLink: `${APP_URL}/groups/${ids.group}`, widgetCode: `<iframe src="${APP_URL}/group-widget/${ids.group}" width="320" height="180" style="border:0;border-radius:12px;overflow:hidden;" loading="lazy" title="Business Verifier Group Widget"></iframe>`, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, false);
  await up(["groups", ids.group, "members", ownerA.uid], { userUid: ownerA.uid, userName: ownerA.name, role: "owner", joinedAt: serverTimestamp() });
  await up(["users", ownerA.uid, "groupMemberships", ids.group], { groupId: ids.group, role: "owner", joinedAt: serverTimestamp() });

  await signin(customerA.email);
  await up(["groups", ids.group, "members", customerA.uid], { userUid: customerA.uid, userName: customerA.name, role: "member", joinedAt: serverTimestamp() });
  await up(["users", customerA.uid, "groupMemberships", ids.group], { groupId: ids.group, role: "member", joinedAt: serverTimestamp() });
  await up(["groups", ids.group, "messages", `g_c1_${RUN}`], { senderUid: customerA.uid, senderName: customerA.name, senderRole: "member", text: "Looking for automation recommendations.", createdAt: serverTimestamp() }, false);

  await signin(customerB.email);
  await up(["groups", ids.group, "members", customerB.uid], { userUid: customerB.uid, userName: customerB.name, role: "member", joinedAt: serverTimestamp() });
  await up(["users", customerB.uid, "groupMemberships", ids.group], { groupId: ids.group, role: "member", joinedAt: serverTimestamp() });
  await up(["groups", ids.group, "messages", `g_c2_${RUN}`], { senderUid: customerB.uid, senderName: customerB.name, senderRole: "member", text: "Following for launch updates.", createdAt: serverTimestamp() }, false);

  await signin(ownerA.email);
  await up(["groups", ids.group, "messages", `g_o_${RUN}`], { senderUid: ownerA.uid, senderName: ownerA.name, senderRole: "owner", text: "Welcome all members.", createdAt: serverTimestamp() }, false);
  await up(["notificationEndpoints", ids.endpoint], { ownerUid: ownerA.uid, ownerName: ownerA.name, label: "Alpha Main Endpoint", endpointSecret: `nfy_demo_${RUN}`, status: "active", identifierType: "permanent", expiresAt: null, disconnectedAt: null, sentCount: 2, billedSentCount: 2, spamReports: 0, blockedUntil: null, abuseScore: 0, recentWindowCount: 2, recentWindowStartedAt: new Date().toISOString(), deliveredCount: 2, failedCount: 0, lastSentAt: serverTimestamp(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, false);
  await up(["notificationDeliveryLogs", `demo_delivery_${RUN}`], { endpointId: ids.endpoint, ownerUid: ownerA.uid, category: "offers", attempted: 2, delivered: 2, failed: 0, windowCount: 2, status: "delivered", createdAt: serverTimestamp() }, false);
  await up(["users", customerA.uid, "notifications", `notify_a_${RUN}`], { endpointId: ids.endpoint, ownerUid: ownerA.uid, category: "offers", title: "Weekend Offer", message: "Flat 15% on selected products.", isSpam: false, createdAt: serverTimestamp() }, false);
  await up(["users", customerB.uid, "notifications", `notify_b_${RUN}`], { endpointId: ids.endpoint, ownerUid: ownerA.uid, category: "updates", title: "Toolkit Update", message: "New CRM templates available now.", isSpam: false, createdAt: serverTimestamp() }, false);
  await up(["adCampaigns", `demo_ad_alpha_${RUN}`], { ownerUid: ownerA.uid, ownerName: ownerA.name, title: "Alpha Home Banner", imageUrl: "https://images.unsplash.com/photo-1460925895917-afdab827c52f", destinationUrl: `https://alphadigitalmart.in/offers/${RUN}`, placement: "home_banner", cityTargets: ["Bengaluru", "Hyderabad", "Pune"], status: "active", impressions: 18420, clicks: 936, billedImpressions: 18000, notes: "Demo high-performing", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, false);

  await signin(ownerB.email);
  await up(["adCampaigns", `demo_ad_beta_${RUN}`], { ownerUid: ownerB.uid, ownerName: ownerB.name, title: "Beta Directory Banner", imageUrl: "https://images.unsplash.com/photo-1521791055366-0d553872125f", destinationUrl: `https://betaurbantools.in/launch/${RUN}`, placement: "directory_banner", cityTargets: ["Mumbai", "Pune"], status: "active", impressions: 9480, clicks: 318, billedImpressions: 9200, notes: "Demo city campaign", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, false);
  await up(["partnershipDeals", ids.deal], { listingBusinessId: ids.bizB, listingBusinessName: "Beta Urban Tools", listingBusinessSlug: slugB, listingOwnerUid: ownerB.uid, listingOwnerName: ownerB.name, initiatorUid: ownerA.uid, initiatorName: ownerA.name, initiatorEmail: ownerA.email, partnershipCategory: "Offline distribution", partnershipAmountMin: 120000, partnershipAmountMax: 600000, status: "agreement_reached", feeStatus: "pending", platformFeePercent: 2, agreedAmount: 300000, platformFeeAmount: 6000, participantUids: [ownerA.uid, ownerB.uid], lastMessagePreview: "Pilot value agreed at INR 300000.", lastMessageBy: ownerB.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, false);
  await signin(ownerA.email);
  await up(["partnershipDeals", ids.deal, "messages", `deal_a_${RUN}`], { senderUid: ownerA.uid, senderName: ownerA.name, senderRole: "initiator", text: "Interested in reseller partnership.", createdAt: serverTimestamp() }, false);
  await signin(ownerB.email);
  await up(["partnershipDeals", ids.deal, "messages", `deal_b_${RUN}`], { senderUid: ownerB.uid, senderName: ownerB.name, senderRole: "owner", text: "Let us proceed with INR 300000 pilot.", createdAt: serverTimestamp() }, false);

  await signin(customerA.email);
  await up(["verifierCustomerMemberships", customerA.uid], { customerUid: customerA.uid, customerName: customerA.name, customerEmail: customerA.email, customerPublicId: customerA.publicId, memberCode: `VVC-${customerA.uid.slice(0, 8).toUpperCase()}`, activeFrom: minusDays(12), activeUntil: plusDays(18), lastPurchaseCycle: "monthly", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await up(["membershipPurchases", `demo_mem_purchase_a_${RUN}`], { customerUid: customerA.uid, customerName: customerA.name, customerPublicId: customerA.publicId, billingCycle: "monthly", amount: 199, startsAt: minusDays(12), activeUntil: plusDays(18), createdAt: serverTimestamp() }, false);
  await up(["users", customerA.uid], { verifierCustomerMembershipStatus: "active", verifierCustomerMembershipActiveUntil: plusDays(18), updatedAt: serverTimestamp() });

  await signin(ownerA.email);
  await up(["membershipBusinessPrograms", ownerA.uid], { ownerUid: ownerA.uid, ownerName: ownerA.name, businessMode: "online", discountPercent: 15, status: "active", integrationApiKey: `mapi_demo_alpha_${RUN}`, sharePercent: 40, totalPayoutReceived: 8200, lastCycleKey: "2025-12", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await up(["membershipTransactions", `demo_mem_tx_a_${RUN}`], { businessOwnerUid: ownerA.uid, source: "online", externalOrderId: `ALPHA-WEB-${RUN}-01`, customerUid: customerA.uid, customerPublicId: customerA.publicId, transactionValue: 2400, membershipApplied: true, eligibleForScoring: true, ineligibilityReason: null, occurredAt: minusDays(4), createdAt: serverTimestamp() }, false);
  await up(["membershipApiUsageBuckets", `demo_api_bucket_${RUN}`], { ownerUid: ownerA.uid, endpointId: ids.endpoint, monthKey: "2026-04", usageCount: 184, billableCount: 184, updatedAt: serverTimestamp(), createdAt: serverTimestamp() }, false);

  await signin(ownerB.email);
  await up(["membershipBusinessPrograms", ownerB.uid], { ownerUid: ownerB.uid, ownerName: ownerB.name, businessMode: "hybrid", discountPercent: 12, status: "active", integrationApiKey: `mapi_demo_beta_${RUN}`, sharePercent: 40, totalPayoutReceived: 5300, lastCycleKey: "2025-12", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await up(["membershipTransactions", `demo_mem_tx_b_${RUN}`], { businessOwnerUid: ownerB.uid, source: "offline", externalOrderId: `BETA-OFF-${RUN}-01`, customerUid: customerA.uid, customerPublicId: customerA.publicId, transactionValue: 5200, membershipApplied: true, eligibleForScoring: true, ineligibilityReason: null, occurredAt: minusDays(3), createdAt: serverTimestamp() }, false);
  await up(["withdrawalRequests", `demo_withdrawal_${RUN}`], { ownerUid: ownerB.uid, ownerName: ownerB.name, amount: 18000, charges: 180, netAmount: 17820, currency: "INR", status: "pending", payoutStatus: "pending", accountHolderName: "Ravi Mehta", bankName: "HDFC Bank", accountNumberMasked: "XXXXXX4455", ifscCode: "HDFC0001020", country: "India", city: "Mumbai", note: "Demo payout request", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, false);
  await up(["payouts", `demo_payout_${RUN}`], { ownerUid: ownerB.uid, ownerName: ownerB.name, provider: "razorpayx", providerPayoutId: `pout_demo_${RUN}`, amount: 17820, currency: "INR", status: "queued", withdrawalRequestId: `demo_withdrawal_${RUN}`, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, false);

  console.log("\nDemo seed completed.");
  console.log(`Run ID: ${RUN}`);
  console.log(`Business IDs: ${ids.bizA}, ${ids.bizB}`);
  console.log(`Products: ${p1}, ${p2}, ${p3}, ${p4}`);
  console.log(`Orders: ${o1}, ${o2}, ${o3}`);
  console.log(`Tickets: ${t1}, ${t2}`);
  console.log(`Group: ${ids.group}`);
  console.log(`Endpoint: ${ids.endpoint}`);
  console.log(`Deal: ${ids.deal}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Demo seed failed");
    console.error(error);
    process.exit(1);
  });
