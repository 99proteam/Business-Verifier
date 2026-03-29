"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  fetchMembershipEconomicsSettings,
  fetchVerifierCustomerMembership,
  fetchVerifierMembershipPurchasesByCustomer,
  fetchWallet,
  MembershipEconomicsSettings,
  purchaseVerifierCustomerMembership,
  VerifierCustomerMembershipRecord,
  VerifierMembershipPurchaseRecord,
  WalletRecord,
} from "@/lib/firebase/repositories";

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function CustomerMembershipDashboard() {
  const { user, hasFirebaseConfig } = useAuth();
  const [membership, setMembership] = useState<VerifierCustomerMembershipRecord | null>(null);
  const [purchases, setPurchases] = useState<VerifierMembershipPurchaseRecord[]>([]);
  const [wallet, setWallet] = useState<WalletRecord | null>(null);
  const [settings, setSettings] = useState<MembershipEconomicsSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [membershipRow, purchaseRows, walletRow, settingRow] = await Promise.all([
        fetchVerifierCustomerMembership(user.uid),
        fetchVerifierMembershipPurchasesByCustomer(user.uid),
        fetchWallet(user.uid),
        fetchMembershipEconomicsSettings(),
      ]);
      setMembership(membershipRow);
      setPurchases(purchaseRows);
      setWallet(walletRow);
      setSettings(settingRow);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load membership dashboard.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function purchase(billingCycle: "monthly" | "yearly") {
    if (!user || !settings) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await purchaseVerifierCustomerMembership({
        customerUid: user.uid,
        customerName: user.displayName ?? "Customer",
        customerEmail: user.email ?? "",
        billingCycle,
      });
      setInfo(
        `Membership ${billingCycle} plan activated. Valid until ${new Date(
          result.activeUntil,
        ).toLocaleString()}.`,
      );
      await load();
    } catch (purchaseError) {
      setError(
        purchaseError instanceof Error
          ? purchaseError.message
          : "Unable to purchase membership right now.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!hasFirebaseConfig) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        Firebase config missing in `.env.local`.
      </div>
    );
  }

  if (loading || !settings) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        Loading customer membership...
      </div>
    );
  }

  const monthlyAmount = settings.customerMonthlyPrice;
  const yearlyAmount = settings.customerYearlyPrice;
  const monthlySavings = monthlyAmount * 12 - yearlyAmount;

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Verifier Customer Membership</h1>
        <p className="mt-2 text-sm text-muted">
          Unlock guaranteed discount benefits on participating businesses and priority trust support.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Minimum discount</p>
            <p className="mt-1 text-xl font-semibold">{settings.minimumDiscountPercent}%</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Membership status</p>
            <p className="mt-1 text-sm font-medium capitalize">
              {membership?.status ?? "not active"}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Wallet balance</p>
            <p className="mt-1 text-sm font-medium">{formatINR(wallet?.balance ?? 0)}</p>
          </div>
        </div>
      </div>

      {info && (
        <div className="rounded-2xl border border-brand/40 bg-brand/10 p-3 text-sm">{info}</div>
      )}
      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <article className="glass rounded-3xl p-6">
          <h2 className="text-lg font-semibold tracking-tight">Monthly plan</h2>
          <p className="mt-2 text-sm text-muted">
            Best if you want flexibility for short-term usage.
          </p>
          <p className="mt-4 text-2xl font-semibold">{formatINR(monthlyAmount)}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void purchase("monthly")}
            className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
          >
            Buy monthly
          </button>
        </article>

        <article className="glass rounded-3xl p-6">
          <h2 className="text-lg font-semibold tracking-tight">Yearly plan</h2>
          <p className="mt-2 text-sm text-muted">
            Better value for long-term buyers. Save {formatINR(monthlySavings)} yearly.
          </p>
          <p className="mt-4 text-2xl font-semibold">{formatINR(yearlyAmount)}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void purchase("yearly")}
            className="mt-4 rounded-xl border border-border px-4 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
          >
            Buy yearly
          </button>
        </article>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Membership identity</h2>
        {membership ? (
          <div className="mt-3 space-y-2 text-sm">
            <p>Member code: {membership.memberCode}</p>
            <p>Public ID: {membership.customerPublicId}</p>
            <p>Valid until: {new Date(membership.activeUntil).toLocaleString()}</p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">
            No active membership yet. Purchase a plan to get your member identity.
          </p>
        )}
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Purchase history</h2>
        <div className="mt-3 space-y-2">
          {!purchases.length && <p className="text-sm text-muted">No purchases yet.</p>}
          {purchases.map((row) => (
            <article key={row.id} className="rounded-2xl border border-border bg-surface p-3">
              <p className="text-sm font-medium">
                {row.billingCycle} | {formatINR(row.amount)}
              </p>
              <p className="text-xs text-muted">
                Starts {new Date(row.startsAt).toLocaleString()} | Valid till{" "}
                {new Date(row.activeUntil).toLocaleString()}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
