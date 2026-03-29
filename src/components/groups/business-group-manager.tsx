"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  BusinessEmployeeRecord,
  createBusinessGroup,
  fetchBusinessEmployees,
  fetchGroupsCreatedByUser,
  GroupRecord,
  updateGroupModerators,
  updateGroupMessagingMode,
  userCanCreateBusinessGroup,
} from "@/lib/firebase/repositories";

export function BusinessGroupManager() {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<GroupRecord[]>([]);
  const [employees, setEmployees] = useState<BusinessEmployeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [adminOnlyMessaging, setAdminOnlyMessaging] = useState(false);
  const [moderatorDrafts, setModeratorDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!user || !hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [groups, allowed] = await Promise.all([
        fetchGroupsCreatedByUser(user.uid),
        userCanCreateBusinessGroup(user.uid),
      ]);
      const employeeRows = await fetchBusinessEmployees(user.uid);
      setRows(groups);
      setEmployees(employeeRows);
      setCanCreate(allowed);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load groups.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasFirebaseConfig, user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    if (!title.trim() || !description.trim()) {
      setError("Title and description are required.");
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const groupId = await createBusinessGroup({
        ownerUid: user.uid,
        ownerName: user.displayName ?? "Business",
        title: title.trim(),
        description: description.trim(),
        adminOnlyMessaging,
      });
      setInfo(`Group created: ${groupId}`);
      setTitle("");
      setDescription("");
      setAdminOnlyMessaging(false);
      await load();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to create group right now.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleMode(group: GroupRecord) {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await updateGroupMessagingMode({
        groupId: group.id,
        ownerUid: user.uid,
        adminOnlyMessaging: !group.adminOnlyMessaging,
      });
      setInfo("Group messaging mode updated.");
      await load();
    } catch (modeError) {
      setError(
        modeError instanceof Error ? modeError.message : "Unable to update mode.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveModerators(groupId: string) {
    if (!user) return;
    const draft = moderatorDrafts[groupId] ?? "";
    const moderatorUids = draft
      .split(",")
      .map((uid) => uid.trim())
      .filter(Boolean);
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await updateGroupModerators({
        groupId,
        ownerUid: user.uid,
        moderatorUids,
      });
      setInfo("Group moderators updated.");
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update moderators.");
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
        Loading group manager...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Business Groups</h1>
        <p className="mt-2 text-sm text-muted">
          Create groups, share join links/widgets, and control who can message.
        </p>
        {!canCreate && (
          <p className="mt-3 rounded-xl border border-amber-400/40 bg-amber-100 p-3 text-xs text-amber-800">
            Group creation is only available for business users with onboarding records.
          </p>
        )}
      </div>

      {info && (
        <div className="rounded-2xl border border-brand/40 bg-brand/10 p-3 text-sm">{info}</div>
      )}
      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <form onSubmit={onCreate} className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Create group</h2>
        <div className="mt-4 grid gap-3">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Group title"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Group description"
            rows={3}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={adminOnlyMessaging}
              onChange={(event) => setAdminOnlyMessaging(event.target.checked)}
            />
            Only group admin can message
          </label>
        </div>
        <button
          type="submit"
          disabled={!canCreate || busy}
          className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
        >
          {busy ? "Creating..." : "Create group"}
        </button>
      </form>

      <section className="space-y-3">
        {!rows.length && (
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
            No groups created yet.
          </div>
        )}
        {rows.map((group) => (
          <article key={group.id} className="glass rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold tracking-tight">{group.title}</h3>
              <span className="text-xs text-muted">Members {group.membersCount}</span>
            </div>
            <p className="mt-1 text-sm text-muted">{group.description}</p>
            <p className="mt-2 text-xs text-muted">
              Messaging mode: {group.adminOnlyMessaging ? "Admin only" : "Public chat"}
            </p>
            <div className="mt-3 grid gap-2">
              <p className="rounded-lg border border-border bg-surface px-2 py-1 text-xs">
                Join link: {group.joinLink}
              </p>
              <textarea
                readOnly
                rows={3}
                value={group.widgetCode}
                className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
              />
            </div>
            <div className="mt-3 rounded-xl border border-border bg-white p-3">
              <p className="text-xs font-medium">Employee moderator UIDs</p>
              <p className="mt-1 text-xs text-muted">
                Owner is always moderator. Add employee UIDs (comma separated). Eligible employees:
                {" "}
                {employees.length ? employees.map((item) => item.employeeUid).join(", ") : "none"}
              </p>
              <input
                value={moderatorDrafts[group.id] ?? group.moderatorUids.join(", ")}
                onChange={(event) =>
                  setModeratorDrafts((prev) => ({ ...prev, [group.id]: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveModerators(group.id)}
                className="mt-2 rounded-xl border border-border px-3 py-2 text-xs transition hover:border-brand/40 disabled:opacity-70"
              >
                Save moderators
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void toggleMode(group)}
                className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
              >
                Switch to {group.adminOnlyMessaging ? "public chat" : "admin-only chat"}
              </button>
              <Link
                href={`/groups/${group.id}`}
                className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
              >
                Open group
              </Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
