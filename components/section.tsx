"use client";

import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { SectionTitle } from "@/components/section-title";
import { cn } from "@/lib/utils";

// A step's section: numbered title, its line when open, a one-line summary when folded.
// `open` is where work is due: the section opens again whenever it turns true (a job starts,
// nothing picked yet); the user can still fold or open it by hand in between.
// id: an anchor for SectionNav, which opens the section before scrolling to it.
export function Section(props: {
  id?: string;
  n: string;
  tone: string;
  title: string;
  line?: string;
  summary?: React.ReactNode;
  open?: boolean;
  actions?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const due = props.open ?? true;
  const [open, setOpen] = useState(due);
  const [lastDue, setLastDue] = useState(due);
  if (due !== lastDue) {
    setLastDue(due);
    setOpen(due);
  }
  const body = useId();
  useEffect(() => {
    if (!props.id) return;
    const show = (e: Event) => (e as CustomEvent<string>).detail === props.id && setOpen(true);
    window.addEventListener(OPEN_SECTION, show);
    return () => window.removeEventListener(OPEN_SECTION, show);
  }, [props.id]);

  return (
    <section id={props.id} className={cn("flex min-w-0 scroll-mt-20 flex-col gap-3", props.className)} style={props.style}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={body}
          onClick={() => setOpen(!open)}
          className="group flex min-w-0 flex-1 items-start gap-1.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SectionTitle n={props.n} tone={props.tone} title={props.title} line={open ? props.line : undefined} />
          <ChevronDown aria-hidden className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:text-foreground", !open && "-rotate-90")} />
        </button>
        {open && props.actions && <div className="flex flex-wrap gap-1">{props.actions}</div>}
      </div>
      {!open && props.summary && (
        <button type="button" onClick={() => setOpen(true)} className="flex min-w-0 items-center gap-2 text-left text-sm text-muted-foreground hover:text-foreground">
          {props.summary}
        </button>
      )}
      <div id={body} hidden={!open} className="flex min-w-0 flex-col gap-4">
        {props.children}
      </div>
    </section>
  );
}

// SectionNav asks a section to open with this window event (detail: the section's id).
export const OPEN_SECTION = "nifl:open-section";

// Options and experiments a step does not need for its one job: folded until asked for.
// `open` works like Section's: it opens again whenever it turns true.
export function More(props: { label?: string; summary?: string; open?: boolean; children: React.ReactNode }) {
  const due = props.open ?? false;
  const [open, setOpen] = useState(due);
  const [lastDue, setLastDue] = useState(due);
  if (due !== lastDue) {
    setLastDue(due);
    setOpen(due);
  }
  const body = useId();
  return (
    <div className="flex min-w-0 flex-col gap-3 border-t pt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={body}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 self-start rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronDown aria-hidden className={cn("size-4 transition-transform", !open && "-rotate-90")} />
        {props.label ?? "More"}
        {!open && props.summary && <span className="truncate text-xs">· {props.summary}</span>}
      </button>
      <div id={body} hidden={!open} className="flex min-w-0 flex-col gap-4">
        {props.children}
      </div>
    </div>
  );
}
