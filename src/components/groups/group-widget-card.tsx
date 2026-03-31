import Link from "next/link";
import { GroupRecord } from "@/lib/firebase/repositories";

export function GroupWidgetCard({ group }: { group: GroupRecord | null }) {
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
