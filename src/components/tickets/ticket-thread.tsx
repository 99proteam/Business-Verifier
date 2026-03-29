"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  addSupportTicketMessage,
  adminFinalizeSupportTicket,
  closeSupportTicket,
  escalateSupportTicketToAdmin,
  fetchSupportTicketById,
  fetchSupportTicketMessages,
  reopenSupportTicket,
  SupportTicketRecord,
  TicketMessageRecord,
} from "@/lib/firebase/repositories";
import { uploadEvidenceFiles } from "@/lib/firebase/storage";
import { TicketStatusPill } from "@/components/tickets/ticket-status-pill";

type TicketThreadProps = {
  ticketId: string;
  adminMode?: boolean;
};

const CLOSED_STATES = new Set(["resolved", "refunded", "closed"]);

export function TicketThread({ ticketId, adminMode = false }: TicketThreadProps) {
  const { user, hasFirebaseConfig } = useAuth();
  const [ticket, setTicket] = useState<SupportTicketRecord | null>(null);
  const [messages, setMessages] = useState<TicketMessageRecord[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [resolutionReason, setResolutionReason] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canSendMessage = useMemo(() => {
    if (!ticket) return false;
    return !CLOSED_STATES.has(ticket.status);
  }, [ticket]);

  const loadData = useCallback(async () => {
    if (!hasFirebaseConfig) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [ticketData, ticketMessages] = await Promise.all([
        fetchSupportTicketById(ticketId),
        fetchSupportTicketMessages(ticketId),
      ]);
      setTicket(ticketData);
      setMessages(ticketMessages);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load ticket thread.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, ticketId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleSendMessage(event: FormEvent) {
    event.preventDefault();
    if (!user || !messageDraft.trim()) return;

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const attachments =
        files.length > 0
          ? await uploadEvidenceFiles(`ticket-messages/${ticketId}/${user.uid}`, files)
          : [];

      await addSupportTicketMessage(ticketId, {
        senderUid: user.uid,
        senderName: user.displayName ?? "User",
        senderRole: adminMode ? "admin" : "customer",
        text: messageDraft.trim(),
        attachments,
      });
      setMessageDraft("");
      setFiles([]);
      setInfo("Message sent.");
      await loadData();
    } catch (sendError) {
      setError(
        sendError instanceof Error ? sendError.message : "Unable to send message right now.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function requestAdminIntervention() {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await escalateSupportTicketToAdmin(
        ticketId,
        user.uid,
        user.displayName ?? "User",
      );
      setInfo("Admin intervention requested.");
      await loadData();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to escalate ticket right now.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function finalizeByAdmin(action: "resolved" | "refunded") {
    if (!user || !resolutionReason.trim()) {
      setError("Resolution reason is required.");
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await adminFinalizeSupportTicket(ticketId, user.uid, user.displayName ?? "Admin", {
        action,
        reason: resolutionReason.trim(),
      });
      setResolutionReason("");
      setInfo(action === "refunded" ? "Refund decision posted." : "Ticket resolved.");
      await loadData();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to finalize ticket right now.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function reopenTicket() {
    if (!user || !reopenReason.trim()) {
      setError("Reopen reason is required.");
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await reopenSupportTicket(
        ticketId,
        user.uid,
        user.displayName ?? "User",
        reopenReason.trim(),
      );
      setReopenReason("");
      setInfo("Ticket reopened.");
      await loadData();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to reopen ticket right now.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function closeTicket() {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await closeSupportTicket(ticketId, user.uid, user.displayName ?? "User");
      setInfo("Ticket closed.");
      await loadData();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to close ticket right now.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!hasFirebaseConfig) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        Firebase environment variables are missing in `.env.local`.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        Loading ticket thread...
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        Ticket not found.
      </div>
    );
  }

  if (!adminMode && user && !ticket.participantUids.includes(user.uid)) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        Access denied for this ticket.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted">Ticket ID: {ticket.id}</p>
            <h1 className="text-2xl font-semibold tracking-tight">{ticket.title}</h1>
          </div>
          <TicketStatusPill status={ticket.status} />
        </div>

        <p className="mt-2 text-sm text-muted">
          {ticket.businessName} • Priority {ticket.priority}
        </p>
        <p className="mt-2 text-sm">{ticket.description}</p>

        {!!ticket.evidenceUrls.length && (
          <div className="mt-4 flex flex-wrap gap-2">
            {ticket.evidenceUrls.map((url, index) => (
              <Link
                key={`${url}-${index}`}
                href={url}
                target="_blank"
                className="rounded-xl border border-border px-3 py-1 text-xs transition hover:border-brand/40"
              >
                Evidence {index + 1}
              </Link>
            ))}
          </div>
        )}
      </div>

      {info && (
        <div className="rounded-2xl border border-brand/40 bg-brand/10 p-3 text-sm">
          {info}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <section className="glass rounded-3xl p-5">
        <h2 className="text-lg font-semibold tracking-tight">Conversation</h2>
        <div className="mt-4 space-y-3">
          {messages.map((message) => (
            <article key={message.id} className="rounded-2xl border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <p>
                  {message.senderName} • {message.senderRole}
                </p>
                <p>{new Date(message.createdAt).toLocaleString()}</p>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{message.text}</p>
              {!!message.attachments.length && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {message.attachments.map((url, idx) => (
                    <Link
                      key={`${url}-${idx}`}
                      href={url}
                      target="_blank"
                      className="rounded-lg border border-border px-2 py-1 text-xs"
                    >
                      Attachment {idx + 1}
                    </Link>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      {canSendMessage && (
        <form onSubmit={handleSendMessage} className="glass rounded-3xl p-5">
          <h3 className="text-base font-semibold tracking-tight">Send message</h3>
          <textarea
            value={messageDraft}
            onChange={(event) => setMessageDraft(event.target.value)}
            rows={4}
            className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
            placeholder="Share update, proof, or proposed resolution..."
          />
          <input
            type="file"
            multiple
            className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />
          <button
            type="submit"
            disabled={busy || !messageDraft.trim()}
            className="mt-3 rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-70"
          >
            {busy ? "Sending..." : "Send message"}
          </button>
        </form>
      )}

      {!adminMode && ticket.status !== "awaiting_admin" && !CLOSED_STATES.has(ticket.status) && (
        <div className="glass rounded-2xl p-5">
          <h3 className="text-base font-semibold tracking-tight">Need admin help?</h3>
          <p className="mt-1 text-sm text-muted">
            If customer and business cannot resolve this issue, involve admin to decide next steps.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={requestAdminIntervention}
            className="mt-3 rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
          >
            Involve admin
          </button>
        </div>
      )}

      {adminMode && (
        <div className="glass rounded-2xl p-5">
          <h3 className="text-base font-semibold tracking-tight">Admin resolution</h3>
          <textarea
            value={resolutionReason}
            onChange={(event) => setResolutionReason(event.target.value)}
            rows={3}
            className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
            placeholder="Add decision reason..."
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void finalizeByAdmin("resolved")}
              className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
            >
              Mark resolved
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void finalizeByAdmin("refunded")}
              className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
            >
              Approve refund
            </button>
          </div>
        </div>
      )}

      {CLOSED_STATES.has(ticket.status) && (
        <div className="glass rounded-2xl p-5">
          <h3 className="text-base font-semibold tracking-tight">Ticket follow-up</h3>
          <p className="mt-1 text-sm text-muted">
            This ticket is closed/resolved. You can reopen with reason if issue returns.
          </p>
          <textarea
            value={reopenReason}
            onChange={(event) => setReopenReason(event.target.value)}
            rows={3}
            className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
            placeholder="Reason for reopening..."
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void reopenTicket()}
              className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
            >
              Reopen ticket
            </button>
            {!adminMode && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void closeTicket()}
                className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
              >
                Keep closed
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
