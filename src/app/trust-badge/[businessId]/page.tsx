import { TrustBadgeWidget } from "@/components/business/trust-badge-widget";
import { fetchPublicBusinessTrustBadgeByBusinessId } from "@/lib/firebase/repositories";

export const revalidate = 300;

export default async function TrustBadgePage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const row = await fetchPublicBusinessTrustBadgeByBusinessId(businessId).catch(() => null);

  return (
    <main className="p-2">
      <TrustBadgeWidget row={row} />
    </main>
  );
}
