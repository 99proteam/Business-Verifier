import { NextRequest, NextResponse } from "next/server";
import {
  createProductCheckoutPaymentIntent,
  createWalletTopupPaymentIntent,
  fetchPaymentIntentById,
} from "@/lib/firebase/repositories";
import { enforceApiRateLimit, getRequestIdentifier } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceApiRateLimit({
      scope: "payments_intents_create",
      identifier: getRequestIdentifier(request),
      limit: Number(process.env.PAYMENT_API_RATE_LIMIT_PER_10_MIN ?? "150"),
      windowMinutes: 10,
    });

    const body = (await request.json()) as Record<string, unknown>;
    const purpose = body.purpose === "product_checkout" ? "product_checkout" : "wallet_topup";
    const ownerUid = String(body.ownerUid ?? "").trim();
    const ownerName = String(body.ownerName ?? "").trim() || "User";
    const ownerEmail = String(body.ownerEmail ?? "").trim();
    if (!ownerUid || !ownerEmail) {
      return NextResponse.json(
        { ok: false, error: "Required fields: ownerUid, ownerEmail." },
        { status: 400 },
      );
    }

    let intentId = "";
    if (purpose === "wallet_topup") {
      const amount = Number(body.amount ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json(
          { ok: false, error: "Wallet top-up requires positive amount." },
          { status: 400 },
        );
      }
      intentId = await createWalletTopupPaymentIntent({
        ownerUid,
        ownerName,
        ownerEmail,
        amount,
      });
    } else {
      const productSlug = String(body.productSlug ?? "").trim();
      if (!productSlug) {
        return NextResponse.json(
          { ok: false, error: "Product checkout requires productSlug." },
          { status: 400 },
        );
      }
      intentId = await createProductCheckoutPaymentIntent({
        ownerUid,
        ownerName,
        ownerEmail,
        productSlug,
      });
    }

    const intent = await fetchPaymentIntentById(intentId);
    return NextResponse.json({
      ok: true,
      intent,
      rateLimit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected payment API error.";
    const status = message.toLowerCase().includes("rate limit exceeded") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
