"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { uploadEvidenceFiles } from "@/lib/firebase/storage";
import {
  createProductReview,
  customerResolveProductReview,
  fetchProductReviewsByProductId,
  ProductReviewRecord,
} from "@/lib/firebase/repositories";

export function ProductReviewsSection({
  productId,
  productTitle,
}: {
  productId: string;
  productTitle: string;
}) {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<ProductReviewRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [resolutionNoteByReview, setResolutionNoteByReview] = useState<Record<string, string>>(
    {},
  );

  const load = useCallback(async () => {
    if (!hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchProductReviewsByProductId(productId));
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load product reviews.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    if (!rows.length) return { average: 0, total: 0 };
    const total = rows.length;
    const average = rows.reduce((sum, row) => sum + row.rating, 0) / total;
    return { average, total };
  }, [rows]);

  async function submitReview(event: FormEvent) {
    event.preventDefault();
    if (!user) {
      setError("Sign in to submit review.");
      return;
    }
    if (!comment.trim()) {
      setError("Review comment is required.");
      return;
    }
    if (!files.length) {
      setError("Upload proof document(s) before submitting review.");
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const proofUrls = await uploadEvidenceFiles(`reviews/${productId}/${user.uid}`, files);
      await createProductReview({
        productId,
        customerUid: user.uid,
        customerName: user.displayName ?? "Customer",
        customerEmail: user.email ?? "",
        rating: Number(rating),
        comment: comment.trim(),
        proofUrls,
      });
      setInfo("Review submitted with proof.");
      setRating("5");
      setComment("");
      setFiles([]);
      await load();
    } catch (reviewError) {
      setError(
        reviewError instanceof Error ? reviewError.message : "Unable to submit review right now.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function markResolved(reviewId: string, satisfied: boolean) {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await customerResolveProductReview({
        reviewId,
        customerUid: user.uid,
        satisfied,
        resolutionNote: resolutionNoteByReview[reviewId] ?? "",
      });
      setInfo(
        satisfied
          ? "Resolution recorded. If this was a negative review, it is now hidden from public listing."
          : "Review kept active.",
      );
      await load();
    } catch (resolveError) {
      setError(
        resolveError instanceof Error
          ? resolveError.message
          : "Unable to update review resolution.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 space-y-4">
      <div className="glass rounded-3xl p-6">
        <h2 className="text-xl font-semibold tracking-tight">Reviews & Social Proof</h2>
        <p className="mt-2 text-sm text-muted">
          Average rating {stats.average.toFixed(1)} / 5 from {stats.total} public review(s).
        </p>
        <p className="mt-1 text-xs text-muted">
          Proof of purchase is mandatory. Only verified buyers can post reviews.
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

      {user && hasFirebaseConfig && (
        <form onSubmit={submitReview} className="glass rounded-3xl p-6">
          <h3 className="text-lg font-semibold tracking-tight">Write review</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <select
              value={rating}
              onChange={(event) => setRating(event.target.value)}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
            >
              <option value="5">5 - Excellent</option>
              <option value="4">4 - Good</option>
              <option value="3">3 - Average</option>
              <option value="2">2 - Poor</option>
              <option value="1">1 - Very Poor</option>
            </select>
            <input
              type="file"
              multiple
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-3 file:py-1 file:text-xs file:font-medium file:text-brand-strong"
            />
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={3}
              placeholder={`Share your genuine experience with ${productTitle}`}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none md:col-span-2"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
          >
            Submit review
          </button>
        </form>
      )}

      {loading && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          Loading reviews...
        </div>
      )}

      {!loading &&
        rows.map((row) => (
          <article key={row.id} className="glass rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">
                {row.customerName} | {row.rating}/5
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

            {user?.uid === row.customerUid && row.businessReply && row.rating <= 2 && (
              <div className="mt-3 space-y-2">
                <textarea
                  rows={2}
                  placeholder="Resolution note (optional)"
                  value={resolutionNoteByReview[row.id] ?? ""}
                  onChange={(event) =>
                    setResolutionNoteByReview((prev) => ({
                      ...prev,
                      [row.id]: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void markResolved(row.id, true)}
                    className="rounded-xl border border-border px-3 py-2 text-xs transition hover:border-brand/40 disabled:opacity-70"
                  >
                    Issue fixed, hide negative review
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void markResolved(row.id, false)}
                    className="rounded-xl border border-danger/40 px-3 py-2 text-xs text-danger transition hover:bg-danger/10 disabled:opacity-70"
                  >
                    Keep review active
                  </button>
                </div>
              </div>
            )}
          </article>
        ))}
    </section>
  );
}
