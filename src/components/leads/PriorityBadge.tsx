import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  HOT: "bg-hot text-hot-foreground shadow-[0_0_0_3px_color-mix(in_oklab,var(--hot)_18%,transparent)]",
  WARM: "bg-warm text-warm-foreground",
  COOL: "bg-cool text-cool-foreground",
  COLD: "bg-cold text-cold-foreground",
};

export function PriorityBadge({ priority, className }: { priority: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest",
        styles[priority] ?? styles.COLD,
        className,
      )}
    >
      {priority === "HOT" && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
      {priority}
    </span>
  );
}
