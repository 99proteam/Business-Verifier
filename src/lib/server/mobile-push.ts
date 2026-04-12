import { createHash } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore, getAdminMessaging } from "@/lib/server/firebase-admin";

export type MobilePushPlatform = "android" | "ios" | "web" | "unknown";

type RegisterMobilePushTokenInput = {
  uid: string;
  token: string;
  platform: MobilePushPlatform;
  appVersion?: string;
  deviceName?: string;
};

type UnregisterMobilePushTokenInput = {
  uid: string;
  token: string;
};

type DispatchMobilePushQueueInput = {
  limit?: number;
  trigger: "api" | "cron";
};

export type DispatchMobilePushQueueResult = {
  scanned: number;
  sent: number;
  partial: number;
  failed: number;
  noTokens: number;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function parseErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "";
  if ("code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "";
}

function isInvalidTokenErrorCode(code: string) {
  return (
    code.includes("registration-token-not-registered") ||
    code.includes("invalid-registration-token")
  );
}

export async function registerMobilePushToken(input: RegisterMobilePushTokenInput) {
  const token = input.token.trim();
  if (!token) {
    throw new Error("FCM token is required.");
  }
  const tokenId = hashToken(token);
  const firestore = getAdminFirestore();
  const tokenRef = firestore.doc(`users/${input.uid}/mobilePushTokens/${tokenId}`);
  const existing = await tokenRef.get();
  const now = FieldValue.serverTimestamp();

  await tokenRef.set(
    {
      uid: input.uid,
      token,
      tokenHash: tokenId,
      platform: input.platform,
      appVersion: input.appVersion?.trim() || null,
      deviceName: input.deviceName?.trim() || null,
      active: true,
      revokedAt: null,
      lastSeenAt: now,
      updatedAt: now,
      createdAt: existing.exists ? existing.data()?.createdAt ?? now : now,
    },
    { merge: true },
  );

  return {
    tokenId,
    alreadyExisted: existing.exists,
  };
}

export async function unregisterMobilePushToken(input: UnregisterMobilePushTokenInput) {
  const token = input.token.trim();
  if (!token) {
    throw new Error("FCM token is required.");
  }
  const tokenId = hashToken(token);
  const firestore = getAdminFirestore();
  const tokenRef = firestore.doc(`users/${input.uid}/mobilePushTokens/${tokenId}`);
  const snapshot = await tokenRef.get();
  if (!snapshot.exists) {
    return {
      tokenId,
      existed: false,
    };
  }
  await tokenRef.set(
    {
      active: false,
      revokedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return {
    tokenId,
    existed: true,
  };
}

export async function dispatchMobilePushQueue(
  input: DispatchMobilePushQueueInput,
): Promise<DispatchMobilePushQueueResult> {
  const firestore = getAdminFirestore();
  const messaging = getAdminMessaging();
  const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 120), 300));
  const queueSnapshot = await firestore
    .collection("mobilePushQueue")
    .where("status", "==", "pending")
    .limit(limit)
    .get();

  let sent = 0;
  let partial = 0;
  let failed = 0;
  let noTokens = 0;

  for (const queueDoc of queueSnapshot.docs) {
    const data = queueDoc.data() as Record<string, unknown>;
    const recipientUid = String(data.recipientUid ?? "").trim();
    const title = String(data.title ?? "").trim();
    const message = String(data.message ?? "").trim();
    const category = String(data.category ?? "general").trim();
    const source = String(data.source ?? "platform").trim();
    const deepLink = String(data.deepLink ?? "/dashboard/notifications").trim();

    if (!recipientUid || !title || !message) {
      await queueDoc.ref.set(
        {
          status: "failed",
          lastError: "Invalid queue payload.",
          trigger: input.trigger,
          attemptCount: FieldValue.increment(1),
          dispatchedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      failed += 1;
      continue;
    }

    const tokenSnapshot = await firestore
      .collection(`users/${recipientUid}/mobilePushTokens`)
      .where("active", "==", true)
      .limit(20)
      .get();
    if (tokenSnapshot.empty) {
      await queueDoc.ref.set(
        {
          status: "no_tokens",
          lastError: null,
          deliveredCount: 0,
          failureCount: 0,
          trigger: input.trigger,
          attemptCount: FieldValue.increment(1),
          dispatchedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      noTokens += 1;
      continue;
    }

    const tokens = tokenSnapshot.docs
      .map((doc) => String(doc.data().token ?? "").trim())
      .filter(Boolean);
    if (!tokens.length) {
      await queueDoc.ref.set(
        {
          status: "no_tokens",
          lastError: "No valid tokens found.",
          deliveredCount: 0,
          failureCount: 0,
          trigger: input.trigger,
          attemptCount: FieldValue.increment(1),
          dispatchedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      noTokens += 1;
      continue;
    }

    try {
      const response = await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title,
          body: message,
        },
        data: {
          category,
          source,
          queueId: queueDoc.id,
          recipientUid,
          deepLink,
        },
      });

      const invalidTokenIndexes: number[] = [];
      response.responses.forEach((entry, index) => {
        if (!entry.success && isInvalidTokenErrorCode(parseErrorCode(entry.error))) {
          invalidTokenIndexes.push(index);
        }
      });
      if (invalidTokenIndexes.length) {
        const batch = firestore.batch();
        invalidTokenIndexes.forEach((index) => {
          const docRef = tokenSnapshot.docs[index]?.ref;
          if (!docRef) return;
          batch.set(
            docRef,
            {
              active: false,
              revokedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        });
        await batch.commit();
      }

      const deliveryStatus =
        response.failureCount === 0
          ? "sent"
          : response.successCount === 0
            ? "failed"
            : "partial";
      await queueDoc.ref.set(
        {
          status: deliveryStatus,
          deliveredCount: response.successCount,
          failureCount: response.failureCount,
          lastError:
            response.failureCount > 0 ? "Some tokens failed during FCM dispatch." : null,
          trigger: input.trigger,
          attemptCount: FieldValue.increment(1),
          dispatchedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      if (deliveryStatus === "sent") {
        sent += 1;
      } else if (deliveryStatus === "partial") {
        partial += 1;
      } else {
        failed += 1;
      }
    } catch (dispatchError) {
      const messageText =
        dispatchError instanceof Error ? dispatchError.message : "Unexpected FCM dispatch error.";
      await queueDoc.ref.set(
        {
          status: "failed",
          lastError: messageText,
          trigger: input.trigger,
          attemptCount: FieldValue.increment(1),
          dispatchedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      failed += 1;
    }
  }

  return {
    scanned: queueSnapshot.size,
    sent,
    partial,
    failed,
    noTokens,
  };
}
