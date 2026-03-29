"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import {
  addBusinessEmployee,
  BusinessEmployeeRecord,
  fetchBusinessEmployees,
  removeBusinessEmployee,
} from "@/lib/firebase/repositories";

export function BusinessEmployeeManager() {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<BusinessEmployeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [employeeEmail, setEmployeeEmail] = useState("");
  const [title, setTitle] = useState("Support Executive");

  const load = useCallback(async () => {
    if (!user || !hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchBusinessEmployees(user.uid));
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
          Add employees by their Gmail account email. They must already have an account
          on this platform.
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

      <form onSubmit={addEmployee} className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Add employee</h2>
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

      <section className="space-y-3">
        {!rows.length && (
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
            No employees added yet.
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
