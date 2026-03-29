"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { createOrderFromProduct, DigitalProductRecord } from "@/lib/firebase/repositories";

export function CheckoutPanel({ product }: { product: DigitalProductRecord }) {
  const { user, hasFirebaseConfig } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"wallet" | "gateway">("wallet");

  const canRefund = !product.noRefund;

  return (
    <article className="glass rounded-3xl p-6">
      <h1 className="text-3xl font-semibold tracking-tight">Checkout</h1>
      <p className="mt-2 text-sm text-muted">
        Product: <b>{product.title}</b> by {product.ownerName}
      </p>
      <p className="mt-3 text-2xl font-semibold">INR {product.price}</p>

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
              });
              setInfo(`Order created: ${orderId}`);
              router.push(`/dashboard/orders/${orderId}`);
            } else {
              const response = await fetch("/api/payments/intents/create", {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                },
                body: JSON.stringify({
                  purpose: "product_checkout",
                  ownerUid: user.uid,
                  ownerName: user.displayName ?? "Customer",
                  ownerEmail: user.email ?? "",
                  productSlug: product.uniqueLinkSlug,
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
