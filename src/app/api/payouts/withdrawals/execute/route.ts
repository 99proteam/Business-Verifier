import { NextRequest, NextResponse } from "next/server";
import {
  attachPayoutProviderReference,
  executePayoutForWithdrawalRequest,
  finalizePayoutSettlement,
} from "@/lib/firebase/repositories";
import { enforceApiRateLimit, getRequestIdentifier } from "@/lib/api/rate-limit";
import { AuthApiError, requireAdminAuth } from "@/lib/server/auth";
import { createRazorpayXPayout } from "@/lib/server/payments/razorpay";

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
    const requestedAdminUid = String(body.adminUid ?? "").trim();
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

    const result = await executePayoutForWithdrawalRequest({
      requestId,
      adminUid: admin.uid,
    });

    if (result.provider === "razorpay" && result.status === "processing") {
      const method = String(result.request.method ?? "").toLowerCase();
      const mode = method.includes("upi") ? "upi" : "bank_account";
      try {
        const payout = await createRazorpayXPayout({
          amountInPaise: Math.round(Number(result.request.netAmount ?? 0) * 100),
          withdrawalId: String(result.request.id ?? requestId),
          ownerName: String(result.request.ownerName ?? "User"),
          ownerEmail: String(result.request.ownerEmail ?? ""),
          mode,
          accountDetails: (result.request.accountDetails as Record<string, string>) ?? {},
        });
        await attachPayoutProviderReference({
          payoutId: String(result.payoutId),
          providerPayoutId: payout.id,
          metadata: {
            providerStatus: payout.status,
            mode,
          },
        });
        if (["processed", "completed", "success"].includes(payout.status)) {
          await finalizePayoutSettlement({
            payoutId: String(result.payoutId),
            providerPayoutId: payout.id,
            status: "success",
            actorUid: "payout-execute-api",
            actorRole: "system",
          });
        }
      } catch (providerError) {
        const reason =
          providerError instanceof Error ? providerError.message : "Payout provider request failed.";
        await finalizePayoutSettlement({
          payoutId: String(result.payoutId),
          status: "failed",
          failureReason: reason,
          actorUid: "payout-execute-api",
          actorRole: "system",
        });
        return NextResponse.json({ ok: false, error: reason }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, result, rateLimit });
  } catch (error) {
    if (error instanceof AuthApiError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unexpected payout API error.";
    const status = message.toLowerCase().includes("rate limit exceeded") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
