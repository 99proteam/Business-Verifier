import { GroupWidgetCard } from "@/components/groups/group-widget-card";
import { fetchGroupById } from "@/lib/firebase/repositories";

export const revalidate = 60;

export default async function GroupWidgetPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const group = await fetchGroupById(groupId).catch(() => null);

  return (
    <main className="p-2">
      <GroupWidgetCard group={group} />
    </main>
  );
}
