"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  BusinessEmployeeRecord,
  EmployeePerformanceReviewRecord,
  fetchBusinessEmployees,
  fetchEmployeePerformanceByBusinessOwner,
  submitEmployeePerformanceReview,
} from "@/lib/firebase/repositories";

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function EmployeePerformanceManager() {
  const { user, hasFirebaseConfig } = useAuth();
  const [employees, setEmployees] = useState<BusinessEmployeeRecord[]>([]);
  const [reviews, setReviews] = useState<EmployeePerformanceReviewRecord[]>([]);
  const [employeeUid, setEmployeeUid] = useState("");
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [rating, setRating] = useState("4");
  const [ticketsHandled, setTicketsHandled] = useState("0");
  const [ticketsResolved, setTicketsResolved] = useState("0");
  const [customerScore, setCustomerScore] = useState("8");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [employeeRows, reviewRows] = await Promise.all([
        fetchBusinessEmployees(user.uid),
        fetchEmployeePerformanceByBusinessOwner(user.uid),
      ]);
      setEmployees(employeeRows);
      setReviews(reviewRows);
      if (!employeeUid && employeeRows.length) {
        setEmployeeUid(employeeRows[0].employeeUid);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load performance module.",
      );
    } finally {
      setLoading(false);
    }
  }, [employeeUid, hasFirebaseConfig, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedEmployee = useMemo(
    () => employees.find((row) => row.employeeUid === employeeUid) ?? null,
    [employeeUid, employees],
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    if (!employeeUid) {
      setError("Select an employee first.");
      return;
    }
    setBusy(true);
    setInfo(null);
    setError(null);
    try {
      await submitEmployeePerformanceReview({
        ownerUid: user.uid,
        reviewerName: user.displayName ?? "Business",
        employeeUid,
        monthKey,
        rating: Number(rating),
        ticketsHandled: Number(ticketsHandled),
        ticketsResolved: Number(ticketsResolved),
        customerSatisfactionScore: Number(customerScore),
        note,
      });
      setInfo("Employee performance review saved.");
      setNote("");
      await load();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to save performance review.",
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
        Loading employee performance manager...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Employee performance</h1>
        <p className="mt-2 text-sm text-muted">
          Monthly review matrix for employees with ratings, ticket handling, and customer
          satisfaction score.
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

      <form onSubmit={onSubmit} className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Create or update review</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <select
            value={employeeUid}
            onChange={(event) => setEmployeeUid(event.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          >
            <option value="">Select employee</option>
            {employees.map((employee) => (
              <option key={employee.employeeUid} value={employee.employeeUid}>
                {employee.employeeName} ({employee.title})
              </option>
            ))}
          </select>
          <input
            type="month"
            value={monthKey}
            onChange={(event) => setMonthKey(event.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            type="number"
            value={rating}
            min={1}
            max={5}
            onChange={(event) => setRating(event.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
            placeholder="Rating (1-5)"
          />
          <input
            type="number"
            value={ticketsHandled}
            min={0}
            onChange={(event) => setTicketsHandled(event.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
            placeholder="Tickets handled"
          />
          <input
            type="number"
            value={ticketsResolved}
            min={0}
            onChange={(event) => setTicketsResolved(event.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
            placeholder="Tickets resolved"
          />
          <input
            type="number"
            value={customerScore}
            min={1}
            max={10}
            onChange={(event) => setCustomerScore(event.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
            placeholder="Customer score (1-10)"
          />
        </div>
        <textarea
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          placeholder="Manager note, strengths, and improvement actions..."
        />
        {selectedEmployee && (
          <p className="mt-2 text-xs text-muted">
            Reviewing {selectedEmployee.employeeName} ({selectedEmployee.employeeEmail})
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
        >
          {busy ? "Saving..." : "Save review"}
        </button>
      </form>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Review history</h2>
        <div className="mt-4 space-y-3">
          {!reviews.length && (
            <p className="rounded-2xl border border-border bg-surface p-3 text-sm text-muted">
              No reviews recorded yet.
            </p>
          )}
          {reviews.map((review) => (
            <article key={review.id} className="rounded-2xl border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {review.employeeName} | {review.monthKey}
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
              <p className="mt-1 text-xs text-muted">
                Updated {new Date(review.updatedAt).toLocaleString()}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
