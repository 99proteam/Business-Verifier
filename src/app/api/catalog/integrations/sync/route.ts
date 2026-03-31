import { NextRequest, NextResponse } from "next/server";
import { syncCatalogIntegrationById } from "@/lib/firebase/repositories";
import { enforceApiRateLimit, getRequestIdentifier } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceApiRateLimit({
      scope: "catalog_integration_sync",
      identifier: getRequestIdentifier(request),
      limit: Number(process.env.CATALOG_SYNC_RATE_LIMIT_PER_10_MIN ?? "30"),
      windowMinutes: 10,
    });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const ownerUid = String(body.ownerUid ?? "").trim();
    const integrationId = String(body.integrationId ?? "").trim();
    if (!ownerUid || !integrationId) {
      return NextResponse.json(
        { ok: false, error: "ownerUid and integrationId are required." },
        { status: 400 },
      );
    }
    const result = await syncCatalogIntegrationById({
      ownerUid,
      integrationId,
      trigger: "manual",
    });
    return NextResponse.json({
      ok: true,
      result,
      rateLimit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Catalog sync failed.";
    const status = message.toLowerCase().includes("rate limit exceeded") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

