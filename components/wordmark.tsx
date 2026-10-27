import Link from "next/link";
import { Syne } from "next/font/google";
import { cn } from "@/lib/utils";

// Display face for the name only; the UI stays on Geist.
const syne = Syne({ subsets: ["latin"], weight: ["500", "800"], display: "swap" });

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/" aria-label="NIFLheim Studio, home" className={cn("group flex items-center gap-2", className)}>
      <span className={cn(syne.className, "text-[17px] leading-none tracking-tight")}>
        <span className="font-extrabold text-foreground">NIFL</span>
        <span className="font-medium text-primary/85 transition-colors group-hover:text-primary">heim</span>
      </span>
      <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] leading-none tracking-[0.2em] text-muted-foreground uppercase">
        Studio
      </span>
    </Link>
  );
}
