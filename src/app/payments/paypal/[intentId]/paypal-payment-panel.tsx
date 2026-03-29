"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { fetchPaymentIntentById, PaymentIntentRecord } from "@/lib/firebase/repositories";

export function PayPalPaymentPanel({ intentId }: { intentId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [intent, setIntent] = useState<PaymentIntentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const tokenOrderId = useMemo(() => {
    const token = String(searchParams.get("token") ?? "").trim();
    return token || "";
  }, [searchParams]);

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
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load PayPal payment intent.",
          );
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

  async function confirmPayment() {
    if (!user) {
      setError("Please sign in first.");
      return;
    }
    if (!intent) return;
    const providerOrderId = tokenOrderId || intent.providerOrderId || "";
    if (!providerOrderId) {
      setError("PayPal order id is missing. Please start checkout again.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/payments/intents/confirm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          intentId: intent.id,
          providerOrderId,
        }),
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok || !payload.ok) {
        throw new Error(String(payload.error ?? "Unable to confirm PayPal payment."));
      }
      const result = payload.result as Record<string, unknown>;
      setInfo("PayPal payment confirmed.");
      if (result.orderId) {
        router.push(`/dashboard/orders/${String(result.orderId)}`);
      } else {
        router.push("/dashboard/wallet");
      }
    } catch (confirmError) {
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : "Unable to confirm PayPal payment.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        Loading PayPal checkout...
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

  const approvalUrl = String(intent.metadata?.paypalApproveLink ?? "").trim();
  const wasCancelled = searchParams.get("cancelled") === "1";

  return (
    <section className="glass mx-auto max-w-lg rounded-3xl p-6">
      <h1 className="text-2xl font-semibold tracking-tight">PayPal Checkout</h1>
      <p className="mt-2 text-sm text-muted">
        Intent {intent.id} | Purpose {intent.purpose.replaceAll("_", " ")}
      </p>
      <p className="mt-2 text-lg font-semibold">
        Amount {intent.currency} {intent.amount}
      </p>
      <p className="mt-1 text-xs text-muted">Order {intent.providerOrderId || tokenOrderId || "pending"}</p>

      {wasCancelled ? (
        <div className="mt-3 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          PayPal checkout was cancelled. You can reopen checkout and continue.
        </div>
      ) : null}
      {info ? (
        <div className="mt-3 rounded-xl border border-brand/40 bg-brand/10 p-3 text-sm">{info}</div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={approvalUrl || "#"}
          target="_blank"
          rel="noreferrer"
          className={`rounded-xl px-4 py-2 text-sm font-medium text-white transition ${
            approvalUrl ? "bg-brand hover:bg-brand-strong" : "cursor-not-allowed bg-muted/70"
          }`}
        >
          Open PayPal
        </a>
        <button
          type="button"
          disabled={busy || intent.status === "paid"}
          onClick={() => void confirmPayment()}
          className="rounded-xl border border-border px-4 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
        >
          {busy ? "Confirming..." : intent.status === "paid" ? "Already paid" : "I completed payment"}
        </button>
      </div>
    </section>
  );
}
