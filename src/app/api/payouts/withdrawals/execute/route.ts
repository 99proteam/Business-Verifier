import { NextRequest, NextResponse } from "next/server";
import { executePayoutForWithdrawalRequest } from "@/lib/firebase/repositories";
import { enforceApiRateLimit, getRequestIdentifier } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceApiRateLimit({
      scope: "payouts_withdrawals_execute",
      identifier: getRequestIdentifier(request),
      limit: Number(process.env.PAYOUT_API_RATE_LIMIT_PER_10_MIN ?? "100"),
      windowMinutes: 10,
    });

    const body = (await request.json()) as Record<string, unknown>;
    const requestId = String(body.requestId ?? "").trim();
    const adminUid = String(body.adminUid ?? "").trim();
    if (!requestId || !adminUid) {
      return NextResponse.json(
        { ok: false, error: "Required fields: requestId, adminUid." },
        { status: 400 },
      );
    }

    const result = await executePayoutForWithdrawalRequest({
      requestId,
      adminUid,
    });
    return NextResponse.json({ ok: true, result, rateLimit });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected payout API error.";
    const status = message.toLowerCase().includes("rate limit exceeded") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
