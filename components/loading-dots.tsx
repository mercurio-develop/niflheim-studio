import { cn } from "@/lib/utils";

// Three dots that bounce in turn: "working on it", small enough to sit inside a chip or button.
export function LoadingDots({ className }: { className?: string }) {
  return (
    <span role="presentation" className={cn("inline-flex items-center gap-[3px] align-middle", className)}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="nifl-dot size-[5px] rounded-full bg-current" style={{ animationDelay: `${i * 140}ms` }} />
      ))}
    </span>
  );
}
