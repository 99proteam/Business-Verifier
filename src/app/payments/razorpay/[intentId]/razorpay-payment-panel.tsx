"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { fetchPaymentIntentById, PaymentIntentRecord } from "@/lib/firebase/repositories";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, callback: (response: Record<string, unknown>) => void) => void;
    };
  }
}

function loadRazorpayScript() {
  return new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-razorpay='checkout']");
    if (existing) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpay = "checkout";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function RazorpayPaymentPanel({ intentId }: { intentId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [intent, setIntent] = useState<PaymentIntentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const razorpayKey = useMemo(
    () => process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim() || "",
    [],
  );

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const row = await fetchPaymentIntentById(intentId);
        if (mounted) setIntent(row);
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load payment intent.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [intentId]);

  async function startCheckout() {
    if (!intent) return;
    if (!razorpayKey) {
      setError("NEXT_PUBLIC_RAZORPAY_KEY_ID is missing.");
      return;
    }
    if (!intent.providerOrderId) {
      setError("Provider order id missing. Recreate payment intent and try again.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);

    const loaded = await loadRazorpayScript();
    if (!loaded || !window.Razorpay) {
      setBusy(false);
      setError("Unable to load Razorpay checkout script.");
      return;
    }

    const instance = new window.Razorpay({
      key: razorpayKey,
      amount: Math.round(intent.amount * 100),
      currency: intent.currency,
      name: "Business Verifier",
      description:
        intent.purpose === "wallet_topup"
          ? "Wallet top-up payment"
          : `Product checkout: ${intent.productSlug ?? "product"}`,
      order_id: intent.providerOrderId,
      prefill: {
        name: intent.ownerName,
        email: intent.ownerEmail,
      },
      notes: {
        intentId: intent.id,
        purpose: intent.purpose,
      },
      handler: async (response: Record<string, unknown>) => {
        try {
          const idToken = await user?.getIdToken();
          if (!idToken) {
            throw new Error("Authentication token missing. Please sign in again.");
          }
          const confirm = await fetch("/api/payments/intents/confirm", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              intentId: intent.id,
              providerPaymentId: String(response.razorpay_payment_id ?? ""),
              providerOrderId: String(response.razorpay_order_id ?? ""),
              providerSignature: String(response.razorpay_signature ?? ""),
            }),
          });
          const payload = (await confirm.json()) as Record<string, unknown>;
          if (!confirm.ok || !payload.ok) {
            throw new Error(String(payload.error ?? "Unable to confirm payment."));
          }
          const result = payload.result as Record<string, unknown>;
          setInfo("Payment successful.");
          if (result.orderId) {
            router.push(`/dashboard/orders/${String(result.orderId)}`);
          } else {
            router.push("/dashboard/wallet");
          }
        } catch (confirmError) {
          setError(confirmError instanceof Error ? confirmError.message : "Unable to confirm payment.");
        } finally {
          setBusy(false);
        }
      },
      modal: {
        ondismiss: () => {
          setBusy(false);
          setInfo("Checkout closed.");
        },
      },
    });

    instance.on("payment.failed", (response) => {
      setBusy(false);
      const failure = response as { error?: { description?: string } };
      const desc = String(failure.error?.description ?? "Payment failed.");
      setError(desc);
    });
    instance.open();
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        Loading Razorpay checkout...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        {error}
      </div>
    );
  }

  if (!intent) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        Payment intent not found.
      </div>
    );
  }

  return (
    <section className="glass mx-auto max-w-lg rounded-3xl p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Razorpay Checkout</h1>
      <p className="mt-2 text-sm text-muted">
        Intent {intent.id} | Purpose {intent.purpose.replaceAll("_", " ")}
      </p>
      <p className="mt-2 text-lg font-semibold">
        Amount {intent.currency} {intent.amount}
      </p>
      <p className="mt-1 text-xs text-muted">Order {intent.providerOrderId || "pending"}</p>

      {info && (
        <div className="mt-3 rounded-xl border border-brand/40 bg-brand/10 p-3 text-sm">{info}</div>
      )}
      {error && (
        <div className="mt-3 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <button
        type="button"
        disabled={busy || intent.status === "paid"}
        onClick={() => void startCheckout()}
        className="mt-5 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
      >
        {busy ? "Opening checkout..." : intent.status === "paid" ? "Already paid" : "Pay with Razorpay"}
      </button>
    </section>
  );
}
