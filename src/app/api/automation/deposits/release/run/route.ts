import { NextRequest, NextResponse } from "next/server";
import { releaseMaturedProDeposits } from "@/lib/firebase/repositories";
import { enforceApiRateLimit, getRequestIdentifier } from "@/lib/api/rate-limit";
import { AuthApiError, requireAdminOrSecret } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceApiRateLimit({
      scope: "automation_deposits_release_run",
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
    const requestedActorUid = String(body.actorUid ?? "").trim();
    const actorUid =
      auth.mode === "admin"
        ? auth.uid
        : requestedActorUid || "system-automation";
    if (auth.mode === "admin" && requestedActorUid && requestedActorUid !== auth.uid) {
      return NextResponse.json(
        { ok: false, error: "actorUid does not match authenticated admin user." },
        { status: 403 },
      );
    }
    const limit = body.limit ? Number(body.limit) : undefined;
    const result = await releaseMaturedProDeposits({
      actorUid,
      actorRole: "system",
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return NextResponse.json({ ok: true, result, rateLimit });
  } catch (error) {
    if (error instanceof AuthApiError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unexpected automation error.";
    const status = message.toLowerCase().includes("rate limit exceeded") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
