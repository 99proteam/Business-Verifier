"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  fetchGroupById,
  fetchGroupMessages,
  GroupMessageRecord,
  GroupRecord,
  isGroupMember,
  joinGroup,
  sendGroupMessage,
  unjoinGroup,
} from "@/lib/firebase/repositories";

export function GroupThread({
  groupId,
  adminMode = false,
  initialGroup = null,
  initialMessages = [],
}: {
  groupId: string;
  adminMode?: boolean;
  initialGroup?: GroupRecord | null;
  initialMessages?: GroupMessageRecord[];
}) {
  const { user, hasFirebaseConfig } = useAuth();
  const [group, setGroup] = useState<GroupRecord | null>(initialGroup);
  const [messages, setMessages] = useState<GroupMessageRecord[]>(initialMessages);
  const [isMember, setIsMember] = useState(false);
  const [loading, setLoading] = useState(!initialGroup);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canMessage = useMemo(() => {
    if (!group || !user) return false;
    if (adminMode) return true;
    if (group.adminOnlyMessaging) return user.uid === group.ownerUid;
    return isMember || user.uid === group.ownerUid;
  }, [adminMode, group, isMember, user]);

  const load = useCallback(async () => {
    if (!hasFirebaseConfig) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [groupRow, groupMessages] = await Promise.all([
        fetchGroupById(groupId),
        fetchGroupMessages(groupId),
      ]);
      setGroup(groupRow);
      setMessages(groupMessages);
      if (user && groupRow) {
        setIsMember(await isGroupMember(groupId, user.uid));
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load group thread.",
      );
    } finally {
      setLoading(false);
    }
  }, [groupId, hasFirebaseConfig, user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleJoin() {
    if (!user || !group) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await joinGroup({
        groupId,
        userUid: user.uid,
        userName: user.displayName ?? "User",
      });
      setIsMember(true);
      setGroup({ ...group, membersCount: group.membersCount + 1 });
      setInfo("Joined group.");
    } catch (joinError) {
      setError(
        joinError instanceof Error ? joinError.message : "Unable to join group.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleUnjoin() {
    if (!user || !group) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await unjoinGroup({ groupId, userUid: user.uid });
      setIsMember(false);
      setGroup({ ...group, membersCount: Math.max(group.membersCount - 1, 0) });
      setInfo("Unjoined group.");
    } catch (unjoinError) {
      setError(
        unjoinError instanceof Error ? unjoinError.message : "Unable to unjoin group.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    if (!group || !user || !draft.trim()) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await sendGroupMessage({
        groupId,
        senderUid: user.uid,
        senderName: user.displayName ?? "User",
        senderRole: adminMode ? "admin" : user.uid === group.ownerUid ? "owner" : "member",
        text: draft.trim(),
      });
      setDraft("");
      await load();
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Unable to send message right now.",
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
        Loading group...
      </div>
    );
  }

  if (!group) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        Group not found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">{group.title}</h1>
        <p className="mt-2 text-sm text-muted">{group.description}</p>
        <p className="mt-2 text-xs text-muted">
          Owner {group.ownerName} | Members {group.membersCount} | Mode{" "}
          {group.adminOnlyMessaging ? "Admin-only chat" : "Public chat"}
        </p>
        {!adminMode && user && (
          <div className="mt-3 flex flex-wrap gap-2">
            {user.uid === group.ownerUid ? (
              <span className="inline-flex rounded-xl border border-border px-3 py-2 text-sm text-muted">
                You are the group owner
              </span>
            ) : !isMember ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleJoin()}
                className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
              >
                Join group
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleUnjoin()}
                className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
              >
                Unjoin group
              </button>
            )}
          </div>
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

      <section className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">Messages</h2>
        <div className="mt-4 space-y-2">
          {!messages.length && <p className="text-sm text-muted">No messages yet.</p>}
          {messages.map((message) => (
            <article key={message.id} className="rounded-2xl border border-border bg-surface p-3">
              <p className="text-xs text-muted">
                {message.senderName} | {message.senderRole} |{" "}
                {new Date(message.createdAt).toLocaleString()}
              </p>
              <p className="mt-1 text-sm">{message.text}</p>
            </article>
          ))}
        </div>
      </section>

      <form onSubmit={handleSend} className="glass rounded-3xl p-6">
        <h3 className="text-base font-semibold tracking-tight">Send message</h3>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
          placeholder="Write your message..."
        />
        <button
          type="submit"
          disabled={busy || !canMessage || !draft.trim()}
          className="mt-3 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-70"
        >
          Send
        </button>
        {!canMessage && (
          <p className="mt-2 text-xs text-muted">
            You cannot message now. Join the group or wait for admin-only mode to be disabled.
          </p>
        )}
      </form>
    </div>
  );
}
