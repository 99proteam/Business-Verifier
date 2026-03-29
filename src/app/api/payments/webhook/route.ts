import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import {
  fetchPaymentIntentByProviderOrderId,
  markPaymentIntentAsFailed,
  markPaymentIntentAsPaid,
} from "@/lib/firebase/repositories";
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

    const rawBody = await request.text();
    const body = (JSON.parse(rawBody || "{}") as Record<string, unknown>) ?? {};

    const razorpaySignature = String(request.headers.get("x-razorpay-signature") ?? "").trim();
    if (razorpaySignature) {
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
      if (!webhookSecret) {
        return NextResponse.json(
          { ok: false, error: "RAZORPAY_WEBHOOK_SECRET is not configured." },
          { status: 500 },
        );
      }
      const digest = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
      if (digest !== razorpaySignature) {
        return NextResponse.json({ ok: false, error: "Invalid Razorpay webhook signature." }, { status: 401 });
      }

      const event = String(body.event ?? "").trim();
      const paymentEntity = (body.payload as Record<string, unknown> | undefined)?.payment as
        | Record<string, unknown>
        | undefined;
      const payment = (paymentEntity?.entity as Record<string, unknown> | undefined) ?? {};
      const providerOrderId = String(payment.order_id ?? "").trim();
      const providerPaymentId = String(payment.id ?? "").trim();
      if (!providerOrderId) {
        return NextResponse.json({ ok: false, error: "Missing order_id in Razorpay webhook." }, { status: 400 });
      }
      const intent = await fetchPaymentIntentByProviderOrderId(providerOrderId);
      if (!intent) {
        return NextResponse.json({ ok: false, error: "Payment intent not found for order_id." }, { status: 404 });
      }

      if (event === "payment.captured" || event === "order.paid") {
        const result = await markPaymentIntentAsPaid({
          intentId: intent.id,
          providerPaymentId,
          actorUid: "razorpay-webhook",
          actorRole: "system",
        });
        return NextResponse.json({ ok: true, result, rateLimit });
      }

      if (event === "payment.failed") {
        const failureReason = String(
          (payment.error_description as string | undefined) ??
            (payment.error_reason as string | undefined) ??
            "Razorpay payment failed",
        ).trim();
        await markPaymentIntentAsFailed({
          intentId: intent.id,
          reason: failureReason,
          actorUid: "razorpay-webhook",
          actorRole: "system",
        });
        return NextResponse.json({ ok: true, result: { intentId: intent.id, status: "failed" }, rateLimit });
      }

      return NextResponse.json({ ok: true, ignoredEvent: event, rateLimit });
    }

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
