import { NextRequest, NextResponse } from "next/server";
import { fetchGeoCatalogSummary, importGeoCatalogSeed } from "@/lib/firebase/repositories";
import { enforceApiRateLimit, getRequestIdentifier } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceApiRateLimit({
      scope: "admin_geo_import",
      identifier: getRequestIdentifier(request),
      limit: Number(process.env.GEO_IMPORT_RATE_LIMIT_PER_10_MIN ?? "12"),
      windowMinutes: 10,
    });

    const expectedSecret = process.env.ADMIN_GEO_IMPORT_SECRET?.trim();
    if (!expectedSecret) {
      return NextResponse.json(
        { ok: false, error: "ADMIN_GEO_IMPORT_SECRET is not configured." },
        { status: 500 },
      );
    }
    const receivedSecret = String(request.headers.get("x-admin-geo-secret") ?? "").trim();
    if (!receivedSecret || receivedSecret !== expectedSecret) {
      return NextResponse.json({ ok: false, error: "Unauthorized geo import secret." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const adminUid = String(body.adminUid ?? "system-admin").trim() || "system-admin";
    const source = body.source ? String(body.source).trim() : "seed";
    const seed = body.seed as Record<string, string[]> | undefined;

    const imported = await importGeoCatalogSeed({
      adminUid,
      source,
      seed,
    });
    const summary = await fetchGeoCatalogSummary();
    return NextResponse.json({
      ok: true,
      imported,
      summary,
      rateLimit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected geo import API error.";
    const status = message.toLowerCase().includes("rate limit exceeded") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
