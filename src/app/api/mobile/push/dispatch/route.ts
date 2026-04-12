import { NextRequest, NextResponse } from "next/server";
import { enforceApiRateLimit, getRequestIdentifier } from "@/lib/api/rate-limit";
import { AuthApiError, requireAdminOrSecret } from "@/lib/server/auth";
import { dispatchMobilePushQueue } from "@/lib/server/mobile-push";

export const runtime = "nodejs";

function readLimit(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 200;
  }
  return Math.max(1, Math.min(Math.floor(parsed), 300));
}

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceApiRateLimit({
      scope: "mobile_push_dispatch",
      identifier: getRequestIdentifier(request),
      limit: Number(process.env.AUTOMATION_RATE_LIMIT_PER_10_MIN ?? "80"),
      windowMinutes: 10,
    });
    await requireAdminOrSecret(request, {
      secretHeaderName: "x-mobile-push-secret",
      secretEnvName: "MOBILE_PUSH_DISPATCH_SECRET",
      unauthorizedError: "Unauthorized mobile push dispatch request.",
    });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await dispatchMobilePushQueue({
      limit: readLimit(body.limit),
      trigger: "api",
    });
    return NextResponse.json({ ok: true, result, rateLimit });
  } catch (error) {
    if (error instanceof AuthApiError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unexpected mobile push dispatch error.";
    const status = message.toLowerCase().includes("rate limit exceeded") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
