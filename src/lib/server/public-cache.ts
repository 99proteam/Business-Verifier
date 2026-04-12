import { unstable_cache } from "next/cache";
import {
  fetchBusinessServicesByOwner,
  fetchBusinessBySlug,
  fetchDigitalProductsByOwner,
  fetchDigitalProductBySlug,
  fetchGeoCatalogCountries,
  fetchGroupById,
  fetchGroupMessages,
  fetchHomePageShowcase,
  fetchPartnershipOpportunities,
  fetchProDepositLedgerByBusinessId,
  fetchPublicBusinessDirectory,
  fetchPublicBusinessServices,
  fetchPublicBusinessTrustBadgeBySlug,
  fetchPublicDigitalProducts,
  fetchPublicGroups,
} from "@/lib/firebase/repositories";
import {
  fetchBusinessVerificationTierBySlug,
  fetchPublicTrustTimelineByBusinessSlug,
} from "@/lib/firebase/growth-repositories";

type ExternalProductRecord = {
  id: string;
  title: string;
  price: number;
  source: string;
  url?: string;
  imageUrl?: string;
  rating?: number;
};

function readFeedSources() {
  const raw = process.env.EXTERNAL_PRODUCT_FEEDS?.trim();
  if (!raw) {
    return ["https://fakestoreapi.com/products"];
  }
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeExternalProduct(
  row: Record<string, unknown>,
  source: string,
  idx: number,
): ExternalProductRecord | null {
  const id = String(row.id ?? `${source}_${idx}`);
  const title = String(row.title ?? row.name ?? "").trim();
  const price = Number(row.price ?? row.amount ?? 0);
  if (!title || !Number.isFinite(price) || price <= 0) return null;
  const ratingRaw = row.rating as Record<string, unknown> | undefined;
  const rating = Number(ratingRaw?.rate ?? row.rating ?? 0);
  return {
    id,
    title,
    price,
    source,
    url: row.url ? String(row.url) : undefined,
    imageUrl: row.image ? String(row.image) : row.imageUrl ? String(row.imageUrl) : undefined,
    rating: Number.isFinite(rating) && rating > 0 ? rating : undefined,
  };
}

async function fetchExternalProducts(limitRows: number) {
  const maxRows = Math.max(1, Math.min(limitRows, 60));
  const sources = readFeedSources();
  const responses = await Promise.allSettled(
    sources.map(async (source) => {
      const response = await fetch(source, {
        method: "GET",
        headers: { accept: "application/json" },
        next: {
          revalidate: 3600,
        },
      });
      if (!response.ok) {
        throw new Error(`Feed ${source} returned ${response.status}`);
      }
      const body = (await response.json()) as unknown;
      if (!Array.isArray(body)) {
        throw new Error(`Feed ${source} did not return an array.`);
      }
      return { source, rows: body as Array<Record<string, unknown>> };
    }),
  );

  const collected: ExternalProductRecord[] = [];
  for (const result of responses) {
    if (result.status !== "fulfilled") continue;
    for (let i = 0; i < result.value.rows.length; i += 1) {
      const row = normalizeExternalProduct(result.value.rows[i], result.value.source, i);
      if (!row) continue;
      collected.push(row);
    }
  }
  return Array.from(
    new Map(collected.map((row) => [`${row.source}_${row.id}`, row])).values(),
  )
    .sort((a, b) => a.price - b.price)
    .slice(0, maxRows);
}

export const getCachedHomeShowcase = unstable_cache(
  async () => fetchHomePageShowcase(),
  ["public-home-showcase"],
  { revalidate: 300, tags: ["public-home-showcase"] },
);

export const getCachedDirectoryBootstrap = unstable_cache(
  async () => {
    const [rows, countries] = await Promise.all([
      fetchPublicBusinessDirectory(),
      fetchGeoCatalogCountries(),
    ]);
    return { rows, countries };
  },
  ["public-directory-bootstrap"],
  { revalidate: 300, tags: ["public-directory"] },
);

export async function getCachedBusinessProfileBundle(slug: string) {
  return unstable_cache(
    async () => {
      const business = await fetchBusinessBySlug(slug);
      if (!business || business.status !== "approved") {
        return {
          business: null,
          badge: null,
          ledger: [],
          products: [],
          services: [],
          verificationTier: null,
          trustTimeline: [],
        };
      }
      const [badge, ledger, products, services, verificationTier, trustTimeline] =
        await Promise.all([
        fetchPublicBusinessTrustBadgeBySlug(slug),
        fetchProDepositLedgerByBusinessId(business.id),
        fetchDigitalProductsByOwner(business.ownerUid),
        fetchBusinessServicesByOwner(business.ownerUid),
        fetchBusinessVerificationTierBySlug(slug),
        fetchPublicTrustTimelineByBusinessSlug(slug, 12),
      ]);
      return {
        business,
        badge,
        ledger,
        products,
        services,
        verificationTier,
        trustTimeline,
      };
    },
    [`public-business-profile-${slug}`],
    { revalidate: 300, tags: [`public-business-${slug}`] },
  )();
}

export const getCachedPublicProducts = unstable_cache(
  async () => fetchPublicDigitalProducts(),
  ["public-products-list"],
  { revalidate: 300, tags: ["public-products"] },
);

export const getCachedPublicServices = unstable_cache(
  async () => fetchPublicBusinessServices(),
  ["public-services-list"],
  { revalidate: 300, tags: ["public-services"] },
);

export async function getCachedProductBySlug(slug: string) {
  return unstable_cache(
    async () => fetchDigitalProductBySlug(slug),
    [`public-product-${slug}`],
    { revalidate: 300, tags: [`public-product-${slug}`] },
  )();
}

export const getCachedExternalProducts = unstable_cache(
  async () => fetchExternalProducts(12),
  ["external-products-12"],
  { revalidate: 3600, tags: ["external-products"] },
);

export const getCachedPublicGroups = unstable_cache(
  async () => fetchPublicGroups(),
  ["public-groups-list"],
  { revalidate: 180, tags: ["public-groups"] },
);

export async function getCachedGroupThreadBundle(groupId: string) {
  return unstable_cache(
    async () => {
      const [group, messages] = await Promise.all([
        fetchGroupById(groupId),
        fetchGroupMessages(groupId),
      ]);
      return { group, messages };
    },
    [`public-group-thread-${groupId}`],
    { revalidate: 60, tags: [`public-group-${groupId}`] },
  )();
}

export const getCachedPartnershipMarketplace = unstable_cache(
  async () => fetchPartnershipOpportunities(),
  ["public-partnership-opportunities"],
  { revalidate: 180, tags: ["public-partnerships"] },
);
