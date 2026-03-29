import { NextRequest, NextResponse } from "next/server";
import { markPaymentIntentAsPaid } from "@/lib/firebase/repositories";
import { enforceApiRateLimit, getRequestIdentifier } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceApiRateLimit({
      scope: "payments_intents_confirm",
      identifier: getRequestIdentifier(request),
      limit: Number(process.env.PAYMENT_API_RATE_LIMIT_PER_10_MIN ?? "150"),
      windowMinutes: 10,
    });

    const body = (await request.json()) as Record<string, unknown>;
    const intentId = String(body.intentId ?? "").trim();
    const actorUid = String(body.actorUid ?? "system").trim() || "system";
    const actorRole = body.actorRole === "admin" ? "admin" : body.actorRole === "customer" ? "customer" : "system";
    const providerPaymentId = body.providerPaymentId
      ? String(body.providerPaymentId).trim()
      : undefined;
    if (!intentId) {
      return NextResponse.json({ ok: false, error: "intentId is required." }, { status: 400 });
    }

    const result = await markPaymentIntentAsPaid({
      intentId,
      providerPaymentId,
      actorUid,
      actorRole,
    });
    return NextResponse.json({
      ok: true,
      result,
      rateLimit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected payment API error.";
    const status = message.toLowerCase().includes("rate limit exceeded") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
