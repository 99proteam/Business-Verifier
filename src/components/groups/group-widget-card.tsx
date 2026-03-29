"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchGroupById, GroupRecord } from "@/lib/firebase/repositories";

export function GroupWidgetCard({ groupId }: { groupId: string }) {
  const [group, setGroup] = useState<GroupRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const row = await fetchGroupById(groupId);
      setGroup(row);
      setLoading(false);
    }
    void load();
  }, [groupId]);

  if (loading) {
    return <div className="p-3 text-xs text-muted">Loading group...</div>;
  }

  if (!group) {
    return <div className="p-3 text-xs text-danger">Group not found.</div>;
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-3 text-foreground">
      <p className="text-sm font-semibold">{group.title}</p>
      <p className="mt-1 text-xs text-muted">{group.membersCount} members</p>
      <Link
        href={`/groups/${group.id}`}
        className="mt-2 inline-flex rounded-lg bg-brand px-2 py-1 text-xs font-medium text-white transition hover:bg-brand-strong"
      >
        Join group
      </Link>
    </div>
  );
}
