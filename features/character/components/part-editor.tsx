"use client";

import { useState, useTransition } from "react";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Version } from "@/lib/store";
import { maskPart, swapPart } from "../actions/character";

const PARTS = ["hood", "hair", "face", "coat", "jacket", "shirt", "pants", "boots", "gloves", "belt", "bag", "weapon"];

export function PartEditor(props: {
  projectId: string;
  version: Version;
  masking: boolean;
  swapping: boolean;
}) {
  const [part, setPart] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [change, setChange] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const busy = pending || props.masking || props.swapping;
  const mask = part ? props.version.parts[part] : undefined;
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;

  const choose = (name: string) => {
    if (name !== part) setChange("");
    setPart(name);
    setError(null);
    if (!props.version.parts[name]) start(() => maskPart(props.projectId, name).catch((e: Error) => setError(e.message)));
  };

  return (
    <section className="grid gap-6 md:grid-cols-[minmax(0,22rem)_1fr]">
      <div className="relative overflow-hidden rounded-lg border bg-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={file(props.version.image)} alt={props.version.label} className="aspect-[7/9] w-full object-cover" />
        {mask && (
          <>
            {/* Spotlight: dim the whole figure, then show the part at full strength through its mask. */}
            <div aria-hidden className="absolute inset-0 bg-background/70" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              aria-hidden
              src={file(props.version.image)}
              alt=""
              className="absolute inset-0 aspect-[7/9] w-full object-cover"
              style={{ maskImage: `url(${file(mask)})`, maskMode: "luminance", maskSize: "cover", maskPosition: "center" }}
            />
          </>
        )}
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Parts</h2>
          <p className="text-sm text-muted-foreground">Pick a part to find it on the character, then say what it becomes.</p>
          <div className="flex flex-wrap gap-2">
            {PARTS.map((name) => (
              <button
                key={name}
                type="button"
                disabled={busy}
                onClick={() => choose(name)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50",
                  part === name ? "border-foreground text-foreground" : "text-muted-foreground hover:border-ring/60 hover:text-foreground",
                )}
              >
                {props.version.parts[name] ? "● " : ""}
                {name}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (custom.trim()) choose(custom.trim().toLowerCase());
            }}
          >
            <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Another part, e.g. scarf" className="max-w-56" />
            <Button type="submit" variant="outline" disabled={busy || !custom.trim()}>
              Find
            </Button>
          </form>
        </div>

        {part && (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              start(() =>
                swapPart(props.projectId, { part, change })
                  .then(() => setChange(""))
                  .catch((err: Error) => setError(err.message)),
              );
            }}
          >
            <label htmlFor="change" className="text-sm">
              Change the <span className="font-medium">{part}</span> into
            </label>
            <div className="flex gap-2">
              <Input
                id="change"
                value={change}
                onChange={(e) => setChange(e.target.value)}
                placeholder="a red leather coat with brass buttons"
              />
              <Button type="submit" disabled={busy || !mask || change.trim().length < 3}>
                <Wand2 data-icon="inline-start" />
                Swap
              </Button>
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              {props.masking ? `finding the ${part}...` : mask ? "only the highlighted area changes" : ""}
            </p>
          </form>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </section>
  );
}
