"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import type { StepState } from "../queries/project-steps";

const MARK = { empty: "○", done: "●", stale: "◐" } as const;
const TEXT = { empty: "not started", done: "saved", stale: "stale" } as const;

export function StepRail({ projectId, steps }: { projectId: string; steps: StepState[] }) {
  const current = useSelectedLayoutSegment();
  return (
    <nav aria-label="Steps" className="w-56 shrink-0 border-r p-4">
      <ol className="flex flex-col gap-1">
        {steps.map((s, i) => (
          <li key={s.slug}>
            <Link
              href={`/p/${projectId}/${s.slug}`}
              aria-current={s.slug === current ? "step" : undefined}
              data-status={s.status}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-[current=step]:bg-foreground/10 data-[status=empty]:opacity-60"
            >
              <span aria-hidden>{MARK[s.status]}</span>
              <span className="flex-1">{i + 1}. {s.label}</span>
              <span className="text-xs opacity-70">{TEXT[s.status]}</span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
