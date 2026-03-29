import { NextRequest, NextResponse } from "next/server";
import { generateInvoicesForAllBusinesses } from "@/lib/firebase/repositories";
import { enforceApiRateLimit, getRequestIdentifier } from "@/lib/api/rate-limit";
import { AuthApiError, requireAdminOrSecret } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceApiRateLimit({
      scope: "automation_invoices_run",
      identifier: getRequestIdentifier(request),
      limit: Number(process.env.AUTOMATION_RATE_LIMIT_PER_10_MIN ?? "80"),
      windowMinutes: 10,
    });

    await requireAdminOrSecret(request, {
      secretHeaderName: "x-cron-secret",
      secretEnvName: "AUTOMATION_CRON_SECRET",
      unauthorizedError: "Unauthorized cron secret.",
    });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const monthKey = body.monthKey ? String(body.monthKey).trim() : undefined;
    const invoiceIds = await generateInvoicesForAllBusinesses(monthKey);
    return NextResponse.json({
      ok: true,
      invoicesGenerated: invoiceIds.length,
      invoiceIds,
      monthKey: monthKey ?? "current_utc_month",
      rateLimit,
    });
  } catch (error) {
    if (error instanceof AuthApiError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unexpected automation error.";
    const status = message.toLowerCase().includes("rate limit exceeded") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
