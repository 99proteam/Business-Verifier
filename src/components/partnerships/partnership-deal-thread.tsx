"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  cancelPartnershipDeal,
  completePartnershipDeal,
  fetchCurrentUserIdentityProfile,
  fetchPartnershipDealById,
  fetchPartnershipIdentityStatus,
  fetchPartnershipMessages,
  PartnershipDealRecord,
  PartnershipMessageRecord,
  proposePartnershipAgreement,
  sendPartnershipMessage,
} from "@/lib/firebase/repositories";

export function PartnershipDealThread({
  dealId,
  adminMode = false,
}: {
  dealId: string;
  adminMode?: boolean;
}) {
  const { user, hasFirebaseConfig } = useAuth();
  const [deal, setDeal] = useState<PartnershipDealRecord | null>(null);
  const [messages, setMessages] = useState<PartnershipMessageRecord[]>([]);
  const [identityStatus, setIdentityStatus] = useState<{
    ownerUid: string;
    ownerVerified: boolean;
    initiatorUid: string;
    initiatorVerified: boolean;
  } | null>(null);
  const [currentUserVerified, setCurrentUserVerified] = useState<boolean>(false);
  const [draft, setDraft] = useState("");
  const [agreedAmount, setAgreedAmount] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const isParticipant = useMemo(() => {
    if (!deal || !user) return false;
    return deal.participantUids.includes(user.uid);
  }, [deal, user]);

  const senderRole = useMemo(() => {
    if (!deal || !user) return "initiator" as const;
    if (adminMode) return "admin" as const;
    return user.uid === deal.listingOwnerUid ? ("owner" as const) : ("initiator" as const);
  }, [adminMode, deal, user]);

  const canMessage = useMemo(() => {
    if (!deal || !user) return false;
    if (adminMode) return true;
    const canUseStatus = deal.status === "open" || deal.status === "agreement_reached";
    const identityReady =
      Boolean(identityStatus?.ownerVerified) && Boolean(identityStatus?.initiatorVerified);
    return canUseStatus && isParticipant && identityReady;
  }, [adminMode, deal, identityStatus, isParticipant, user]);

  const load = useCallback(async () => {
    if (!hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [dealRow, messageRows, status] = await Promise.all([
        fetchPartnershipDealById(dealId),
        fetchPartnershipMessages(dealId),
        fetchPartnershipIdentityStatus(dealId),
      ]);
      setDeal(dealRow);
      setMessages(messageRows);
      setIdentityStatus(status);
      if (user) {
        const profile = await fetchCurrentUserIdentityProfile(user.uid);
        setCurrentUserVerified(profile.isIdentityVerified);
      } else {
        setCurrentUserVerified(false);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load partnership thread.",
      );
    } finally {
      setLoading(false);
    }
  }, [dealId, hasFirebaseConfig, user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSend(event: FormEvent) {
    event.preventDefault();
    if (!user || !deal || !draft.trim()) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await sendPartnershipMessage({
        dealId,
        senderUid: user.uid,
        senderName: user.displayName ?? "User",
        senderRole,
        text: draft.trim(),
        adminMode,
      });
      setDraft("");
      await load();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send message.");
    } finally {
      setBusy(false);
    }
  }

  async function onSetAgreement(event: FormEvent) {
    event.preventDefault();
    if (!user || !deal) return;
    const amount = Number(agreedAmount);
    if (amount <= 0) {
      setError("Agreement amount must be greater than zero.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await proposePartnershipAgreement({
        dealId,
        actorUid: user.uid,
        actorName: user.displayName ?? "User",
        agreedAmount: amount,
      });
      setInfo(`Agreement updated. Platform fee preview: INR ${result.platformFeeAmount}.`);
      await load();
    } catch (agreementError) {
      setError(
        agreementError instanceof Error
          ? agreementError.message
          : "Unable to set agreement amount.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onComplete() {
    if (!user || !deal) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await completePartnershipDeal({
        dealId,
        actorUid: user.uid,
        actorName: user.displayName ?? "User",
      });
      setInfo(`Deal completed. Platform fee debited: INR ${result.feeAmount}.`);
      await load();
    } catch (completeError) {
      setError(
        completeError instanceof Error
          ? completeError.message
          : "Unable to complete deal right now.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onCancel() {
    if (!user || !deal) return;
    if (!cancelReason.trim()) {
      setError("Cancellation reason is required.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await cancelPartnershipDeal({
        dealId,
        actorUid: user.uid,
        actorName: user.displayName ?? "User",
        reason: cancelReason,
        adminMode,
      });
      setInfo("Deal cancelled.");
      setCancelReason("");
      await load();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Unable to cancel deal.");
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
        Loading partnership deal...
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        Partnership deal not found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">{deal.listingBusinessName}</h1>
        <p className="mt-2 text-sm text-muted">
          Status {deal.status} | Fee {deal.platformFeePercent}% | Fee status {deal.feeStatus}
        </p>
        <p className="mt-1 text-xs text-muted">
          Range INR {deal.partnershipAmountMin ?? 0} - INR {deal.partnershipAmountMax ?? 0} |
          Agreed INR {deal.agreedAmount ?? 0}
        </p>
        {identityStatus && (
          <p className="mt-2 text-xs text-muted">
            Identity check: owner {identityStatus.ownerVerified ? "verified" : "pending"} |
            initiator {identityStatus.initiatorVerified ? "verified" : "pending"}
          </p>
        )}
        {!adminMode && user && !currentUserVerified && (
          <p className="mt-3 rounded-xl border border-amber-400/40 bg-amber-100 p-3 text-xs text-amber-800">
            Your identity is not verified yet. Partnership chat and agreement actions are blocked.
          </p>
        )}
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
        <h2 className="text-lg font-semibold tracking-tight">Chat</h2>
        <div className="mt-4 space-y-2">
          {!messages.length && <p className="text-sm text-muted">No messages yet.</p>}
          {messages.map((message) => (
            <article key={message.id} className="rounded-2xl border border-border bg-surface p-3">
              <p className="text-xs text-muted">
                {message.senderName} | {message.senderRole} |{" "}
                {new Date(message.createdAt).toLocaleString()}
              </p>
              <p className="mt-1 text-sm">{message.text}</p>
            </article>
          ))}
        </div>
      </section>

      {!adminMode && isParticipant && (deal.status === "open" || deal.status === "agreement_reached") && (
        <form onSubmit={onSetAgreement} className="glass rounded-3xl p-6">
          <h3 className="text-base font-semibold tracking-tight">Set agreement amount</h3>
          <p className="mt-1 text-xs text-muted">
            On completion, platform fee of {deal.platformFeePercent}% is charged from listing
            business wallet.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={agreedAmount}
              onChange={(event) => setAgreedAmount(event.target.value)}
              type="number"
              placeholder="Agreed amount"
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={busy || !canMessage}
              className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
            >
              Save agreement
            </button>
            <button
              type="button"
              disabled={busy || deal.status !== "agreement_reached" || !canMessage}
              onClick={() => void onComplete()}
              className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
            >
              Mark completed + debit fee
            </button>
          </div>
        </form>
      )}

      {(isParticipant || adminMode) && deal.status !== "completed" && (
        <section className="glass rounded-3xl p-6">
          <h3 className="text-base font-semibold tracking-tight">Cancel deal</h3>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Reason"
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void onCancel()}
              className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
            >
              Cancel deal
            </button>
          </div>
        </section>
      )}

      <form onSubmit={onSend} className="glass rounded-3xl p-6">
        <h3 className="text-base font-semibold tracking-tight">Send message</h3>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          placeholder="Write your message..."
          className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim() || !canMessage}
          className="mt-3 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
        >
          Send
        </button>
        {!canMessage && (
          <p className="mt-2 text-xs text-muted">
            Chat is blocked until both participants are identity verified and deal is active.
          </p>
        )}
      </form>
    </div>
  );
}
