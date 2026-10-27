"use client";

import { useState, useTransition } from "react";
import { Columns2, PanelRightClose, PanelRightOpen } from "lucide-react";
import { CompareView } from "@/components/compare-view";
import { FadeImage } from "@/components/fade-image";
import type { Version } from "@/lib/store";
import { cn } from "@/lib/utils";
import { KIND_DOT, versionKind } from "@/lib/versions";
import { selectVersion } from "../actions/character";

// Every pick and edit, newest first, coloured by what made it. Click one to carry on from it,
// or turn on Compare and pick two to swipe between them. Collapses to a thin rail.
export function VersionsSidebar(props: { projectId: string; versions: Version[]; current: number | null; busy: boolean }) {
  const [open, setOpen] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const order = props.versions.map((v, i) => [v, i] as const).reverse();
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const side = (i: number) => {
    const v = props.versions[i];
    return { src: file(v.image), label: `v${i + 1} · ${v.label}`, dot: KIND_DOT[versionKind(v)] };
  };

  const click = (i: number) => {
    if (!comparing) return start(() => selectVersion(props.projectId, i).catch((e: Error) => setError(e.message)));
    setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i].slice(-2)));
  };

  return (
    <aside
      className={cn(
        "nifl-enter flex flex-col gap-3 transition-[width] duration-500 ease-out lg:sticky lg:top-20 lg:mt-[5.25rem] lg:max-h-[calc(100svh-7rem)]",
        open ? "lg:w-60" : "lg:w-16",
      )}
      style={{ "--i": 2 } as React.CSSProperties}
    >
      <div className={cn("flex items-center gap-2", open ? "justify-between" : "justify-center")}>
        {open && <h2 className="text-sm font-semibold">History</h2>}
        <div className="flex items-center gap-1">
          {open && props.versions.length > 1 && (
            <button
              type="button"
              onClick={() => {
                setComparing(!comparing);
                setPicked([]);
              }}
              aria-pressed={comparing}
              className={cn(
                "flex items-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors",
                comparing ? "bg-tone-cyan/20 text-tone-cyan" : "text-muted-foreground hover:bg-card hover:text-foreground",
              )}
            >
              <Columns2 className="size-3.5" />
              Compare two
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={open ? "Collapse history" : "Expand history"}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 font-mono text-xs text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
          >
            {props.versions.length}
            {open ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
          </button>
        </div>
      </div>
      {open && comparing && (
        <p className="rounded-md bg-tone-cyan/10 px-2 py-1.5 text-xs text-tone-cyan">
          {picked.length === 0 ? "Pick two versions to compare." : picked.length === 1 ? "Now pick the second one." : "Opening..."}
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {props.versions.length === 0 ? (
        open && <p className="text-sm text-muted-foreground">Every pick and edit lands here. You can always go back.</p>
      ) : (
        <ol className={cn("nifl-scroll flex gap-2 overflow-x-auto pb-1 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto", open ? "lg:pr-1" : "lg:items-center")}>
          {order.map(([v, i]) => {
            const kind = versionKind(v);
            const chosen = picked.includes(i);
            return (
              <li key={v.image + i} className="shrink-0">
                <button
                  type="button"
                  disabled={pending || (!comparing && props.busy)}
                  onClick={() => click(i)}
                  aria-current={i === props.current}
                  aria-pressed={comparing ? chosen : undefined}
                  title={v.label}
                  className={cn(
                    "relative flex items-center gap-3 rounded-lg border text-left transition-colors disabled:opacity-60",
                    open ? "w-44 p-1.5 lg:w-full" : "w-auto p-1",
                    chosen ? "border-tone-cyan bg-tone-cyan/10" : i === props.current ? "border-primary/70 bg-card" : "border-transparent hover:border-border hover:bg-card/60",
                  )}
                >
                  <FadeImage src={file(v.image)} alt={v.label} className={cn("shrink-0 rounded-md border object-cover", open ? "h-16 w-12" : "h-12 w-9")} />
                  {!open && <span className={cn("absolute right-0.5 bottom-0.5 size-2 rounded-full ring-2 ring-background", KIND_DOT[kind])} />}
                  {chosen && (
                    <span className="absolute top-1 left-1 flex size-5 items-center justify-center rounded-full bg-tone-cyan font-mono text-[10px] text-background">
                      {picked.indexOf(i) === 0 ? "A" : "B"}
                    </span>
                  )}
                  {open && (
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                        <span className={cn("size-1.5 rounded-full", KIND_DOT[kind])} />v{i + 1} · {kind}
                        {i === props.current ? " · now" : ""}
                      </span>
                      <span className="line-clamp-2 text-xs">{v.label.replace(/^Style: /, "")}</span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {comparing && picked.length === 2 && (
        <CompareView
          a={side(picked[0])}
          b={side(picked[1])}
          onClose={() => {
            setPicked([]);
            setComparing(false);
          }}
        />
      )}
    </aside>
  );
}
