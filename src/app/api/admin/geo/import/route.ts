import { NextRequest, NextResponse } from "next/server";
import { fetchGeoCatalogSummary, importGeoCatalogSeed } from "@/lib/firebase/repositories";
import { enforceApiRateLimit, getRequestIdentifier } from "@/lib/api/rate-limit";
import { AuthApiError, requireAdminOrSecret } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceApiRateLimit({
      scope: "admin_geo_import",
      identifier: getRequestIdentifier(request),
      limit: Number(process.env.GEO_IMPORT_RATE_LIMIT_PER_10_MIN ?? "12"),
      windowMinutes: 10,
    });

    const auth = await requireAdminOrSecret(request, {
      secretHeaderName: "x-admin-geo-secret",
      secretEnvName: "ADMIN_GEO_IMPORT_SECRET",
      unauthorizedError: "Unauthorized geo import secret.",
    });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const requestedAdminUid = String(body.adminUid ?? "").trim();
    const adminUid =
      auth.mode === "admin"
        ? auth.uid
        : requestedAdminUid || "system-admin";
    if (auth.mode === "admin" && requestedAdminUid && requestedAdminUid !== auth.uid) {
      return NextResponse.json(
        { ok: false, error: "adminUid does not match authenticated admin user." },
        { status: 403 },
      );
    }
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
    if (error instanceof AuthApiError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unexpected geo import API error.";
    const status = message.toLowerCase().includes("rate limit exceeded") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
