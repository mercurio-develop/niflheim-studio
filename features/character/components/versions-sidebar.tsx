"use client";

import { useState, useTransition } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { FadeImage } from "@/components/fade-image";
import type { Version } from "@/lib/store";
import { cn } from "@/lib/utils";
import { selectVersion } from "../actions/character";

// Every pick and repaint, newest first. Click one to carry on from it. Collapses to a rail.
export function VersionsSidebar(props: { projectId: string; versions: Version[]; current: number | null; busy: boolean }) {
  const [open, setOpen] = useState(true);
  const [pending, start] = useTransition();
  const order = props.versions.map((v, i) => [v, i] as const).reverse();
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;

  return (
    <aside
      className={cn(
        "nifl-enter flex flex-col gap-3 transition-[width] duration-500 ease-out lg:sticky lg:top-20 lg:mt-[5.25rem] lg:max-h-[calc(100svh-7rem)]",
        open ? "lg:w-60" : "lg:w-14",
      )}
      style={{ "--i": 2 } as React.CSSProperties}
    >
      <div className="flex items-center justify-between gap-2">
        {open && <h2 className="text-sm font-medium">Versions</h2>}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? "Collapse versions" : "Expand versions"}
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 font-mono text-xs text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        >
          {props.versions.length}
          {open ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
        </button>
      </div>
      {props.versions.length === 0 ? (
        open && <p className="text-sm text-muted-foreground">Pick a concept to start. Every repaint lands here, and you can always go back.</p>
      ) : (
        <ol className="flex gap-2 overflow-auto pb-1 lg:flex-col">
          {order.map(([v, i]) => (
            <li key={v.image + i} className="nifl-enter shrink-0">
              <button
                type="button"
                disabled={pending || props.busy}
                onClick={() => start(() => selectVersion(props.projectId, i))}
                aria-current={i === props.current}
                title={v.label}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-1.5 text-left transition-colors disabled:opacity-60",
                  open ? "w-44 lg:w-full" : "w-auto",
                  i === props.current ? "border-foreground bg-card" : "border-transparent hover:border-border hover:bg-card/60",
                )}
              >
                <FadeImage src={file(v.image)} alt={v.label} className="h-16 w-12 shrink-0 rounded-md border object-cover" />
                {open && (
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      v{i + 1}
                      {i === props.current ? " · current" : ""}
                    </span>
                    <span className="line-clamp-2 text-xs">{v.label}</span>
                  </span>
                )}
              </button>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
