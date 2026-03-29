import { NextRequest, NextResponse } from "next/server";
import {
  generateInvoicesForAllBusinesses,
  releaseDueEscrowOrders,
  releaseMaturedProDeposits,
  runBillingMaintenance,
} from "@/lib/firebase/repositories";
import { enforceApiRateLimit, getRequestIdentifier } from "@/lib/api/rate-limit";
import { AuthApiError, requireAdminOrSecret } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceApiRateLimit({
      scope: "automation_run_all",
      identifier: getRequestIdentifier(request),
      limit: Number(process.env.AUTOMATION_RATE_LIMIT_PER_10_MIN ?? "80"),
      windowMinutes: 10,
    });

    const auth = await requireAdminOrSecret(request, {
      secretHeaderName: "x-cron-secret",
      secretEnvName: "AUTOMATION_CRON_SECRET",
      unauthorizedError: "Unauthorized cron secret.",
    });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const requestedAdminUid = String(body.adminUid ?? "").trim();
    const adminUid =
      auth.mode === "admin"
        ? auth.uid
        : requestedAdminUid || "system-automation";
    if (auth.mode === "admin" && requestedAdminUid && requestedAdminUid !== auth.uid) {
      return NextResponse.json(
        { ok: false, error: "adminUid does not match authenticated admin user." },
        { status: 403 },
      );
    }
    const adminName = auth.mode === "admin"
      ? auth.name || "Admin"
      : String(body.adminName ?? "System Automation").trim() || "System Automation";
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
    if (error instanceof AuthApiError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unexpected automation error.";
    const status = message.toLowerCase().includes("rate limit exceeded") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
