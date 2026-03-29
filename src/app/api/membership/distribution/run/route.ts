import { NextRequest, NextResponse } from "next/server";
import {
  fetchMembershipEconomicsSettings,
  generateMembershipDistributionCycle,
  registerMembershipApiUsage,
} from "@/lib/firebase/repositories";
import { enforceApiRateLimit, getRequestIdentifier } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

function monthKeyFromDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function defaultCycleRange(cycleMonths: number) {
  const safeMonths = Math.max(Math.floor(cycleMonths), 1);
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  end.setUTCMonth(end.getUTCMonth() - 1);

  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - (safeMonths - 1));

  return {
    startMonthKey: monthKeyFromDate(start),
    endMonthKey: monthKeyFromDate(end),
  };
}

export async function POST(request: NextRequest) {
  try {
    const genericRateLimit = await enforceApiRateLimit({
      scope: "membership_distribution_run",
      identifier: getRequestIdentifier(request),
      limit: Number(process.env.GENERIC_API_RATE_LIMIT_PER_10_MIN ?? "120"),
      windowMinutes: 10,
    });

    const expectedSecret = process.env.MEMBERSHIP_CRON_SECRET?.trim();
    if (!expectedSecret) {
      return NextResponse.json(
        { ok: false, error: "MEMBERSHIP_CRON_SECRET is not configured." },
        { status: 500 },
      );
    }

    const receivedSecret = String(request.headers.get("x-cron-secret") ?? "").trim();
    if (!receivedSecret || receivedSecret !== expectedSecret) {
      return NextResponse.json({ ok: false, error: "Unauthorized cron secret." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const adminUid = String(body.adminUid ?? "system-cron").trim() || "system-cron";
    const settings = await fetchMembershipEconomicsSettings();
    const fallbackRange = defaultCycleRange(settings.distributionCycleMonths);
    const startMonthKey = String(body.startMonthKey ?? fallbackRange.startMonthKey).trim();
    const endMonthKey = String(body.endMonthKey ?? fallbackRange.endMonthKey).trim();
    const cycleKey = body.cycleKey ? String(body.cycleKey).trim() : undefined;

    const usage = await registerMembershipApiUsage({
      businessOwnerUid: adminUid,
      endpoint: "distribution_cron",
      limit: 20,
      windowMinutes: 60,
      metadata: {
        startMonthKey,
        endMonthKey,
        hasCycleKey: Boolean(cycleKey),
      },
    });

    const result = await generateMembershipDistributionCycle({
      adminUid,
      startMonthKey,
      endMonthKey,
      cycleKey,
    });

    return NextResponse.json({
      ok: true,
      result,
      rateLimit: usage,
      genericRateLimit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected API error.";
    const isConflict = message.toLowerCase().includes("already exists");
    const isRateLimited = message.toLowerCase().includes("rate limit exceeded");
    const status = isConflict ? 409 : isRateLimited ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
