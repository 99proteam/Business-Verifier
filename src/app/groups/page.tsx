import { PublicGroupsCatalog } from "@/components/groups/public-groups-catalog";
import { SiteHeader } from "@/components/layout/site-header";
import { getCachedPublicGroups } from "@/lib/server/public-cache";

export const revalidate = 180;

export default async function GroupsPage() {
  const groups = await getCachedPublicGroups().catch(() => []);
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
        <PublicGroupsCatalog initialRows={groups} />
      </main>
    </div>
  );
}
