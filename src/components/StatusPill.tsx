import { STATUS_LABEL, type IdeaStatus } from "@/lib/types";

const DOT: Record<IdeaStatus, string> = {
  spark: "bg-ember",
  exploring: "bg-[#4f5bd5]",
  parked: "bg-[#7c8794]",
  activated: "bg-[#2f8f5b]",
  archived: "bg-muted",
};

export function StatusPill({ status }: { status: IdeaStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-xs text-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[status]}`} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}
