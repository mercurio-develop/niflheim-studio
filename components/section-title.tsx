import { cn } from "@/lib/utils";

// A numbered section heading with its colour dot and one short line.
export function SectionTitle(props: { n: string; tone: string; title: string; line?: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      {props.n ? (
        <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold text-background", props.tone)}>{props.n}</span>
      ) : (
        <span className={cn("mt-2 ml-2 size-2 shrink-0 rounded-full", props.tone)} />
      )}
      <div className="min-w-0">
        <h2 className="text-base font-semibold leading-6">{props.title}</h2>
        {props.line && <p className="truncate text-sm text-muted-foreground">{props.line}</p>}
      </div>
    </div>
  );
}

// Generate: one composer (prompt + style), one primary button. Earlier sets stay browsable;
// after a pick the section folds to a thumbnail strip with "New concepts".
