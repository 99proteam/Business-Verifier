import { NextRequest, NextResponse } from "next/server";
import {
  fetchMembershipBusinessProgram,
  registerMembershipApiUsage,
  validateVerifierMembershipDiscount,
} from "@/lib/firebase/repositories";
import { enforceApiRateLimit, getRequestIdentifier } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

function asPositiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getRateLimit() {
  const parsed = Number(process.env.MEMBERSHIP_API_RATE_LIMIT_PER_10_MIN ?? "300");
  if (!Number.isFinite(parsed) || parsed <= 0) return 300;
  return Math.floor(parsed);
}

export async function POST(request: NextRequest) {
  try {
    const genericRateLimit = await enforceApiRateLimit({
      scope: "membership_discount_validate",
      identifier: getRequestIdentifier(request),
      limit: Number(process.env.GENERIC_API_RATE_LIMIT_PER_10_MIN ?? "200"),
      windowMinutes: 10,
    });

    const body = (await request.json()) as Record<string, unknown>;
    const businessOwnerUid = String(body.businessOwnerUid ?? "").trim();
    const customerPublicId = String(body.customerPublicId ?? "").trim();
    const integrationApiKey = String(
      request.headers.get("x-verifier-api-key") ?? body.integrationApiKey ?? "",
    ).trim();
    const source = body.source === "offline" ? "offline" : "online";
    const transactionValue = asPositiveNumber(body.transactionValue);
    const externalOrderId = body.externalOrderId
      ? String(body.externalOrderId).trim()
      : undefined;

    if (!businessOwnerUid || !integrationApiKey || !customerPublicId || !transactionValue) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Required fields: businessOwnerUid, integrationApiKey (or x-verifier-api-key), customerPublicId, transactionValue.",
        },
        { status: 400 },
      );
    }

    const program = await fetchMembershipBusinessProgram(businessOwnerUid);
    if (!program || program.status !== "active") {
      return NextResponse.json(
        { ok: false, error: "Business membership program is inactive or not configured." },
        { status: 403 },
      );
    }
    if (program.integrationApiKey !== integrationApiKey) {
      return NextResponse.json({ ok: false, error: "Invalid integration API key." }, { status: 401 });
    }

    const limit = getRateLimit();
    const usage = await registerMembershipApiUsage({
      businessOwnerUid,
      endpoint: "discount_validate",
      limit,
      windowMinutes: 10,
      metadata: {
        source,
        hasExternalOrderId: Boolean(externalOrderId),
      },
    });

    const result = await validateVerifierMembershipDiscount({
      businessOwnerUid,
      integrationApiKey,
      customerPublicId,
      transactionValue,
      source,
      externalOrderId,
    });

    return NextResponse.json({
      ok: true,
      result,
      rateLimit: usage,
      genericRateLimit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected API error.";
    const status = message.toLowerCase().includes("rate limit exceeded") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
