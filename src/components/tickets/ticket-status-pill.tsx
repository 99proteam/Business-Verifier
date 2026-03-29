import { cn } from "@/lib/utils";
import { SupportTicketStatus } from "@/lib/firebase/repositories";

const STATUS_LABELS: Record<SupportTicketStatus, string> = {
  open: "Open",
  in_discussion: "In discussion",
  awaiting_admin: "Awaiting admin",
  resolved: "Resolved",
  refunded: "Refunded",
  closed: "Closed",
};

const STATUS_CLASS: Record<SupportTicketStatus, string> = {
  open: "bg-blue-100 text-blue-700",
  in_discussion: "bg-amber-100 text-amber-700",
  awaiting_admin: "bg-violet-100 text-violet-700",
  resolved: "bg-emerald-100 text-emerald-700",
  refunded: "bg-green-100 text-green-700",
  closed: "bg-zinc-200 text-zinc-700",
};

export function TicketStatusPill({ status }: { status: SupportTicketStatus }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-1 text-xs font-medium",
        STATUS_CLASS[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
