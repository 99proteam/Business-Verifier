"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  customerResolveProductReview,
  fetchProductReviewsByCustomer,
  ProductReviewRecord,
} from "@/lib/firebase/repositories";

export function CustomerReviewsDashboard() {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<ProductReviewRecord[]>([]);
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
      setRows(await fetchProductReviewsByCustomer(user.uid));
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load your reviews.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mark(reviewId: string, satisfied: boolean) {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await customerResolveProductReview({
        reviewId,
        customerUid: user.uid,
        satisfied,
      });
      setInfo(
        satisfied
          ? "Review marked satisfied. Negative resolved reviews are hidden publicly."
          : "Review kept active.",
      );
      await load();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to update review status.",
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
        Loading your reviews...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">My Reviews</h1>
        <p className="mt-2 text-sm text-muted">
          Track your posted reviews, business responses, and resolution visibility.
        </p>
      </div>

      {info && (
        <div className="rounded-2xl border border-brand/40 bg-brand/10 p-3 text-sm">{info}</div>
      )}
      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {!rows.length && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          You have not posted reviews yet.
        </div>
      )}

      {rows.map((row) => (
        <article key={row.id} className="glass rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">
              {row.productTitle} | {row.rating}/5
            </p>
            <span className="text-xs uppercase text-muted">{row.status}</span>
          </div>
          <p className="mt-2 text-sm">{row.comment}</p>
          <p className="mt-1 text-xs text-muted">
            {new Date(row.createdAt).toLocaleString()} | Proof files {row.proofUrls.length}
          </p>
          {row.businessReply && (
            <div className="mt-3 rounded-xl border border-border bg-surface p-3">
              <p className="text-xs font-medium">Business response</p>
              <p className="mt-1 text-sm">{row.businessReply}</p>
            </div>
          )}

          {row.businessReply && row.rating <= 2 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void mark(row.id, true)}
                className="rounded-xl border border-border px-3 py-2 text-xs transition hover:border-brand/40 disabled:opacity-70"
              >
                Mark issue fixed
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void mark(row.id, false)}
                className="rounded-xl border border-danger/40 px-3 py-2 text-xs text-danger transition hover:bg-danger/10 disabled:opacity-70"
              >
                Keep review active
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
