"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  EmployeePerformanceReviewRecord,
  EmployeeAssignmentRecord,
  fetchEmployeeAssignments,
  fetchEmployeePerformanceForEmployee,
} from "@/lib/firebase/repositories";

export function EmployeeAssignmentsDashboard() {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<EmployeeAssignmentRecord[]>([]);
  const [reviews, setReviews] = useState<EmployeePerformanceReviewRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [assignmentRows, reviewRows] = await Promise.all([
        fetchEmployeeAssignments(user.uid),
        fetchEmployeePerformanceForEmployee(user.uid),
      ]);
      setRows(assignmentRows);
      setReviews(reviewRows);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load assignments.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, user]);

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
        Loading employment assignments...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">My employment assignments</h1>
        <p className="mt-2 text-sm text-muted">
          Businesses that assigned your account as employee and your current role title.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {!rows.length && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          No employment assignments found yet.
        </div>
      )}

      {rows.map((row) => (
        <article key={row.businessId} className="glass rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{row.businessName}</h2>
            <span className="rounded-full bg-brand/10 px-2 py-1 text-xs text-brand-strong">
              {row.title}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">Owner: {row.ownerName}</p>
          <p className="mt-1 text-xs text-muted">
            Assigned on {new Date(row.assignedAt).toLocaleString()}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/dashboard/tickets"
              className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40"
            >
              Open tickets
            </Link>
            <Link
              href="/dashboard/notifications"
              className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40"
            >
              Open notifications
            </Link>
          </div>
        </article>
      ))}

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">My performance reviews</h2>
        <div className="mt-4 space-y-3">
          {!reviews.length && (
            <p className="rounded-2xl border border-border bg-surface p-3 text-sm text-muted">
              No performance reviews yet.
            </p>
          )}
          {reviews.map((review) => (
            <article key={review.id} className="rounded-2xl border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {review.businessName} | {review.monthKey}
                </p>
                <span className="rounded-full border border-border px-2 py-1 text-xs">
                  Rating {review.rating}/5
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Tickets handled {review.ticketsHandled} | resolved {review.ticketsResolved} |
                customer score {review.customerSatisfactionScore}/10
              </p>
              {review.note && <p className="mt-1 text-xs text-muted">{review.note}</p>}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
