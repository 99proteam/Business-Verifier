import { NextRequest, NextResponse } from "next/server";
import {
  attachPaymentIntentGatewayData,
  createProductCheckoutPaymentIntent,
  createWalletTopupPaymentIntent,
  fetchPaymentIntentById,
  PaymentCurrency,
  PaymentProvider,
} from "@/lib/firebase/repositories";
import { enforceApiRateLimit, getRequestIdentifier } from "@/lib/api/rate-limit";
import { AuthApiError, requireOwnerAuth } from "@/lib/server/auth";
import { createRazorpayOrder } from "@/lib/server/payments/razorpay";
import { createPayPalOrder } from "@/lib/server/payments/paypal";

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
    const providerRaw = String(body.provider ?? "").trim().toLowerCase();
    const currencyRaw = String(body.currency ?? "INR").trim().toUpperCase();
    const provider: PaymentProvider | undefined =
      providerRaw === "razorpay" || providerRaw === "paypal" || providerRaw === "mock"
        ? (providerRaw as PaymentProvider)
        : undefined;
    let currency: PaymentCurrency = currencyRaw === "USD" ? "USD" : "INR";
    if (provider === "razorpay") {
      currency = "INR";
    }
    const ownerUid = String(body.ownerUid ?? "").trim();
    const ownerName = String(body.ownerName ?? "").trim() || "User";
    const ownerEmail = String(body.ownerEmail ?? "").trim();
    if (!ownerUid || !ownerEmail) {
      return NextResponse.json(
        { ok: false, error: "Required fields: ownerUid, ownerEmail." },
        { status: 400 },
      );
    }
    const auth = await requireOwnerAuth(request, ownerUid);
    if (!auth.isAdmin && auth.email && auth.email.toLowerCase() !== ownerEmail.toLowerCase()) {
      return NextResponse.json(
        { ok: false, error: "ownerEmail must match authenticated user email." },
        { status: 403 },
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
        provider,
        currency,
      });
    } else {
      const productSlug = String(body.productSlug ?? "").trim();
      const pricingPlanKey = body.pricingPlanKey
        ? String(body.pricingPlanKey).trim()
        : undefined;
      const couponCode = body.couponCode ? String(body.couponCode).trim() : undefined;
      const shippingZoneId = body.shippingZoneId
        ? String(body.shippingZoneId).trim()
        : undefined;
      const checkoutCountry = body.checkoutCountry
        ? String(body.checkoutCountry).trim()
        : undefined;
      const checkoutCity = body.checkoutCity
        ? String(body.checkoutCity).trim()
        : undefined;
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
        pricingPlanKey,
        provider,
        currency,
        couponCode,
        shippingZoneId,
        checkoutCountry,
        checkoutCity,
      });
    }

    let intent = await fetchPaymentIntentById(intentId);
    if (intent?.provider === "razorpay" && !intent.providerOrderId) {
      const order = await createRazorpayOrder({
        amountInPaise: Math.round(intent.amount * 100),
        currency: intent.currency,
        receipt: `bv_${intent.id.slice(0, 22)}`,
        notes: {
          intentId: intent.id,
          ownerUid: intent.ownerUid,
          purpose: intent.purpose,
        },
      });
      await attachPaymentIntentGatewayData({
        intentId: intent.id,
        providerOrderId: order.id,
        paymentUrl: `${process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000"}/payments/razorpay/${intent.id}`,
        metadata: {
          razorpayOrderStatus: order.status,
          razorpayAmount: String(order.amount),
        },
      });
      intent = await fetchPaymentIntentById(intent.id);
    } else if (intent?.provider === "paypal" && !intent.providerOrderId) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
      const order = await createPayPalOrder({
        amount: intent.amount,
        currency: intent.currency,
        intentId: intent.id,
        description:
          intent.purpose === "wallet_topup"
            ? "Business Verifier wallet top-up"
            : `Business Verifier checkout ${intent.productSlug ?? ""}`.trim(),
        returnUrl: `${appUrl}/payments/paypal/${intent.id}`,
        cancelUrl: `${appUrl}/payments/paypal/${intent.id}?cancelled=1`,
      });
      await attachPaymentIntentGatewayData({
        intentId: intent.id,
        providerOrderId: order.id,
        paymentUrl: `${appUrl}/payments/paypal/${intent.id}`,
        metadata: {
          paypalOrderStatus: order.status,
          paypalApproveLink: order.approveLink,
        },
      });
      intent = await fetchPaymentIntentById(intent.id);
    }
    return NextResponse.json({
      ok: true,
      intent,
      gateway: intent?.provider === "razorpay"
        ? {
            provider: "razorpay",
            keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim() || process.env.RAZORPAY_KEY_ID?.trim() || "",
          }
        : intent?.provider === "paypal"
          ? {
              provider: "paypal",
              clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() || "",
            }
        : {
            provider: "mock",
          },
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
