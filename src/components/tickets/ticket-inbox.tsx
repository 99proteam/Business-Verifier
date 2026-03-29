"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  fetchSupportTicketsByParticipant,
  SupportTicketRecord,
} from "@/lib/firebase/repositories";
import { TicketStatusPill } from "@/components/tickets/ticket-status-pill";

export function TicketInbox() {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<SupportTicketRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!user || !hasFirebaseConfig) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const tickets = await fetchSupportTicketsByParticipant(user.uid);
        setRows(tickets);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load tickets right now.",
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [hasFirebaseConfig, user]);

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Ticket Center</h1>
        <p className="mt-2 text-sm text-muted">
          Track all disputes and jump into ticket threads with proof history.
        </p>
        <Link
          href="/dashboard/tickets/new"
          className="mt-4 inline-flex rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
        >
          Create new ticket
        </Link>
      </div>

      {loading && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          Loading tickets...
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {!loading && !error && !rows.length && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          No tickets yet. Create one when you need support.
        </div>
      )}

      {rows.map((row) => (
        <article key={row.id} className="glass rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{row.title}</h2>
            <TicketStatusPill status={row.status} />
          </div>
          <p className="mt-2 text-sm text-muted">
            {row.businessName} • Priority: {row.priority}
          </p>
          <p className="mt-2 text-sm text-muted">
            Updated {new Date(row.updatedAt).toLocaleString()}
          </p>
          <Link
            href={`/dashboard/tickets/${row.id}`}
            className="mt-4 inline-flex rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40"
          >
            Open thread
          </Link>
        </article>
      ))}
    </div>
  );
}
