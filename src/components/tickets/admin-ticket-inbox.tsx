"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  fetchAdminSupportTickets,
  SupportTicketRecord,
} from "@/lib/firebase/repositories";
import { TicketStatusPill } from "@/components/tickets/ticket-status-pill";
import { useAuth } from "@/components/providers/auth-provider";

export function AdminTicketInbox() {
  const { hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<SupportTicketRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!hasFirebaseConfig) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const tickets = await fetchAdminSupportTickets();
        setRows(tickets);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load admin ticket queue.",
        );
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [hasFirebaseConfig]);

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Ticket Queue</h1>
        <p className="mt-2 text-sm text-muted">
          Review disputes, read chat history, and issue resolve/refund outcomes.
        </p>
      </div>

      {loading && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          Loading ticket queue...
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {!loading && !error && !rows.length && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          No tickets in queue.
        </div>
      )}

      {rows.map((row) => (
        <article key={row.id} className="glass rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{row.title}</h2>
            <TicketStatusPill status={row.status} />
          </div>
          <p className="mt-2 text-sm text-muted">
            Customer: {row.customerEmail || row.customerUid}
          </p>
          <p className="mt-1 text-sm text-muted">
            {row.businessName} • Escalations: {row.escalationCount} • Reopened:{" "}
            {row.reopenedCount}
          </p>
          <Link
            href={`/dashboard/admin/tickets/${row.id}`}
            className="mt-4 inline-flex rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
          >
            Open admin thread
          </Link>
        </article>
      ))}
    </div>
  );
}
