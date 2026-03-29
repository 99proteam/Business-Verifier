import { PublicGroupsCatalog } from "@/components/groups/public-groups-catalog";
import { SiteHeader } from "@/components/layout/site-header";

export default function GroupsPage() {
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
        <PublicGroupsCatalog />
      </main>
    </div>
  );
}
