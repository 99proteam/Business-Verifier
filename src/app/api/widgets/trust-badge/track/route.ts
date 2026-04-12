import { NextRequest, NextResponse } from "next/server";
import { recordTrustBadgeWidgetEvent } from "@/lib/firebase/repositories";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const businessId = String(body.businessId ?? "").trim();
    const eventTypeRaw = String(body.eventType ?? "impression").trim().toLowerCase();
    const eventType = eventTypeRaw === "click" ? "click" : "impression";

    if (!businessId) {
      return NextResponse.json(
        { ok: false, error: "businessId is required." },
        { status: 400 },
      );
    }

    const tracked = await recordTrustBadgeWidgetEvent({
      businessId,
      eventType,
    });

    return NextResponse.json({
      ok: tracked,
      eventType,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected widget tracking error.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
