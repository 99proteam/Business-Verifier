import { NextRequest, NextResponse } from "next/server";
import {
  generateInvoicesForAllBusinesses,
  releaseDueEscrowOrders,
  releaseMaturedProDeposits,
  runBillingMaintenance,
} from "@/lib/firebase/repositories";
import { enforceApiRateLimit, getRequestIdentifier } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceApiRateLimit({
      scope: "automation_run_all",
      identifier: getRequestIdentifier(request),
      limit: Number(process.env.AUTOMATION_RATE_LIMIT_PER_10_MIN ?? "80"),
      windowMinutes: 10,
    });

    const expectedSecret = process.env.AUTOMATION_CRON_SECRET?.trim();
    if (!expectedSecret) {
      return NextResponse.json(
        { ok: false, error: "AUTOMATION_CRON_SECRET is not configured." },
        { status: 500 },
      );
    }

    const receivedSecret = String(request.headers.get("x-cron-secret") ?? "").trim();
    if (!receivedSecret || receivedSecret !== expectedSecret) {
      return NextResponse.json({ ok: false, error: "Unauthorized cron secret." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const adminUid = String(body.adminUid ?? "system-automation").trim() || "system-automation";
    const adminName = String(body.adminName ?? "System Automation").trim() || "System Automation";
    const monthKey = body.monthKey ? String(body.monthKey).trim() : undefined;

    const [invoiceIds, escrowResult, depositResult, billingResult] = await Promise.all([
      generateInvoicesForAllBusinesses(monthKey),
      releaseDueEscrowOrders({
        adminUid,
        adminName,
      }),
      releaseMaturedProDeposits({
        actorUid: adminUid,
        actorRole: "system",
      }),
      runBillingMaintenance({
        adminUid,
      }),
    ]);

    return NextResponse.json({
      ok: true,
      result: {
        invoicesGenerated: invoiceIds.length,
        escrowResult,
        depositResult,
        billingResult,
      },
      rateLimit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected automation error.";
    const status = message.toLowerCase().includes("rate limit exceeded") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
