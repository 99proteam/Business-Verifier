import Link from "next/link";
import { GroupThread } from "@/components/groups/group-thread";
import { SiteHeader } from "@/components/layout/site-header";
import { getCachedGroupThreadBundle } from "@/lib/server/public-cache";

export const revalidate = 60;

export default async function GroupDetailsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const bundle = await getCachedGroupThreadBundle(groupId).catch(() => ({
    group: null,
    messages: [],
  }));

  return (
    <div>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-4 pb-8 pt-10">
        <Link
          href="/groups"
          className="mb-4 inline-flex rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40"
        >
          Back to groups
        </Link>
        <GroupThread
          groupId={groupId}
          initialGroup={bundle.group}
          initialMessages={bundle.messages}
        />
      </main>
    </div>
  );
}
