import { NextRequest, NextResponse } from "next/server";
import { adminReviewWithdrawalRequest } from "@/lib/firebase/repositories";
import { enforceApiRateLimit, getRequestIdentifier } from "@/lib/api/rate-limit";
import { AuthApiError, requireAdminAuth } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceApiRateLimit({
      scope: "payouts_withdrawals_review",
      identifier: getRequestIdentifier(request),
      limit: Number(process.env.PAYOUT_API_RATE_LIMIT_PER_10_MIN ?? "100"),
      windowMinutes: 10,
    });

    const body = (await request.json()) as Record<string, unknown>;
    const requestId = String(body.requestId ?? "").trim();
    const requestedAdminUid = String(body.adminUid ?? "").trim();
    const action = body.action === "decline" ? "decline" : "approve";
    const note = String(body.note ?? "").trim();
    const admin = await requireAdminAuth(request);
    if (requestedAdminUid && requestedAdminUid !== admin.uid) {
      return NextResponse.json(
        { ok: false, error: "adminUid does not match authenticated admin user." },
        { status: 403 },
      );
    }
    if (!requestId) {
      return NextResponse.json(
        { ok: false, error: "Required fields: requestId." },
        { status: 400 },
      );
    }

    const result = await adminReviewWithdrawalRequest({
      adminUid: admin.uid,
      requestId,
      action,
      note,
    });
    return NextResponse.json({ ok: true, result, rateLimit });
  } catch (error) {
    if (error instanceof AuthApiError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unexpected review API error.";
    const status = message.toLowerCase().includes("rate limit exceeded") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
