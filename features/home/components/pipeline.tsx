import { cn } from "@/lib/utils";
import { STEPS } from "@/lib/steps";

export function Pipeline() {
  return (
    <ol className="grid w-full grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
      {STEPS.map((s) => (
        <li key={s.slug} className="flex flex-col gap-2 bg-background p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">{s.n}</span>
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={cn("size-1.5 rounded-full border border-foreground/70", s.ready && "bg-foreground")} />
              {s.ready ? "ready" : "soon"}
            </span>
          </div>
          <span className="text-sm font-medium">{s.title}</span>
          <span className="text-xs leading-relaxed text-muted-foreground">{s.line}</span>
        </li>
      ))}
    </ol>
  );
}
