import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  fetchPayoutByProviderPayoutId,
  finalizePayoutSettlement,
} from "@/lib/firebase/repositories";
import { enforceApiRateLimit, getRequestIdentifier } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceApiRateLimit({
      scope: "payouts_webhook",
      identifier: getRequestIdentifier(request),
      limit: Number(process.env.PAYOUT_API_RATE_LIMIT_PER_10_MIN ?? "100"),
      windowMinutes: 10,
    });

    const webhookSecret = process.env.RAZORPAYX_WEBHOOK_SECRET?.trim();
    if (!webhookSecret) {
      return NextResponse.json(
        { ok: false, error: "RAZORPAYX_WEBHOOK_SECRET is not configured." },
        { status: 500 },
      );
    }

    const rawBody = await request.text();
    const signature = String(request.headers.get("x-razorpay-signature") ?? "").trim();
    if (!signature) {
      return NextResponse.json({ ok: false, error: "Missing webhook signature." }, { status: 401 });
    }
    const digest = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    if (digest !== signature) {
      return NextResponse.json({ ok: false, error: "Invalid webhook signature." }, { status: 401 });
    }

    const body = (JSON.parse(rawBody || "{}") as Record<string, unknown>) ?? {};
    const event = String(body.event ?? "").trim();
    const payoutEntity = ((body.payload as Record<string, unknown> | undefined)?.payout ??
      {}) as Record<string, unknown>;
    const payoutData = (payoutEntity.entity as Record<string, unknown> | undefined) ?? {};
    const providerPayoutId = String(payoutData.id ?? "").trim();
    if (!providerPayoutId) {
      return NextResponse.json({ ok: false, error: "Missing payout id in webhook payload." }, { status: 400 });
    }

    const payout = await fetchPayoutByProviderPayoutId(providerPayoutId);
    if (!payout) {
      return NextResponse.json({ ok: false, error: "Payout record not found." }, { status: 404 });
    }

    if (event === "payout.processed" || event === "payout.completed") {
      await finalizePayoutSettlement({
        payoutId: payout.id,
        providerPayoutId,
        status: "success",
        actorUid: "payout-webhook",
        actorRole: "system",
      });
      return NextResponse.json({ ok: true, status: "success", rateLimit });
    }

    if (event === "payout.failed" || event === "payout.rejected" || event === "payout.reversed") {
      await finalizePayoutSettlement({
        payoutId: payout.id,
        providerPayoutId,
        status: "failed",
        failureReason: String(payoutData.failure_reason ?? payoutData.status_details ?? "Payout failed"),
        actorUid: "payout-webhook",
        actorRole: "system",
      });
      return NextResponse.json({ ok: true, status: "failed", rateLimit });
    }

    return NextResponse.json({ ok: true, ignoredEvent: event, rateLimit });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected payout webhook error.";
    const status = message.toLowerCase().includes("rate limit exceeded") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
