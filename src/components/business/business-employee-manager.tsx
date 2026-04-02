"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import {
  addBusinessEmployee,
  BusinessEmployeeRecord,
  BusinessQuestionConversationMode,
  EmployeeAccessRequestRecord,
  fetchBusinessEmployeeRequests,
  fetchBusinessEmployees,
  fetchOwnedBusinessProfile,
  regenerateBusinessEmployeeJoinKey,
  removeBusinessEmployee,
  reviewBusinessEmployeeRequest,
  updateBusinessQuestionConversationMode,
} from "@/lib/firebase/repositories";

function statusTone(status: EmployeeAccessRequestRecord["status"]) {
  if (status === "approved" || status === "auto_approved") return "bg-brand/10 text-brand-strong";
  if (status === "declined") return "bg-danger/10 text-danger";
  if (status === "hold") return "bg-accent text-brand-strong";
  return "bg-surface text-muted";
}

export function BusinessEmployeeManager() {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<BusinessEmployeeRecord[]>([]);
  const [requests, setRequests] = useState<EmployeeAccessRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [employeeEmail, setEmployeeEmail] = useState("");
  const [title, setTitle] = useState("Support Executive");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [businessPublicKey, setBusinessPublicKey] = useState("");
  const [privateJoinKey, setPrivateJoinKey] = useState("");
  const [questionMode, setQuestionMode] = useState<BusinessQuestionConversationMode>("public");

  const load = useCallback(async () => {
    if (!user || !hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [employees, requestRows, business] = await Promise.all([
        fetchBusinessEmployees(user.uid),
        fetchBusinessEmployeeRequests(user.uid),
        fetchOwnedBusinessProfile(user.uid),
      ]);
      setRows(employees);
      setRequests(requestRows);
      setBusinessPublicKey(business?.publicBusinessKey ?? "");
      setPrivateJoinKey(business?.employeeJoinKey ?? "");
      setQuestionMode(business?.questionConversationMode ?? "public");
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load employees.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addEmployee(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    if (!employeeEmail.trim()) {
      setError("Employee email is required.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await addBusinessEmployee({
        ownerUid: user.uid,
        ownerName: user.displayName ?? "Business",
        employeeEmail: employeeEmail.trim(),
        title,
      });
      setInfo("Employee added successfully.");
      setEmployeeEmail("");
      await load();
    } catch (addError) {
      setError(
        addError instanceof Error ? addError.message : "Unable to add employee right now.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeEmployee(employeeUid: string) {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await removeBusinessEmployee({
        ownerUid: user.uid,
        employeeUid,
      });
      setInfo("Employee removed.");
      await load();
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Unable to remove employee right now.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function reviewRequest(
    employeeUid: string,
    action: "approve" | "hold" | "decline",
  ) {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await reviewBusinessEmployeeRequest({
        ownerUid: user.uid,
        ownerName: user.displayName ?? "Business",
        employeeUid,
        action,
        note: reviewNotes[employeeUid],
        title,
      });
      setInfo(
        action === "approve"
          ? "Employee request approved."
          : action === "hold"
            ? "Employee request moved to hold."
            : "Employee request declined.",
      );
      await load();
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "Unable to review request right now.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function regenerateKey() {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const nextKey = await regenerateBusinessEmployeeJoinKey(user.uid);
      setPrivateJoinKey(nextKey);
      setInfo("Private employee join key regenerated.");
    } catch (regenError) {
      setError(
        regenError instanceof Error
          ? regenError.message
          : "Unable to regenerate private join key.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveQuestionMode() {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await updateBusinessQuestionConversationMode({
        ownerUid: user.uid,
        mode: questionMode,
      });
      setInfo(
        questionMode === "public"
          ? "Customer question chat is now public."
          : "Customer question chat is now private.",
      );
      await load();
    } catch (modeError) {
      setError(
        modeError instanceof Error
          ? modeError.message
          : "Unable to update question visibility.",
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
        Loading employee manager...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Business employees</h1>
        <p className="mt-2 text-sm text-muted">
          Employees can request access by business key. You can approve, hold, or decline requests.
        </p>
        <Link
          href="/dashboard/business/employees/performance"
          className="mt-3 inline-flex rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40"
        >
          Open employee performance module
        </Link>
      </div>

      {info && (
        <div className="rounded-2xl border border-brand/40 bg-brand/10 p-3 text-sm">{info}</div>
      )}
      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Employee access keys</h2>
        <p className="mt-1 text-xs text-muted">
          Share the business key publicly for requests. Keep private key secret for auto approval.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <article className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Public business key</p>
            <p className="mt-1 text-sm font-semibold">{businessPublicKey || "Not available yet"}</p>
          </article>
          <article className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Private join key</p>
            <p className="mt-1 text-sm font-semibold">{privateJoinKey || "Not available yet"}</p>
            <button
              type="button"
              onClick={() => void regenerateKey()}
              disabled={busy}
              className="mt-2 rounded-xl border border-border px-3 py-2 text-xs transition hover:border-brand/40 disabled:opacity-70"
            >
              Regenerate private key
            </button>
          </article>
        </div>
      </section>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Customer question chat visibility</h2>
        <p className="mt-1 text-xs text-muted">
          Public mode: everyone can see conversations. Private mode: only customer and business owner can view.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={questionMode}
            onChange={(event) =>
              setQuestionMode(event.target.value as BusinessQuestionConversationMode)
            }
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          >
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
          <button
            type="button"
            onClick={() => void saveQuestionMode()}
            disabled={busy}
            className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
          >
            Save setting
          </button>
        </div>
      </section>

      <form onSubmit={addEmployee} className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Add employee manually</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            type="email"
            value={employeeEmail}
            onChange={(event) => setEmployeeEmail(event.target.value)}
            placeholder="employee@gmail.com"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Role title (Support, Sales, Operations...)"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
        >
          {busy ? "Adding..." : "Add employee"}
        </button>
      </form>

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Employee access requests</h2>
        <div className="mt-3 space-y-3">
          {!requests.length && (
            <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
              No employee access requests yet.
            </p>
          )}
          {requests.map((row) => (
            <article key={row.employeeUid} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{row.employeeName}</h3>
                <span className={`rounded-full px-2 py-1 text-xs ${statusTone(row.status)}`}>
                  {row.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">{row.employeeEmail}</p>
              <p className="mt-1 text-xs text-muted">
                Requested {new Date(row.requestedAt).toLocaleString()}
              </p>
              <textarea
                value={reviewNotes[row.employeeUid] ?? ""}
                onChange={(event) =>
                  setReviewNotes((prev) => ({ ...prev, [row.employeeUid]: event.target.value }))
                }
                placeholder="Optional review note..."
                rows={2}
                className="mt-3 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void reviewRequest(row.employeeUid, "approve")}
                  disabled={busy}
                  className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => void reviewRequest(row.employeeUid, "hold")}
                  disabled={busy}
                  className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
                >
                  Hold
                </button>
                <button
                  type="button"
                  onClick={() => void reviewRequest(row.employeeUid, "decline")}
                  disabled={busy}
                  className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
                >
                  Decline
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        {!rows.length && (
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
            No approved employees yet.
          </div>
        )}

        {rows.map((row) => (
          <article key={row.employeeUid} className="glass rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold tracking-tight">{row.employeeName}</h3>
              <span className="text-xs text-muted">{row.title}</span>
            </div>
            <p className="mt-1 text-sm text-muted">{row.employeeEmail}</p>
            <p className="mt-1 text-xs text-muted">
              Added on {new Date(row.createdAt).toLocaleString()}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void removeEmployee(row.employeeUid)}
              className="mt-3 rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
            >
              Remove
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}
