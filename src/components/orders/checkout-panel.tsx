"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  CheckoutPricingBreakdownRecord,
  computeCheckoutPricingForProduct,
  createOrderFromProduct,
  DigitalProductRecord,
  fetchShopCheckoutContextByBusinessOwner,
  resolveProductPricingPlan,
  ShopCouponRecord,
  ShopShippingZoneRecord,
} from "@/lib/firebase/repositories";

export function CheckoutPanel({
  product,
  initialPlanKey,
}: {
  product: DigitalProductRecord;
  initialPlanKey?: string;
}) {
  const { user, hasFirebaseConfig } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"wallet" | "gateway">("wallet");
  const [gatewayProvider, setGatewayProvider] = useState<"razorpay" | "paypal">("razorpay");
  const [currency, setCurrency] = useState<"INR" | "USD">("INR");
  const [selectedPlanKey, setSelectedPlanKey] = useState(initialPlanKey ?? product.pricingPlans?.[0]?.key ?? "standard");
  const [couponCode, setCouponCode] = useState("");
  const [checkoutCountry, setCheckoutCountry] = useState("");
  const [checkoutCity, setCheckoutCity] = useState("");
  const [shippingZoneId, setShippingZoneId] = useState("");
  const [availableCoupons, setAvailableCoupons] = useState<ShopCouponRecord[]>([]);
  const [shippingZones, setShippingZones] = useState<ShopShippingZoneRecord[]>([]);
  const [pricingPreview, setPricingPreview] = useState<CheckoutPricingBreakdownRecord>({
    baseAmountInr: product.price,
    discountAmountInr: 0,
    shippingAmountInr: 0,
    taxAmountInr: 0,
    finalAmountInr: product.price,
    taxRuleIds: [],
  });
  const [pricingBusy, setPricingBusy] = useState(false);
  const [pricingWarning, setPricingWarning] = useState<string | null>(null);

  useEffect(() => {
    setSelectedPlanKey(initialPlanKey ?? product.pricingPlans?.[0]?.key ?? "standard");
  }, [initialPlanKey, product.id, product.pricingPlans]);

  const selectedPlan = useMemo(
    () => resolveProductPricingPlan(product, selectedPlanKey),
    [product, selectedPlanKey],
  );
  const usdRate = 83;
  const payableInr = pricingPreview.finalAmountInr || selectedPlan.price;
  const amountInUsd = useMemo(
    () => Math.max(0.5, Math.round((payableInr / usdRate) * 100) / 100),
    [payableInr],
  );

  useEffect(() => {
    let active = true;
    async function loadCheckoutContext() {
      if (!hasFirebaseConfig) return;
      try {
        const context = await fetchShopCheckoutContextByBusinessOwner(product.ownerUid);
        if (!active) return;
        setAvailableCoupons(context.coupons);
        setShippingZones(context.shippingZones);
      } catch {
        if (!active) return;
        setAvailableCoupons([]);
        setShippingZones([]);
      }
    }
    void loadCheckoutContext();
    return () => {
      active = false;
    };
  }, [hasFirebaseConfig, product.ownerUid]);

  useEffect(() => {
    let active = true;
    async function recomputePreview() {
      if (!hasFirebaseConfig) return;
      setPricingBusy(true);
      setPricingWarning(null);
      try {
        const result = await computeCheckoutPricingForProduct({
          businessOwnerUid: product.ownerUid,
          selectedPlanPriceInr: selectedPlan.price,
          pricingPlanKey: selectedPlan.key,
          couponCode: couponCode.trim() || undefined,
          shippingZoneId: shippingZoneId || undefined,
          checkoutCountry: checkoutCountry.trim() || undefined,
          checkoutCity: checkoutCity.trim() || undefined,
        });
        if (!active) return;
        setPricingPreview(result);
      } catch (previewError) {
        if (!active) return;
        setPricingPreview({
          baseAmountInr: selectedPlan.price,
          discountAmountInr: 0,
          shippingAmountInr: 0,
          taxAmountInr: 0,
          finalAmountInr: selectedPlan.price,
          taxRuleIds: [],
        });
        setPricingWarning(
          previewError instanceof Error
            ? previewError.message
            : "Pricing preview unavailable with current values.",
        );
      } finally {
        if (active) {
          setPricingBusy(false);
        }
      }
    }
    void recomputePreview();
    return () => {
      active = false;
    };
  }, [
    checkoutCity,
    checkoutCountry,
    couponCode,
    hasFirebaseConfig,
    product.ownerUid,
    selectedPlan.key,
    selectedPlan.price,
    shippingZoneId,
  ]);

  const canRefund = !product.noRefund;

  return (
    <article className="glass rounded-3xl p-6">
      <h1 className="text-3xl font-semibold tracking-tight">Checkout</h1>
      <p className="mt-2 text-sm text-muted">
        Product: <b>{product.title}</b> by {product.ownerName}
      </p>
      <p className="mt-3 text-2xl font-semibold">INR {payableInr}</p>
      <p className="mt-1 text-sm text-muted">USD {amountInUsd} approx</p>

      <div className="mt-4 rounded-2xl border border-border bg-surface p-4 text-sm">
        <p className="font-medium">Pricing plans</p>
        <div className="mt-2 grid gap-2">
          {product.pricingPlans.map((plan) => (
            <label
              key={plan.key}
              className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                selectedPlan.key === plan.key
                  ? "border-brand/50 bg-brand/10"
                  : "border-border"
              }`}
            >
              <span>
                {plan.name} | {plan.billingCycle.replace("_", " ")}
              </span>
              <span className="flex items-center gap-2">
                <b>INR {plan.price}</b>
                <input
                  type="radio"
                  name="pricingPlan"
                  checked={selectedPlan.key === plan.key}
                  onChange={() => setSelectedPlanKey(plan.key)}
                />
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-surface p-4 text-sm">
        <p>Escrow lock: 45 days from purchase date.</p>
        <p className="mt-1">
          Refund window: {canRefund ? "Up to 45 days with proof" : "No refund for this product"}
        </p>
        <p className="mt-1">
          Payment source: {paymentMethod === "wallet" ? "Wallet balance" : "Gateway checkout"}.{" "}
          <Link href="/dashboard/wallet" className="text-brand underline">
            Add funds
          </Link>
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setPaymentMethod("wallet")}
            className={`rounded-lg px-3 py-1 text-xs transition ${
              paymentMethod === "wallet"
                ? "bg-brand text-white"
                : "border border-border hover:border-brand/40"
            }`}
          >
            Wallet
          </button>
          <button
            type="button"
            onClick={() => setPaymentMethod("gateway")}
            className={`rounded-lg px-3 py-1 text-xs transition ${
              paymentMethod === "gateway"
                ? "bg-brand text-white"
                : "border border-border hover:border-brand/40"
            }`}
          >
            Gateway
          </button>
        </div>
        {paymentMethod === "gateway" ? (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setGatewayProvider("razorpay");
                  setCurrency("INR");
                }}
                className={`rounded-lg px-3 py-1 text-xs transition ${
                  gatewayProvider === "razorpay"
                    ? "bg-brand text-white"
                    : "border border-border hover:border-brand/40"
                }`}
              >
                Razorpay
              </button>
              <button
                type="button"
                onClick={() => setGatewayProvider("paypal")}
                className={`rounded-lg px-3 py-1 text-xs transition ${
                  gatewayProvider === "paypal"
                    ? "bg-brand text-white"
                    : "border border-border hover:border-brand/40"
                }`}
              >
                PayPal
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCurrency("INR")}
                className={`rounded-lg px-3 py-1 text-xs transition ${
                  currency === "INR"
                    ? "bg-brand text-white"
                    : "border border-border hover:border-brand/40"
                }`}
              >
                INR
              </button>
              <button
                type="button"
                onClick={() => setCurrency("USD")}
                disabled={gatewayProvider === "razorpay"}
                className={`rounded-lg px-3 py-1 text-xs transition ${
                  currency === "USD"
                    ? "bg-brand text-white"
                    : "border border-border hover:border-brand/40"
                }`}
              >
                USD
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-surface p-4 text-sm">
        <p className="font-medium">Coupon, shipping, and tax</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-muted">Coupon code</span>
            <input
              value={couponCode}
              onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
              placeholder="Example: WELCOME10"
              className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted">Shipping zone</span>
            <select
              value={shippingZoneId}
              onChange={(event) => setShippingZoneId(event.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
            >
              <option value="">No shipping fee</option>
              {shippingZones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.label} (INR {zone.feeInr})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted">Country code (for tax/shipping)</span>
            <input
              value={checkoutCountry}
              onChange={(event) => setCheckoutCountry(event.target.value.toUpperCase())}
              placeholder="IN, US"
              className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted">City (for tax/shipping)</span>
            <input
              value={checkoutCity}
              onChange={(event) => setCheckoutCity(event.target.value)}
              placeholder="Bengaluru"
              className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
            />
          </label>
        </div>
        {!!availableCoupons.length && (
          <div className="mt-3 flex flex-wrap gap-2">
            {availableCoupons.slice(0, 6).map((coupon) => (
              <button
                key={coupon.id}
                type="button"
                onClick={() => setCouponCode(coupon.code)}
                className="rounded-full border border-border px-2.5 py-1 text-xs transition hover:border-brand/40"
              >
                {coupon.code}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 rounded-xl border border-border bg-white p-3 text-xs">
          <p>Base: INR {pricingPreview.baseAmountInr}</p>
          <p>Discount: - INR {pricingPreview.discountAmountInr}</p>
          <p>Shipping: INR {pricingPreview.shippingAmountInr}</p>
          <p>Tax: INR {pricingPreview.taxAmountInr}</p>
          <p className="mt-1 font-semibold">Final payable: INR {pricingPreview.finalAmountInr}</p>
          {pricingBusy && <p className="mt-1 text-muted">Refreshing pricing...</p>}
          {pricingWarning && <p className="mt-1 text-danger">{pricingWarning}</p>}
        </div>
      </div>

      {product.noRefund && (
        <p className="mt-3 inline-flex rounded-full bg-danger/10 px-2 py-1 text-xs text-danger">
          No Refund Product
        </p>
      )}

      {error && (
        <div className="mt-3 rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}
      {info && (
        <div className="mt-3 rounded-2xl border border-brand/40 bg-brand/10 p-3 text-sm">
          {info}
        </div>
      )}

      {!user && (
        <p className="mt-3 text-sm text-muted">
          Please <Link href="/sign-in" className="text-brand underline">sign in</Link> to purchase.
        </p>
      )}

      <button
        type="button"
        disabled={busy || !user || !hasFirebaseConfig}
        onClick={async () => {
          if (!user) return;
          if (!hasFirebaseConfig) {
            setError("Firebase config missing in .env.local");
            return;
          }
          setBusy(true);
          setError(null);
          setInfo(null);
          try {
            if (paymentMethod === "wallet") {
              const orderId = await createOrderFromProduct(product.uniqueLinkSlug, {
                uid: user.uid,
                name: user.displayName ?? "Customer",
                email: user.email ?? "",
              }, selectedPlan.key, {
                couponCode: couponCode.trim() || undefined,
                shippingZoneId: shippingZoneId || undefined,
                checkoutCountry: checkoutCountry.trim() || undefined,
                checkoutCity: checkoutCity.trim() || undefined,
              });
              setInfo(`Order created: ${orderId}`);
              router.push(`/dashboard/orders/${orderId}`);
            } else {
              const idToken = await user.getIdToken();
              const response = await fetch("/api/payments/intents/create", {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                  purpose: "product_checkout",
                  ownerUid: user.uid,
                  ownerName: user.displayName ?? "Customer",
                  ownerEmail: user.email ?? "",
                  productSlug: product.uniqueLinkSlug,
                  pricingPlanKey: selectedPlan.key,
                  provider: gatewayProvider,
                  currency,
                  couponCode: couponCode.trim() || undefined,
                  shippingZoneId: shippingZoneId || undefined,
                  checkoutCountry: checkoutCountry.trim() || undefined,
                  checkoutCity: checkoutCity.trim() || undefined,
                }),
              });
              const payload = (await response.json()) as Record<string, unknown>;
              if (!response.ok || !payload.ok) {
                throw new Error(String(payload.error ?? "Unable to initialize payment."));
              }
              const intent = payload.intent as Record<string, unknown>;
              const paymentUrl = String(intent.paymentUrl ?? "").trim();
              if (!paymentUrl) {
                throw new Error("Payment URL is missing from gateway response.");
              }
              router.push(paymentUrl);
            }
          } catch (purchaseError) {
            setError(
              purchaseError instanceof Error
                ? purchaseError.message
                : "Unable to complete purchase right now.",
            );
          } finally {
            setBusy(false);
          }
        }}
        className="mt-5 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-70"
      >
        {busy
          ? "Processing..."
          : paymentMethod === "wallet"
            ? "Purchase now"
            : "Continue to gateway"}
      </button>
    </article>
  );
}
