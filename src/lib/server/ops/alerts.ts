export async function sendOpsAlert(payload: {
  title: string;
  message: string;
  level?: "info" | "warning" | "critical";
  metadata?: Record<string, string | number | boolean | null>;
}) {
  const webhookUrl = process.env.OPS_ALERT_WEBHOOK_URL?.trim();
  if (!webhookUrl) return;

  const body = {
    title: payload.title,
    message: payload.message,
    level: payload.level ?? "warning",
    metadata: payload.metadata ?? {},
    sentAt: new Date().toISOString(),
  };

  await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}
