import { NextRequest, NextResponse } from "next/server";
import { enforceApiRateLimit, getRequestIdentifier } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

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

function normalizeRow(row: Record<string, unknown>, source: string, idx: number): ExternalProductRecord | null {
  const id = String(row.id ?? `${source}_${idx}`);
  const title = String(row.title ?? row.name ?? "").trim();
  const price = Number(row.price ?? row.amount ?? 0);
  if (!title || !Number.isFinite(price) || price <= 0) {
    return null;
  }
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

export async function GET(request: NextRequest) {
  try {
    const rateLimit = await enforceApiRateLimit({
      scope: "external_products_fetch",
      identifier: getRequestIdentifier(request),
      limit: Number(process.env.GENERIC_API_RATE_LIMIT_PER_10_MIN ?? "200"),
      windowMinutes: 10,
    });
    const { searchParams } = new URL(request.url);
    const query = String(searchParams.get("q") ?? "").trim().toLowerCase();
    const maxRows = Math.max(1, Math.min(Number(searchParams.get("limit") ?? "24"), 60));

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
        const normalized = normalizeRow(result.value.rows[i], result.value.source, i);
        if (!normalized) continue;
        if (query && !`${normalized.title} ${normalized.source}`.toLowerCase().includes(query)) {
          continue;
        }
        collected.push(normalized);
      }
    }

    const unique = Array.from(
      new Map(collected.map((row) => [`${row.source}_${row.id}`, row])).values(),
    )
      .sort((a, b) => a.price - b.price)
      .slice(0, maxRows);

    return NextResponse.json({
      ok: true,
      items: unique,
      sources,
      rateLimit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected external products API error.";
    const status = message.toLowerCase().includes("rate limit exceeded") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
