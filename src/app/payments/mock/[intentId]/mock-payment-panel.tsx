"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { fetchPaymentIntentById, PaymentIntentRecord } from "@/lib/firebase/repositories";

export function MockPaymentPanel({ intentId }: { intentId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [intent, setIntent] = useState<PaymentIntentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

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
              : "Unable to load payment intent.",
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
      setError("Sign in first to confirm mock payment.");
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
          intentId,
        }),
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok || !payload.ok) {
        throw new Error(String(payload.error ?? "Unable to confirm payment."));
      }
      const result = payload.result as Record<string, unknown>;
      setInfo("Payment marked successful.");
      if (result.orderId) {
        router.push(`/dashboard/orders/${String(result.orderId)}`);
      } else {
        router.push("/dashboard/wallet");
      }
    } catch (confirmError) {
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : "Unable to confirm payment.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        Loading mock payment...
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
      <h1 className="text-2xl font-semibold tracking-tight">Mock Payment Gateway</h1>
      <p className="mt-2 text-sm text-muted">
        Intent {intent.id} | Purpose {intent.purpose.replaceAll("_", " ")}
      </p>
      <p className="mt-2 text-lg font-semibold">Amount INR {intent.amount}</p>
      <p className="mt-1 text-xs text-muted">Status {intent.status}</p>

      {info && (
        <div className="mt-3 rounded-xl border border-brand/40 bg-brand/10 p-3 text-sm">
          {info}
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <button
        type="button"
        disabled={busy || intent.status === "paid"}
        onClick={() => void confirmPayment()}
        className="mt-5 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
      >
        {busy ? "Processing..." : intent.status === "paid" ? "Already paid" : "Mark payment successful"}
      </button>
    </section>
  );
}
