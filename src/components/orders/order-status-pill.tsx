import { OrderStatus } from "@/lib/firebase/repositories";
import { cn } from "@/lib/utils";

const LABELS: Record<OrderStatus, string> = {
  paid: "Paid (Escrow Locked)",
  refund_requested: "Refund Requested",
  refunded: "Refunded",
  released: "Released",
};

const CLASSES: Record<OrderStatus, string> = {
  paid: "bg-blue-100 text-blue-700",
  refund_requested: "bg-amber-100 text-amber-700",
  refunded: "bg-green-100 text-green-700",
  released: "bg-zinc-200 text-zinc-700",
};

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  return (
    <span className={cn("rounded-full px-2 py-1 text-xs font-medium", CLASSES[status])}>
      {LABELS[status]}
    </span>
  );
}
