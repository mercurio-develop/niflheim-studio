"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SceneAsset } from "@/lib/store";
import { slug } from "../ingredients";

type Props = Omit<React.ComponentProps<typeof Input>, "onChange" | "value"> & { value: string; onValue: (v: string) => void; assets: SceneAsset[]; fileUrl: (f: string) => string };

// The word being typed after an @ at the caret, if any.
const handleAt = (text: string, caret: number) => /@([\w-]*)$/.exec(text.slice(0, caret));

// A text input where @ lists the scene's assets that have a picture; picking one writes @slug, which
// resolveHandles sends as that asset's picture with the take.
export function HandleInput({ value, onValue, assets, fileUrl, onKeyDown, className, ...rest }: Props) {
  const [caret, setCaret] = useState(0);
  const [at, setAt] = useState(0);
  const m = handleAt(value, caret);
  const options = m ? assets.filter((a) => a.image && slug(a.name).startsWith(slug(m[1]))).slice(0, 6) : [];
  const open = options.length > 0;
  const pick = (a: SceneAsset) => {
    if (!m) return;
    const start = caret - m[0].length;
    const next = `${value.slice(0, start)}@${slug(a.name)} ${value.slice(caret)}`;
    onValue(next);
    setCaret(start + slug(a.name).length + 2);
  };
  return (
    <div className="relative">
      <Input
        {...rest}
        value={value}
        className={className}
        onChange={(e) => (onValue(e.target.value), setCaret(e.target.selectionStart ?? e.target.value.length), setAt(0))}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              return setAt((i) => (i + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              return pick(options[at % options.length]);
            }
            if (e.key === "Escape") {
              e.preventDefault();
              return setCaret(0);
            }
          }
          onKeyDown?.(e);
        }}
      />
      {open && (
        <div role="listbox" aria-label="Scene assets" className="absolute bottom-full left-0 z-30 mb-1 flex min-w-40 flex-col gap-0.5 rounded-md border bg-background p-1 shadow-md">
          {options.map((a, i) => (
            <button key={a.id} type="button" role="option" aria-selected={i === at % options.length} onMouseDown={(e) => (e.preventDefault(), pick(a))} className={cn("flex items-center gap-2 rounded-sm px-1.5 py-1 text-left text-xs", i === at % options.length ? "bg-accent text-accent-foreground" : "hover:bg-accent/60")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileUrl(a.image!)} alt="" className="size-6 rounded-sm border object-contain" />
              <span className="truncate">{a.name}</span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">@{slug(a.name)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
