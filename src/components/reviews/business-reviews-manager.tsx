"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  businessRespondToProductReview,
  fetchProductReviewsByBusiness,
  ProductReviewRecord,
} from "@/lib/firebase/repositories";

export function BusinessReviewsManager() {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<ProductReviewRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [replyByReview, setReplyByReview] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!user || !hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchProductReviewsByBusiness(user.uid));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load reviews.");
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitReply(event: FormEvent, reviewId: string) {
    event.preventDefault();
    if (!user) return;
    const reply = replyByReview[reviewId]?.trim();
    if (!reply) {
      setError("Response text is required.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await businessRespondToProductReview({
        reviewId,
        businessOwnerUid: user.uid,
        responderName: user.displayName ?? "Business",
        reply,
      });
      setInfo("Business response posted.");
      setReplyByReview((prev) => ({ ...prev, [reviewId]: "" }));
      await load();
    } catch (replyError) {
      setError(
        replyError instanceof Error ? replyError.message : "Unable to post response.",
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
        Loading product reviews...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Business Review Responses</h1>
        <p className="mt-2 text-sm text-muted">
          Respond to customer feedback with proof-backed issue resolution.
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
          No reviews yet.
        </div>
      )}

      {rows.map((row) => (
        <article key={row.id} className="glass rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">
              {row.productTitle} | {row.customerName} | {row.rating}/5
            </p>
            <span className="text-xs uppercase text-muted">{row.status}</span>
          </div>
          <p className="mt-2 text-sm">{row.comment}</p>
          <p className="mt-1 text-xs text-muted">
            Proof files {row.proofUrls.length} | {new Date(row.createdAt).toLocaleString()}
          </p>
          {row.businessReply && (
            <div className="mt-3 rounded-xl border border-border bg-surface p-3">
              <p className="text-xs font-medium">Existing response</p>
              <p className="mt-1 text-sm">{row.businessReply}</p>
            </div>
          )}

          <form onSubmit={(event) => void submitReply(event, row.id)} className="mt-3 space-y-2">
            <textarea
              rows={3}
              value={replyByReview[row.id] ?? ""}
              onChange={(event) =>
                setReplyByReview((prev) => ({ ...prev, [row.id]: event.target.value }))
              }
              placeholder="Post your response/fix details..."
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl border border-border px-3 py-2 text-xs transition hover:border-brand/40 disabled:opacity-70"
            >
              Save response
            </button>
          </form>
        </article>
      ))}
    </div>
  );
}
