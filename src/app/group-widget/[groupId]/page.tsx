import { GroupWidgetCard } from "@/components/groups/group-widget-card";

export default async function GroupWidgetPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  return (
    <main className="p-2">
      <GroupWidgetCard groupId={groupId} />
    </main>
  );
}
