import { NextRequest, NextResponse } from "next/server";
import { buildReconciliationCsv, buildReconciliationReport } from "@/lib/firebase/repositories";
import { enforceApiRateLimit, getRequestIdentifier } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceApiRateLimit({
      scope: "admin_reconciliation_export",
      identifier: getRequestIdentifier(request),
      limit: Number(process.env.RECON_EXPORT_RATE_LIMIT_PER_10_MIN ?? "30"),
      windowMinutes: 10,
    });

    const expectedSecret = process.env.ADMIN_EXPORT_SECRET?.trim();
    if (!expectedSecret) {
      return NextResponse.json(
        { ok: false, error: "ADMIN_EXPORT_SECRET is not configured." },
        { status: 500 },
      );
    }
    const receivedSecret = String(request.headers.get("x-admin-export-secret") ?? "").trim();
    if (!receivedSecret || receivedSecret !== expectedSecret) {
      return NextResponse.json({ ok: false, error: "Unauthorized export secret." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const monthKey = body.monthKey ? String(body.monthKey).trim() : undefined;
    const format = body.format === "csv" ? "csv" : "json";

    if (format === "csv") {
      const csv = await buildReconciliationCsv(monthKey);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename=\"reconciliation-${monthKey ?? "all"}.csv\"`,
          "x-rate-limit-remaining": String(rateLimit.remaining),
        },
      });
    }

    const report = await buildReconciliationReport(monthKey);
    return NextResponse.json({ ok: true, report, rateLimit });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected export API error.";
    const status = message.toLowerCase().includes("rate limit exceeded") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
