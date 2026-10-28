export type RailStep = { id: string; n: string; title: string; href?: string; ready?: boolean };

export function StepRail({ steps, active }: { steps: RailStep[]; active: string }) {
  return (
    <nav aria-label="Steps" className="flex gap-1 overflow-x-auto pb-1">
      {steps.map((s) => {
        const isActive = s.id === active;
        const ready = s.ready !== false;
        const cls = [
          "flex shrink-0 items-center gap-2 rounded-[var(--radius)] border px-3 py-1.5 font-sans text-sm",
          isActive ? "border-border bg-surface text-text" : "border-transparent text-muted",
          !ready && "opacity-50",
        ].filter(Boolean).join(" ");
        const body = (
          <>
            <span className="font-mono text-[11px] text-muted">{s.n}</span>
            {s.title}
          </>
        );
        return s.href && ready ? (
          <a key={s.id} href={s.href} className={isActive ? cls : `${cls} hover:text-text`}>{body}</a>
        ) : (
          <span key={s.id} className={cls} title={ready ? undefined : "Soon"}>{body}</span>
        );
      })}
    </nav>
  );
}

export default StepRail;
