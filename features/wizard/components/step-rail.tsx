import Link from "next/link";
import { STEPS, type StepSlug } from "@/lib/steps";
import { cn } from "@/lib/utils";

export function StepRail({ projectId, active }: { projectId: string; active: StepSlug }) {
  return (
    <nav aria-label="Steps" className="flex gap-1 overflow-x-auto pb-1">
      {STEPS.map((s) => {
        const isActive = s.slug === active;
        const body = (
          <>
            <span className="font-mono text-[11px] text-muted-foreground">{s.n}</span>
            {s.title}
          </>
        );
        const cls = cn(
          "flex shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 text-sm",
          isActive ? "border-ring/60 bg-card text-foreground" : "border-transparent text-muted-foreground",
          !s.ready && "opacity-50",
        );
        return s.ready ? (
          <Link key={s.slug} href={`/p/${projectId}/${s.slug}`} className={cn(cls, !isActive && "hover:text-foreground")}>
            {body}
          </Link>
        ) : (
          <span key={s.slug} className={cls} title="Soon">
            {body}
          </span>
        );
      })}
    </nav>
  );
}
