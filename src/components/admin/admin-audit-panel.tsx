"use client";

import { useCallback, useEffect, useState } from "react";
import { AuditEventRecord, fetchAuditEvents } from "@/lib/firebase/repositories";
import { useAuth } from "@/components/providers/auth-provider";

export function AdminAuditPanel() {
  const { hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<AuditEventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchAuditEvents(300));
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load audit events.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig]);

  useEffect(() => {
    void load();
  }, [load]);

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
        Loading audit stream...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="glass rounded-3xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Unified audit stream</h1>
            <p className="mt-2 text-sm text-muted">
              Immutable timeline for sensitive actions across verification, refunds,
              deposits, wallet, and billing.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-border px-4 py-2 text-sm transition hover:border-brand/40"
          >
            Refresh
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <section className="space-y-3">
        {!rows.length && (
          <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
            No audit events found yet.
          </p>
        )}
        {rows.map((row) => (
          <article key={row.id} className="glass rounded-2xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{row.action.replaceAll("_", " ")}</p>
              <span className="rounded-full border border-border px-2 py-1 text-xs uppercase">
                {row.actorRole}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">{row.summary}</p>
            <p className="mt-1 text-xs text-muted">
              Actor {row.actorUid} | Target {row.targetType}:{row.targetId}
            </p>
            {row.metadata && Object.keys(row.metadata).length > 0 && (
              <pre className="mt-2 overflow-auto rounded-xl border border-border bg-surface p-2 text-[11px] text-muted">
                {JSON.stringify(row.metadata, null, 2)}
              </pre>
            )}
            <p className="mt-2 text-xs text-muted">
              {new Date(row.createdAt).toLocaleString()}
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}
