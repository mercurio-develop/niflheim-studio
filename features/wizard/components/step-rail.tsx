import Link from "next/link";
import { Check } from "lucide-react";
import type { StepState } from "@/lib/progress";
import { STEPS, type StepSlug } from "@/lib/steps";
import { cn } from "@/lib/utils";

// The wizard as a timeline: done (accent, check), stale (made from an older step), current
// (accent ring + pulse), next (hollow). The accent line fills up to the current step.
export function StepRail(props: { projectId: string; active: StepSlug; states: Partial<Record<StepSlug, StepState>> }) {
  const at = STEPS.findIndex((s) => s.slug === props.active);
  return (
    <nav aria-label="Steps" className="nifl-enter -mx-4 overflow-x-auto px-4 pt-3 pb-2">
      <ol className="relative flex min-w-[52rem] items-start">
        <div aria-hidden className="absolute top-[1.125rem] right-[6.25%] left-[6.25%] h-0.5 rounded-full bg-border" />
        <div
          aria-hidden
          className="absolute top-[1.125rem] left-[6.25%] h-0.5 rounded-full bg-primary transition-[width] duration-700 ease-out"
          style={{ width: `${(at / (STEPS.length - 1)) * 87.5}%` }}
        />
        {STEPS.map((s, i) => {
          const state = props.states[s.slug] ?? "todo";
          const current = i === at;
          const dot = (
            <span
              className={cn(
                "relative z-10 flex size-9 items-center justify-center rounded-full border-2 bg-background text-xs transition-colors",
                state === "done" && "border-primary bg-primary text-primary-foreground",
                state === "stale" && "border-dashed border-primary text-primary",
                current && state !== "done" && "border-primary text-primary ring-4 ring-primary/15",
                !current && state === "todo" && "border-border text-muted-foreground",
              )}
            >
              {state === "done" ? <Check className="size-4" strokeWidth={3} /> : <span className="font-mono">{s.n}</span>}
              {current && <span className="absolute -inset-0.5 animate-ping rounded-full border border-primary/40 [animation-duration:2.4s]" />}
            </span>
          );
          const label = (
            <span className={cn("text-sm", current ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {s.title}
              {state === "stale" && <span className="block font-mono text-[11px] text-primary">out of date</span>}
            </span>
          );
          const cls = "flex flex-1 flex-col items-center gap-2.5 text-center";
          return (
            <li key={s.slug} className="flex flex-1">
              {s.ready ? (
                <Link href={`/p/${props.projectId}/${s.slug}`} className={cn(cls, "group")} aria-current={current ? "step" : undefined}>
                  {dot}
                  <span className="transition-colors group-hover:text-foreground">{label}</span>
                </Link>
              ) : (
                <span className={cn(cls, "opacity-45")} title="Soon">
                  {dot}
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
