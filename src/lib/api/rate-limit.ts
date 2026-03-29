import { NextRequest } from "next/server";
import {
  doc,
  getDoc,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";

type RateLimitInput = {
  scope: string;
  identifier: string;
  limit: number;
  windowMinutes: number;
  metadata?: Record<string, string | number | boolean | null>;
};

export type RateLimitResult = {
  scope: string;
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
};

function safeHash(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function nowWindow(windowMinutes: number) {
  const safeWindowMs = Math.max(1, Math.floor(windowMinutes)) * 60 * 1000;
  const now = Date.now();
  const start = Math.floor(now / safeWindowMs) * safeWindowMs;
  return {
    start,
    end: start + safeWindowMs,
  };
}

export function getRequestIdentifier(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
  const firstIp = forwardedFor.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const userAgent = request.headers.get("user-agent")?.trim() ?? "unknown";
  return `${firstIp || realIp || "unknown_ip"}:${userAgent.slice(0, 80)}`;
}

export async function enforceApiRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  const safeLimit = Math.max(1, Math.floor(input.limit));
  const windowMinutes = Math.max(1, Math.floor(input.windowMinutes));
  const window = nowWindow(windowMinutes);
  const idHash = safeHash(`${input.scope}:${input.identifier}`);
  const key = `${input.scope}_${idHash}_${window.start}`;

  if (!db) {
    return {
      scope: input.scope,
      limit: safeLimit,
      used: 1,
      remaining: Math.max(safeLimit - 1, 0),
      resetAt: new Date(window.end).toISOString(),
    };
  }

  const ref = doc(db, "apiRateLimits", key);
  let used = 1;

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = Number(snapshot.data()?.count ?? 0);
    if (current >= safeLimit) {
      throw new Error(
        `Rate limit exceeded for ${input.scope}. Try again after ${new Date(
          window.end,
        ).toISOString()}`,
      );
    }
    used = current + 1;
    transaction.set(
      ref,
      {
        scope: input.scope,
        identifierHash: idHash,
        count: used,
        limit: safeLimit,
        windowStartAt: new Date(window.start).toISOString(),
        windowEndAt: new Date(window.end).toISOString(),
        metadata: input.metadata ?? null,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });

  return {
    scope: input.scope,
    limit: safeLimit,
    used,
    remaining: Math.max(safeLimit - used, 0),
    resetAt: new Date(window.end).toISOString(),
  };
}

export async function seedRouteRateLimitConfig() {
  if (!db) return;
  const ref = doc(db, "platformSettings", "apiRateLimitDefaults");
  const snapshot = await getDoc(ref);
  if (snapshot.exists()) return;
  await setDoc(
    ref,
    {
      defaults: {
        publicReadPer10Min: 120,
        automationPer10Min: 60,
        paymentPer10Min: 80,
        exportPer10Min: 20,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function incrementRouteAbuseSignal(payload: {
  key: string;
  reason: string;
  actor?: string;
}) {
  if (!db) return;
  const ref = doc(db, "apiAbuseSignals", payload.key);
  await setDoc(
    ref,
    {
      key: payload.key,
      reason: payload.reason,
      actor: payload.actor ?? null,
      count: increment(1),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
