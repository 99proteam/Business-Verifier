import { NextRequest, NextResponse } from "next/server";
import {
  CatalogIntegrationProvider,
  testCatalogIntegrationConnection,
} from "@/lib/firebase/repositories";
import { enforceApiRateLimit, getRequestIdentifier } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceApiRateLimit({
      scope: "catalog_integration_test",
      identifier: getRequestIdentifier(request),
      limit: Number(process.env.CATALOG_TEST_RATE_LIMIT_PER_10_MIN ?? "40"),
      windowMinutes: 10,
    });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const providerRaw = String(body.provider ?? "").trim().toLowerCase();
    const provider: CatalogIntegrationProvider =
      providerRaw === "woocommerce" ? "woocommerce" : "shopify";
    const result = await testCatalogIntegrationConnection({
      provider,
      storeUrl: String(body.storeUrl ?? ""),
      shopifyAccessToken: body.shopifyAccessToken ? String(body.shopifyAccessToken) : undefined,
      shopifyApiVersion: body.shopifyApiVersion ? String(body.shopifyApiVersion) : undefined,
      wooConsumerKey: body.wooConsumerKey ? String(body.wooConsumerKey) : undefined,
      wooConsumerSecret: body.wooConsumerSecret ? String(body.wooConsumerSecret) : undefined,
    });
    return NextResponse.json({
      ok: true,
      result,
      rateLimit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Catalog test failed.";
    const status = message.toLowerCase().includes("rate limit exceeded") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

