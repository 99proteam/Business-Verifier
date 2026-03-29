import { NextRequest, NextResponse } from "next/server";
import { searchPublicMarketplace } from "@/lib/firebase/repositories";
import { enforceApiRateLimit, getRequestIdentifier } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const rateLimit = await enforceApiRateLimit({
      scope: "search_global_public",
      identifier: getRequestIdentifier(request),
      limit: Number(process.env.GENERIC_API_RATE_LIMIT_PER_10_MIN ?? "200"),
      windowMinutes: 10,
    });
    const { searchParams } = new URL(request.url);
    const query = String(searchParams.get("q") ?? "").trim();
    const limitRows = Number(searchParams.get("limit") ?? "30");
    const hits = await searchPublicMarketplace(query, limitRows);
    return NextResponse.json({
      ok: true,
      query,
      hits,
      rateLimit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected search API error.";
    const status = message.toLowerCase().includes("rate limit exceeded") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
