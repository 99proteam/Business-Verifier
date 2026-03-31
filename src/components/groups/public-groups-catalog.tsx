"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  fetchPublicGroups,
  GroupRecord,
  isGroupMember,
  joinGroup,
  unjoinGroup,
} from "@/lib/firebase/repositories";

type MembershipMap = Record<string, boolean>;

export function PublicGroupsCatalog({ initialRows }: { initialRows: GroupRecord[] }) {
  const { user, hasFirebaseConfig } = useAuth();
  const [rows, setRows] = useState<GroupRecord[]>(initialRows);
  const [query, setQuery] = useState("");
  const [membership, setMembership] = useState<MembershipMap>({});
  const [loading, setLoading] = useState(initialRows.length === 0);
  const [busyGroupId, setBusyGroupId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!hasFirebaseConfig) {
        setLoading(false);
        return;
      }
      setError(null);
      try {
        const groups = rows.length ? rows : await fetchPublicGroups();
        setRows(groups);
        if (user) {
          const memberPairs = await Promise.all(
            groups.map(async (group) => [group.id, await isGroupMember(group.id, user.uid)]),
          );
          setMembership(Object.fromEntries(memberPairs));
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load public groups.",
        );
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [hasFirebaseConfig, rows, user]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((group) =>
      `${group.title} ${group.description} ${group.ownerName}`
        .toLowerCase()
        .includes(q),
    );
  }, [query, rows]);

  async function toggleMembership(group: GroupRecord) {
    if (!user) {
      setError("Sign in to join groups.");
      return;
    }
    setBusyGroupId(group.id);
    setError(null);
    try {
      if (membership[group.id]) {
        await unjoinGroup({ groupId: group.id, userUid: user.uid });
        setMembership((prev) => ({ ...prev, [group.id]: false }));
        setRows((prev) =>
          prev.map((item) =>
            item.id === group.id ? { ...item, membersCount: item.membersCount - 1 } : item,
          ),
        );
      } else {
        await joinGroup({
          groupId: group.id,
          userUid: user.uid,
          userName: user.displayName ?? "User",
        });
        setMembership((prev) => ({ ...prev, [group.id]: true }));
        setRows((prev) =>
          prev.map((item) =>
            item.id === group.id ? { ...item, membersCount: item.membersCount + 1 } : item,
          ),
        );
      }
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "Unable to update membership right now.",
      );
    } finally {
      setBusyGroupId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6">
        <h1 className="text-3xl font-semibold tracking-tight">Public Groups</h1>
        <p className="mt-2 text-sm text-muted">
          Discover business communities, join with one click, and chat in trusted spaces.
        </p>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search groups..."
          className="mt-4 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none"
        />
      </div>

      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          Loading groups...
        </div>
      )}

      {!loading && (
        <section className="grid gap-4 md:grid-cols-2">
          {filtered.map((group) => (
            <article key={group.id} className="glass rounded-2xl p-5">
              <h2 className="text-lg font-semibold tracking-tight">{group.title}</h2>
              <p className="mt-1 text-sm text-muted">{group.description}</p>
              <p className="mt-2 text-xs text-muted">
                Owner {group.ownerName} | Members {group.membersCount}
              </p>
              <p className="mt-1 text-xs text-muted">
                Mode {group.adminOnlyMessaging ? "Admin-only chat" : "Public chat"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {user?.uid === group.ownerUid ? (
                  <span className="inline-flex rounded-xl border border-border px-3 py-2 text-sm text-muted">
                    Group owner
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={!user || busyGroupId === group.id}
                    onClick={() => void toggleMembership(group)}
                    className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
                  >
                    {membership[group.id] ? "Unjoin" : "Join"}
                  </button>
                )}
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
      )}
    </div>
  );
}
