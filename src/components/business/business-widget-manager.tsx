"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  BusinessTrustBadgeRecord,
  TrustBadgeWidgetSummaryRecord,
  fetchOwnedBusinessTrustBadge,
  fetchTrustBadgeWidgetSummaryByOwner,
} from "@/lib/firebase/repositories";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
}

export function BusinessWidgetManager() {
  const { user, hasFirebaseConfig } = useAuth();
  const [badge, setBadge] = useState<BusinessTrustBadgeRecord | null>(null);
  const [summary, setSummary] = useState<TrustBadgeWidgetSummaryRecord | null>(null);
  const [loading, setLoading] = useState(true);
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
      const [badgeRow, summaryRow] = await Promise.all([
        fetchOwnedBusinessTrustBadge(user.uid),
        fetchTrustBadgeWidgetSummaryByOwner(user.uid, 30),
      ]);
      setBadge(badgeRow);
      setSummary(summaryRow);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load widget manager.");
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const ctr = useMemo(() => {
    const clicks = summary?.totalClicks ?? 0;
    const impressions = summary?.totalImpressions ?? 0;
    if (impressions <= 0) return 0;
    return Number(((clicks / impressions) * 100).toFixed(2));
  }, [summary]);

  async function copyWidgetCode() {
    if (!badge?.trustBadgeCode) return;
    try {
      await navigator.clipboard.writeText(badge.trustBadgeCode);
      setInfo("Widget code copied.");
      setError(null);
    } catch {
      setError("Unable to copy widget code. Please copy manually.");
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
        Loading widget manager...
      </div>
    );
  }

  if (!badge) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        Approve your business verification first to enable trust badge widgets.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Widget manager</h1>
        <p className="mt-2 text-sm text-muted">
          Manage trust badge embed code and track widget impressions/clicks.
        </p>
      </section>

      {info && (
        <div className="rounded-2xl border border-brand/40 bg-brand/10 p-3 text-sm">{info}</div>
      )}
      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Trust badge widget code</h2>
        <p className="mt-1 text-xs text-muted">
          Paste this iframe on your website footer, checkout page, or product page.
        </p>
        <textarea
          value={badge.trustBadgeCode}
          readOnly
          rows={4}
          className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs outline-none"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copyWidgetCode()}
            className="rounded-xl bg-brand px-3 py-2 text-xs font-medium text-white transition hover:bg-brand-strong"
          >
            Copy widget code
          </button>
          <a
            href={`/trust-badge/${badge.businessId}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-border px-3 py-2 text-xs transition hover:border-brand/40"
          >
            Open live widget
          </a>
        </div>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Widget analytics</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <article className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Total impressions</p>
            <p className="mt-1 text-lg font-semibold">
              {formatNumber(summary?.totalImpressions ?? 0)}
            </p>
          </article>
          <article className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Total clicks</p>
            <p className="mt-1 text-lg font-semibold">{formatNumber(summary?.totalClicks ?? 0)}</p>
          </article>
          <article className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">CTR</p>
            <p className="mt-1 text-lg font-semibold">{ctr}%</p>
          </article>
        </div>
        <p className="mt-3 text-xs text-muted">
          Last event:{" "}
          {summary?.lastEventAt ? new Date(summary.lastEventAt).toLocaleString() : "No widget events yet."}
        </p>
        <div className="mt-4 space-y-2">
          {!summary?.daily.length && (
            <p className="rounded-2xl border border-border bg-surface p-3 text-xs text-muted">
              No daily widget stats yet.
            </p>
          )}
          {summary?.daily.map((row) => (
            <article
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-surface p-3 text-xs"
            >
              <p className="font-medium">{row.dateKey}</p>
              <p className="text-muted">
                Impressions {formatNumber(row.impressions)} | Clicks {formatNumber(row.clicks)}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
