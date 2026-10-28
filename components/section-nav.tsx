"use client";

import { useEffect, useState } from "react";
import { OPEN_SECTION } from "@/components/section";
import { cn } from "@/lib/utils";

export type NavItem = { id: string; n: string; title: string; tone: string };

// A step's sections as a sticky list: a click opens the section and scrolls to it; the one in view
// is marked. Wide screens only; on a phone the sections are one short column anyway.
export function SectionNav(props: { items: NavItem[] }) {
  const [active, setActive] = useState(props.items[0]?.id);
  const ids = props.items.map((i) => i.id).join(",");

  useEffect(() => {
    const els = ids.split(",").map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const seen = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting ? e.boundingClientRect.top : Infinity);
        const top = [...seen].filter(([, y]) => y !== Infinity).sort((a, b) => a[1] - b[1])[0];
        if (top) setActive(top[0]);
      },
      { rootMargin: "-80px 0px -45% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [ids]);

  const go = (id: string) => {
    window.dispatchEvent(new CustomEvent(OPEN_SECTION, { detail: id }));
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    setActive(id);
  };

  return (
    <nav aria-label="Sections" className="sticky top-20 hidden w-36 self-start lg:block">
      <ol className="flex flex-col gap-0.5 border-l">
        {props.items.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              onClick={() => go(i.id)}
              aria-current={active === i.id ? "location" : undefined}
              className={cn(
                "-ml-px flex w-full items-center gap-2 border-l-2 py-1.5 pl-3 text-left text-sm transition-colors",
                active === i.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <span className={cn("size-2 shrink-0 rounded-full", i.tone)} />
              <span className="font-mono text-[11px]">{i.n}</span>
              {i.title}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
