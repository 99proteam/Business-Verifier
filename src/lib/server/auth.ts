import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { NextRequest } from "next/server";

export class AuthApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type VerifiedRequestAuth = {
  uid: string;
  email: string;
  name: string;
  isAdmin: boolean;
};

function readBearerToken(request: NextRequest) {
  const raw = String(request.headers.get("authorization") ?? "").trim();
  if (!raw.toLowerCase().startsWith("bearer ")) return "";
  return raw.slice(7).trim();
}

function parseAdminEmails() {
  const raw = process.env.ADMIN_EMAILS ?? process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminEmail(email: string) {
  if (!email) return false;
  const adminEmails = parseAdminEmails();
  if (!adminEmails.length) return false;
  return adminEmails.includes(email.toLowerCase());
}

async function isAdminUidFromFirestore(uid: string) {
  try {
    const app = ensureFirebaseAdminApp();
    const adminDoc = await getFirestore(app).doc(`admins/${uid}`).get();
    if (!adminDoc.exists) return false;
    return Boolean(adminDoc.data()?.active === true);
  } catch {
    return false;
  }
}

function ensureFirebaseAdminApp() {
  if (getApps().length) {
    return getApps()[0];
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim() ?? "";
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim() ?? "";
  const privateKeyRaw = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.trim() ?? "";

  if (!projectId || !clientEmail || !privateKeyRaw) {
    throw new AuthApiError(
      500,
      "Firebase Admin SDK is not configured. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY.",
    );
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export async function verifyRequestAuth(request: NextRequest): Promise<VerifiedRequestAuth> {
  const token = readBearerToken(request);
  if (!token) {
    throw new AuthApiError(401, "Missing Authorization bearer token.");
  }

  try {
    const app = ensureFirebaseAdminApp();
    const decoded = await getAuth(app).verifyIdToken(token);
    const email = String(decoded.email ?? "");
    const name = String(decoded.name ?? "");
    const adminFromDoc = await isAdminUidFromFirestore(decoded.uid);
    const adminFromEmail = isAdminEmail(email);
    return {
      uid: decoded.uid,
      email,
      name,
      isAdmin: adminFromDoc || adminFromEmail,
    };
  } catch (error) {
    if (error instanceof AuthApiError) throw error;
    throw new AuthApiError(401, "Invalid or expired authentication token.");
  }
}

export async function requireOwnerAuth(request: NextRequest, ownerUid: string) {
  const auth = await verifyRequestAuth(request);
  if (!auth.isAdmin && auth.uid !== ownerUid) {
    throw new AuthApiError(403, "You are not allowed to perform this action for the given owner UID.");
  }
  return auth;
}

export async function requireAdminAuth(request: NextRequest) {
  const auth = await verifyRequestAuth(request);
  if (!auth.isAdmin) {
    throw new AuthApiError(403, "Admin access required.");
  }
  return auth;
}

type AdminOrSecretAuthResult =
  | {
      mode: "admin";
      uid: string;
      email: string;
      name: string;
      isAdmin: true;
    }
  | {
      mode: "secret";
      isAdmin: false;
    };

export async function requireAdminOrSecret(
  request: NextRequest,
  options: {
    secretHeaderName: string;
    secretEnvName: string;
    unauthorizedError?: string;
  },
): Promise<AdminOrSecretAuthResult> {
  const bearer = readBearerToken(request);
  if (bearer) {
    const admin = await requireAdminAuth(request);
    return {
      mode: "admin",
      uid: admin.uid,
      email: admin.email,
      name: admin.name,
      isAdmin: true,
    };
  }

  const expectedSecret = process.env[options.secretEnvName]?.trim();
  if (!expectedSecret) {
    throw new AuthApiError(500, `${options.secretEnvName} is not configured.`);
  }
  const receivedSecret = String(request.headers.get(options.secretHeaderName) ?? "").trim();
  if (!receivedSecret || receivedSecret !== expectedSecret) {
    throw new AuthApiError(401, options.unauthorizedError ?? "Unauthorized secret.");
  }
  return {
    mode: "secret",
    isAdmin: false,
  };
}
