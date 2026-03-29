import { NextRequest, NextResponse } from "next/server";
import {
  fetchMembershipEconomicsSettings,
  generateInvoicesForAllBusinesses,
  generateMembershipDistributionCycle,
  recordAutomationJobRun,
  releaseDueEscrowOrders,
  releaseMaturedProDeposits,
  runBillingMaintenance,
} from "@/lib/firebase/repositories";
import { sendOpsAlert } from "@/lib/server/ops/alerts";

export const runtime = "nodejs";

function monthKeyFromDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function distributionRange(cycleMonths: number) {
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

function readBearerToken(value: string) {
  const raw = value.trim();
  if (!raw.toLowerCase().startsWith("bearer ")) return "";
  return raw.slice(7).trim();
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = String(searchParams.get("token") ?? "").trim();
  const expectedPublic = process.env.CRON_PUBLIC_TRIGGER_TOKEN?.trim() ?? "";
  const expectedCron = process.env.CRON_SECRET?.trim() ?? "";
  const bearer = readBearerToken(String(request.headers.get("authorization") ?? ""));
  const allowed = [expectedPublic, expectedCron].filter(Boolean);
  const authorized =
    Boolean(allowed.length) && (allowed.includes(token) || allowed.includes(bearer));
  if (!authorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron token." }, { status: 401 });
  }

  const source = "vercel_cron";
  const adminUid = "system-cron";
  const adminName = "System Cron";
  const monthKey = searchParams.get("monthKey")?.trim() || undefined;

  try {
    const [invoiceIds, escrowResult, depositResult, billingResult] = await Promise.all([
      generateInvoicesForAllBusinesses(monthKey),
      releaseDueEscrowOrders({ adminUid, adminName }),
      releaseMaturedProDeposits({ actorUid: adminUid, actorRole: "system" }),
      runBillingMaintenance({ adminUid }),
    ]);

    await recordAutomationJobRun({
      jobKey: "automation_bundle",
      source,
      status: "success",
      summary: "Automation bundle executed.",
      metadata: {
        invoicesGenerated: invoiceIds.length,
        escrowReleased: escrowResult.released,
        depositsReleased: depositResult.released,
        reminders: billingResult.remindersSent,
      },
    });

    let distributionResult: Record<string, unknown> | null = null;
    if (String(process.env.CRON_ENABLE_DISTRIBUTION ?? "true").toLowerCase() !== "false") {
      const settings = await fetchMembershipEconomicsSettings();
      const range = distributionRange(settings.distributionCycleMonths);
      const cycleKey = `${range.startMonthKey}_${range.endMonthKey}`;
      try {
        const cycle = await generateMembershipDistributionCycle({
          adminUid,
          startMonthKey: range.startMonthKey,
          endMonthKey: range.endMonthKey,
          cycleKey,
        });
        distributionResult = {
          cycleId: cycle.cycleId,
          cycleKey,
          status: "generated",
          participants: cycle.participantsCount,
          eligibleBusinesses: cycle.eligibleBusinessesCount,
        };
        await recordAutomationJobRun({
          jobKey: "membership_distribution",
          source,
          status: "success",
          summary: "Distribution cycle evaluated.",
          metadata: distributionResult,
        });
      } catch (distributionError) {
        const message =
          distributionError instanceof Error ? distributionError.message : "Unknown distribution error.";
        if (!message.toLowerCase().includes("already exists")) {
          await recordAutomationJobRun({
            jobKey: "membership_distribution",
            source,
            status: "failed",
            summary: message,
          });
          await sendOpsAlert({
            title: "Membership distribution failed",
            message,
            level: "critical",
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      source,
      result: {
        invoicesGenerated: invoiceIds.length,
        escrowResult,
        depositResult,
        billingResult,
        distributionResult,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected cron system error.";
    await recordAutomationJobRun({
      jobKey: "automation_bundle",
      source,
      status: "failed",
      summary: message,
    });
    await sendOpsAlert({
      title: "Automation bundle failed",
      message,
      level: "critical",
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
