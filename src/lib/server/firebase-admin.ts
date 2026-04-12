import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim() ?? "";
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

export function ensureFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const projectId = readRequiredEnv("FIREBASE_ADMIN_PROJECT_ID");
  const clientEmail = readRequiredEnv("FIREBASE_ADMIN_CLIENT_EMAIL");
  const privateKey = readRequiredEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n");

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export function getAdminFirestore() {
  return getFirestore(ensureFirebaseAdminApp());
}

export function getAdminMessaging() {
  return getMessaging(ensureFirebaseAdminApp());
}
