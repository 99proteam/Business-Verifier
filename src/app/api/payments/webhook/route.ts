import { NextRequest, NextResponse } from "next/server";
import { markPaymentIntentAsFailed, markPaymentIntentAsPaid } from "@/lib/firebase/repositories";
import { enforceApiRateLimit, getRequestIdentifier } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceApiRateLimit({
      scope: "payments_webhook",
      identifier: getRequestIdentifier(request),
      limit: Number(process.env.PAYMENT_WEBHOOK_RATE_LIMIT_PER_10_MIN ?? "300"),
      windowMinutes: 10,
    });

    const expectedSecret = process.env.PAYMENT_WEBHOOK_SECRET?.trim();
    if (!expectedSecret) {
      return NextResponse.json(
        { ok: false, error: "PAYMENT_WEBHOOK_SECRET is not configured." },
        { status: 500 },
      );
    }
    const receivedSecret = String(request.headers.get("x-payment-webhook-secret") ?? "").trim();
    if (!receivedSecret || receivedSecret !== expectedSecret) {
      return NextResponse.json({ ok: false, error: "Unauthorized webhook secret." }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const intentId = String(body.intentId ?? "").trim();
    const event = String(body.event ?? "").trim().toLowerCase();
    const providerPaymentId = body.providerPaymentId
      ? String(body.providerPaymentId).trim()
      : undefined;
    if (!intentId || !event) {
      return NextResponse.json(
        { ok: false, error: "Required fields: intentId, event." },
        { status: 400 },
      );
    }

    if (event === "payment_success") {
      const result = await markPaymentIntentAsPaid({
        intentId,
        providerPaymentId,
        actorUid: "payment-webhook",
        actorRole: "system",
      });
      return NextResponse.json({ ok: true, result, rateLimit });
    }

    if (event === "payment_failed") {
      await markPaymentIntentAsFailed({
        intentId,
        reason: String(body.reason ?? "Payment failed").trim(),
        actorUid: "payment-webhook",
        actorRole: "system",
      });
      return NextResponse.json({ ok: true, result: { intentId, status: "failed" }, rateLimit });
    }

    return NextResponse.json({ ok: false, error: `Unsupported event ${event}.` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected webhook error.";
    const status = message.toLowerCase().includes("rate limit exceeded") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
