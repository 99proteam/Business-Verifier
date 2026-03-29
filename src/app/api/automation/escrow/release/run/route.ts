import { NextRequest, NextResponse } from "next/server";
import { releaseDueEscrowOrders } from "@/lib/firebase/repositories";
import { enforceApiRateLimit, getRequestIdentifier } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceApiRateLimit({
      scope: "automation_escrow_release_run",
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
    const adminName =
      String(body.adminName ?? "System Automation").trim() || "System Automation";
    const limit = body.limit ? Number(body.limit) : undefined;

    const result = await releaseDueEscrowOrders({
      adminUid,
      adminName,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return NextResponse.json({
      ok: true,
      result,
      rateLimit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected automation error.";
    const status = message.toLowerCase().includes("rate limit exceeded") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
