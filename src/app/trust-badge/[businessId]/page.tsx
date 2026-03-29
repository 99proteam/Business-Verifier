import { TrustBadgeWidget } from "@/components/business/trust-badge-widget";

export default async function TrustBadgePage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;

  return (
    <main className="p-2">
      <TrustBadgeWidget businessId={businessId} />
    </main>
  );
}
