import { NextRequest, NextResponse } from "next/server";
import {
  bulkCreateMembershipBusinessTransactions,
  createMembershipBusinessTransaction,
  fetchMembershipBusinessProgram,
  registerMembershipApiUsage,
} from "@/lib/firebase/repositories";
import { enforceApiRateLimit, getRequestIdentifier } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

type TxRowInput = {
  externalOrderId: string;
  transactionValue: number;
  customerPublicId?: string;
  occurredAt?: string;
};

function asPositiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeRow(value: unknown): TxRowInput | null {
  const row = value as Record<string, unknown>;
  const externalOrderId = String(row.externalOrderId ?? "").trim();
  const transactionValue = asPositiveNumber(row.transactionValue);
  if (!externalOrderId || !transactionValue) return null;
  return {
    externalOrderId,
    transactionValue,
    customerPublicId: row.customerPublicId
      ? String(row.customerPublicId).trim()
      : undefined,
    occurredAt: row.occurredAt ? String(row.occurredAt).trim() : undefined,
  };
}

function getRateLimit() {
  const parsed = Number(process.env.MEMBERSHIP_INGEST_RATE_LIMIT_PER_10_MIN ?? "120");
  if (!Number.isFinite(parsed) || parsed <= 0) return 120;
  return Math.floor(parsed);
}

export async function POST(request: NextRequest) {
  try {
    const genericRateLimit = await enforceApiRateLimit({
      scope: "membership_transactions_ingest",
      identifier: getRequestIdentifier(request),
      limit: Number(process.env.GENERIC_API_RATE_LIMIT_PER_10_MIN ?? "200"),
      windowMinutes: 10,
    });

    const body = (await request.json()) as Record<string, unknown>;
    const businessOwnerUid = String(body.businessOwnerUid ?? "").trim();
    const integrationApiKey = String(
      request.headers.get("x-verifier-api-key") ?? body.integrationApiKey ?? "",
    ).trim();
    const source = body.source === "offline" ? "offline" : "online";

    if (!businessOwnerUid || !integrationApiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Required fields: businessOwnerUid and integrationApiKey (or x-verifier-api-key).",
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

    const rowsInput = Array.isArray(body.rows) ? body.rows : null;
    const singleInput = body.row ? body.row : body;

    const limit = getRateLimit();
    const usage = await registerMembershipApiUsage({
      businessOwnerUid,
      endpoint: "transaction_ingest",
      limit,
      windowMinutes: 10,
      metadata: {
        source,
        isBulk: Boolean(rowsInput),
      },
    });

    if (rowsInput) {
      if (rowsInput.length > 1000) {
        return NextResponse.json(
          { ok: false, error: "Bulk ingest supports maximum 1000 rows per request." },
          { status: 400 },
        );
      }
      const rows = rowsInput
        .map((row) => normalizeRow(row))
        .filter((row): row is TxRowInput => Boolean(row));
      if (!rows.length) {
        return NextResponse.json(
          { ok: false, error: "No valid rows found in payload." },
          { status: 400 },
        );
      }
      const result = await bulkCreateMembershipBusinessTransactions({
        businessOwnerUid,
        source,
        rows,
      });
      return NextResponse.json({ ok: true, result, rateLimit: usage, genericRateLimit });
    }

    const row = normalizeRow(singleInput);
    if (!row) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Single ingest requires fields: externalOrderId and transactionValue. Optional: customerPublicId, occurredAt.",
        },
        { status: 400 },
      );
    }

    const transactionId = await createMembershipBusinessTransaction({
      businessOwnerUid,
      source,
      externalOrderId: row.externalOrderId,
      transactionValue: row.transactionValue,
      customerPublicId: row.customerPublicId,
      occurredAt: row.occurredAt,
    });

    return NextResponse.json({
      ok: true,
      result: { transactionId },
      rateLimit: usage,
      genericRateLimit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected API error.";
    const status = message.toLowerCase().includes("rate limit exceeded") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
