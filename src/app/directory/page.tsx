import { DirectoryClientPage } from "@/components/directory/directory-client-page";
import { getCachedDirectoryBootstrap } from "@/lib/server/public-cache";

export const revalidate = 300;

export default async function DirectoryPage() {
  const bootstrap = await getCachedDirectoryBootstrap().catch(() => ({
    rows: [],
    countries: [],
  }));
  return (
    <DirectoryClientPage
      initialRows={bootstrap.rows}
      initialCountries={bootstrap.countries}
    />
  );
}
