import { SiteHeader } from "@/components/layout/site-header";
import { PublicBusinessProfile } from "@/components/business/public-business-profile";

export default async function PublicBusinessProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10">
        <PublicBusinessProfile slug={slug} />
      </main>
    </div>
  );
}
