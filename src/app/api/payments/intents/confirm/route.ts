import { NextRequest, NextResponse } from "next/server";
import {
  fetchPaymentIntentById,
  markPaymentIntentAsFailed,
  markPaymentIntentAsPaid,
} from "@/lib/firebase/repositories";
import { enforceApiRateLimit, getRequestIdentifier } from "@/lib/api/rate-limit";
import { AuthApiError, verifyRequestAuth } from "@/lib/server/auth";
import { verifyRazorpayPaymentSignature } from "@/lib/server/payments/razorpay";

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
    const requester = await verifyRequestAuth(request);
    const actorUid = requester.uid;
    const actorRole = requester.isAdmin ? "admin" : "customer";
    const providerPaymentId = body.providerPaymentId
      ? String(body.providerPaymentId).trim()
      : undefined;
    const providerOrderId = body.providerOrderId ? String(body.providerOrderId).trim() : "";
    const providerSignature = body.providerSignature ? String(body.providerSignature).trim() : "";
    if (!intentId) {
      return NextResponse.json({ ok: false, error: "intentId is required." }, { status: 400 });
    }

    const intent = await fetchPaymentIntentById(intentId);
    if (!intent) {
      return NextResponse.json({ ok: false, error: "Payment intent not found." }, { status: 404 });
    }
    if (!requester.isAdmin && intent.ownerUid !== requester.uid) {
      return NextResponse.json(
        { ok: false, error: "You are not allowed to confirm this payment intent." },
        { status: 403 },
      );
    }

    if (intent.provider === "razorpay") {
      if (!providerPaymentId || !providerOrderId || !providerSignature) {
        return NextResponse.json(
          {
            ok: false,
            error: "Razorpay confirmation requires providerPaymentId, providerOrderId, and providerSignature.",
          },
          { status: 400 },
        );
      }
      if (intent.providerOrderId && intent.providerOrderId !== providerOrderId) {
        return NextResponse.json(
          { ok: false, error: "Provider order mismatch for payment intent." },
          { status: 400 },
        );
      }
      const valid = verifyRazorpayPaymentSignature({
        orderId: providerOrderId,
        paymentId: providerPaymentId,
        signature: providerSignature,
      });
      if (!valid) {
        await markPaymentIntentAsFailed({
          intentId,
          reason: "Razorpay signature verification failed.",
          actorUid,
          actorRole: "system",
        });
        return NextResponse.json(
          { ok: false, error: "Invalid Razorpay payment signature." },
          { status: 400 },
        );
      }
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
    if (error instanceof AuthApiError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unexpected payment API error.";
    const status = message.toLowerCase().includes("rate limit exceeded") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
