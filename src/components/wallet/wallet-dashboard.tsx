"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  createWithdrawalRequest,
  fetchWithdrawalComplianceSchema,
  fetchPaymentIntentsByOwner,
  fetchWallet,
  fetchWalletTransactions,
  fetchWithdrawalRequestsByUser,
  fetchWithdrawalSettings,
  topUpWallet,
  PaymentIntentRecord,
  WithdrawalComplianceSchema,
  WalletRecord,
  WalletTransactionRecord,
  WithdrawalRequestRecord,
} from "@/lib/firebase/repositories";

export function WalletDashboard() {
  const { user, hasFirebaseConfig } = useAuth();
  const [wallet, setWallet] = useState<WalletRecord | null>(null);
  const [transactions, setTransactions] = useState<WalletTransactionRecord[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequestRecord[]>([]);
  const [paymentIntents, setPaymentIntents] = useState<PaymentIntentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [topupAmount, setTopupAmount] = useState("500");
  const [withdrawAmount, setWithdrawAmount] = useState("1000");
  const [country, setCountry] = useState("India");
  const [method, setMethod] = useState("Bank Transfer");
  const [schema, setSchema] = useState<WithdrawalComplianceSchema>(() =>
    fetchWithdrawalComplianceSchema("India"),
  );
  const [accountDetails, setAccountDetails] = useState<Record<string, string>>({});
  const [withdrawFeePercent, setWithdrawFeePercent] = useState(2);
  const [withdrawFlatFee, setWithdrawFlatFee] = useState(10);

  const load = useCallback(async () => {
    if (!user || !hasFirebaseConfig) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [walletData, txRows, withdrawalRows, paymentRows, settings] = await Promise.all([
        fetchWallet(user.uid),
        fetchWalletTransactions(user.uid),
        fetchWithdrawalRequestsByUser(user.uid),
        fetchPaymentIntentsByOwner(user.uid),
        fetchWithdrawalSettings(),
      ]);
      setWallet(walletData);
      setTransactions(txRows);
      setWithdrawals(withdrawalRows);
      setPaymentIntents(paymentRows);
      setWithdrawFeePercent(settings.withdrawalFeePercent);
      setWithdrawFlatFee(settings.withdrawalFlatFee);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load wallet dashboard.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const nextSchema = fetchWithdrawalComplianceSchema(country);
    setSchema(nextSchema);
    if (!nextSchema.methods.includes(method)) {
      setMethod(nextSchema.methods[0] ?? "Bank Transfer");
    }
  }, [country, method]);

  async function handleTopup() {
    if (!user) return;
    const amount = Number(topupAmount);
    if (amount <= 0) {
      setError("Top-up amount must be greater than zero.");
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await topUpWallet(user.uid, amount);
      setInfo("Wallet top-up successful.");
      await load();
    } catch (topupError) {
      setError(
        topupError instanceof Error
          ? topupError.message
          : "Unable to top up wallet right now.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleGatewayTopup() {
    if (!user) return;
    const amount = Number(topupAmount);
    if (amount <= 0) {
      setError("Top-up amount must be greater than zero.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/payments/intents/create", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          purpose: "wallet_topup",
          ownerUid: user.uid,
          ownerName: user.displayName ?? "User",
          ownerEmail: user.email ?? "",
          amount,
        }),
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok || !payload.ok) {
        throw new Error(String(payload.error ?? "Unable to initiate top-up payment."));
      }
      const intent = payload.intent as Record<string, unknown>;
      const paymentUrl = String(intent.paymentUrl ?? "").trim();
      if (!paymentUrl) {
        throw new Error("Payment URL missing for top-up.");
      }
      window.location.href = paymentUrl;
    } catch (topupError) {
      setError(
        topupError instanceof Error
          ? topupError.message
          : "Unable to start gateway top-up.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleWithdrawal(event: FormEvent) {
    event.preventDefault();
    if (!user) return;

    const amount = Number(withdrawAmount);
    if (amount <= 0) {
      setError("Withdrawal amount must be greater than zero.");
      return;
    }

    const details = Object.fromEntries(
      Object.entries(accountDetails)
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => Boolean(value)),
    );

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const requestId = await createWithdrawalRequest({
        ownerUid: user.uid,
        ownerName: user.displayName ?? "User",
        ownerEmail: user.email ?? "",
        amount,
        country,
        method,
        accountDetails: details,
      });
      setInfo(`Withdrawal request created: ${requestId}`);
      setAccountDetails({});
      await load();
    } catch (withdrawError) {
      setError(
        withdrawError instanceof Error
          ? withdrawError.message
          : "Unable to submit withdrawal request.",
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

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        Loading wallet...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Wallet and Withdrawals</h1>
        <p className="mt-2 text-sm text-muted">
          Use wallet for purchases, receive refunds, and request withdrawals.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Available balance</p>
            <p className="mt-1 text-xl font-semibold">INR {wallet?.balance ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Locked for withdrawal</p>
            <p className="mt-1 text-xl font-semibold">INR {wallet?.lockedForWithdrawal ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Withdrawal fee config</p>
            <p className="mt-1 text-sm font-medium">
              {withdrawFeePercent}% + INR {withdrawFlatFee}
            </p>
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

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Top-up wallet</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={topupAmount}
            onChange={(event) => setTopupAmount(event.target.value)}
            type="number"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleTopup()}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
          >
            Instant credit (sandbox)
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleGatewayTopup()}
            className="rounded-xl border border-border px-4 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
          >
            Gateway top-up
          </button>
        </div>
      </section>

      <form onSubmit={handleWithdrawal} className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Request withdrawal</h2>
        <p className="mt-1 text-sm text-muted">
          Fill details based on your country and payout method.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            value={withdrawAmount}
            onChange={(event) => setWithdrawAmount(event.target.value)}
            type="number"
            placeholder="Amount (INR)"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            placeholder="Country"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <select
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          >
            {schema.methods.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          {(schema.fieldsByMethod[method] ?? []).map((field) => (
            <input
              key={field.key}
              value={accountDetails[field.key] ?? ""}
              onChange={(event) =>
                setAccountDetails((prev) => ({ ...prev, [field.key]: event.target.value }))
              }
              placeholder={`${field.label}${field.required ? " *" : ""}`}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
            />
          ))}
        </div>
        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
        >
          Submit withdrawal request
        </button>
      </form>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Withdrawal history</h2>
        <div className="mt-4 space-y-2">
          {!withdrawals.length && (
            <p className="text-sm text-muted">No withdrawal requests yet.</p>
          )}
          {withdrawals.map((row) => (
            <article key={row.id} className="rounded-2xl border border-border bg-surface p-3 text-sm">
              <p>
                Amount INR {row.amount} | Net INR {row.netAmount} | Status {row.status}
              </p>
              <p className="text-xs text-muted">
                {row.country} | {row.method} | {new Date(row.createdAt).toLocaleString()}
              </p>
              {row.declineReason && (
                <p className="text-xs text-danger">Declined reason: {row.declineReason}</p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Wallet transactions</h2>
        <div className="mt-4 space-y-2">
          {!transactions.length && (
            <p className="text-sm text-muted">No transactions yet.</p>
          )}
          {transactions.map((row) => (
            <article key={row.id} className="rounded-2xl border border-border bg-surface p-3 text-sm">
              <p>
                {row.type} | INR {row.amount}
              </p>
              <p className="text-xs text-muted">{row.reason}</p>
              <p className="text-xs text-muted">
                {new Date(row.createdAt).toLocaleString()}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Payment intents</h2>
        <div className="mt-4 space-y-2">
          {!paymentIntents.length && (
            <p className="text-sm text-muted">No gateway payments yet.</p>
          )}
          {paymentIntents.map((row) => (
            <article key={row.id} className="rounded-2xl border border-border bg-surface p-3 text-sm">
              <p>
                {row.purpose.replaceAll("_", " ")} | INR {row.amount} | {row.status}
              </p>
              <p className="text-xs text-muted">
                {row.provider} | {row.providerPaymentId ?? "No payment ref"} |{" "}
                {new Date(row.createdAt).toLocaleString()}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
