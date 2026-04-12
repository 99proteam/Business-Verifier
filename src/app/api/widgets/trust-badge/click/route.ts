import { NextRequest, NextResponse } from "next/server";
import { recordTrustBadgeWidgetEvent } from "@/lib/firebase/repositories";

export const runtime = "nodejs";

function sanitizeSlug(input: string) {
  const value = input.trim().toLowerCase();
  return /^[a-z0-9-]{2,120}$/.test(value) ? value : "";
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const businessId = String(searchParams.get("businessId") ?? "").trim();
  const slug = sanitizeSlug(String(searchParams.get("slug") ?? ""));

  if (businessId) {
    try {
      await recordTrustBadgeWidgetEvent({
        businessId,
        eventType: "click",
      });
    } catch {
      // Continue redirect even when tracking fails.
    }
  }

  const redirectPath = slug ? `/business/${slug}` : "/directory";
  return NextResponse.redirect(new URL(redirectPath, request.url), { status: 302 });
}
