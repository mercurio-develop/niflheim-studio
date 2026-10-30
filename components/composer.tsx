"use client";

import { useState } from "react";
import { ArrowRight, ImageUp, PenLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionFire } from "@/components/section";
import { Textarea } from "@/components/ui/textarea";
import { LoadingDots } from "@/components/loading-dots";
import { STYLES } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { SketchPad } from "@/components/sketch-pad";

export type ComposerValues = { prompt: string; style: string; count: number };

const COUNTS = [1, 2, 4, 6];

// Describe a character: prompt, style, an optional sketch or image to follow, how many, Generate.
// One component for the home page and step 01, so both always offer the same thing. It holds
// only its own inputs; where the reference lives (browser or project) is the caller's business.
export function Composer(props: {
  id: string;
  defaults: ComposerValues;
  reference: string | null; // URL of the current reference, if any
  onReference: (image: File) => void;
  onClearReference: () => void;
  onGenerate: (values: ComposerValues) => void;
  busy: boolean;
  pending: boolean;
  error?: string | null;
  templates?: readonly { id: string; label: string; prompt: string; style: string }[]; // always-on chips: fill prompt + style
  large?: boolean; // the home page: a taller field and bigger text, no box around it
}) {
  const [prompt, setPrompt] = useState(props.defaults.prompt);
  const [style, setStyle] = useState(props.defaults.style);
  const [count, setCount] = useState(props.defaults.count);
  const [sketching, setSketching] = useState(false);
  const perImage = props.reference ? 22 : 12; // seconds: a sketch is one Qwen edit per concept
  const chip = (on: boolean, tone = "border-primary bg-primary text-primary-foreground") =>
    cn("rounded-full border px-2.5 py-0.5 text-xs transition-colors", on ? tone : "text-muted-foreground hover:border-ring/60 hover:text-foreground");

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (prompt.trim().length >= 3) props.onGenerate({ prompt: prompt.trim(), style, count });
      }}
    >
      <label htmlFor={props.id} className="sr-only">
        Describe your character
      </label>
      <Textarea
        id={props.id}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={props.large ? 3 : 2}
        placeholder="Describe your character..."
        className={cn("resize-none text-base", props.large && "px-4 py-3 text-lg md:text-lg")}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
        }}
      />
      {props.templates && (
        <div className="-mt-1 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Try the app</span>
          {props.templates.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={prompt === t.prompt && style === t.style}
              onClick={() => {
                setPrompt(t.prompt);
                setStyle(t.style);
              }}
              className={chip(prompt === t.prompt && style === t.style)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Options: one label column, one control column, the same rhythm on every row. */}
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3 pt-1">
        <span className="text-xs text-muted-foreground">Reference</span>
        <div className="flex min-h-8 flex-wrap items-center gap-2">
          {props.reference && (
            <span className="flex items-center gap-2 rounded-lg border bg-card/60 py-1 pr-2 pl-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={props.reference} alt="Your reference" className="h-10 w-[31px] rounded-md border bg-white object-cover" />
              <span className="text-xs">Concepts follow this</span>
              <button type="button" aria-label="Remove the reference" disabled={props.busy} onClick={props.onClearReference} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
                <X className="size-3.5" />
              </button>
            </span>
          )}
          <Button type="button" variant="outline" size="sm" disabled={props.busy} onClick={() => setSketching(true)}>
            <PenLine data-icon="inline-start" />
            {props.reference ? "New sketch" : "Draw a sketch"}
          </Button>
          <label className={cn("inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground", props.busy && "pointer-events-none opacity-50")}>
            <ImageUp className="size-3.5" />
            Upload
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) props.onReference(f);
              }}
            />
          </label>
          {!props.reference && <span className="text-xs text-muted-foreground">optional: concepts follow its pose</span>}
        </div>

        <span className="text-xs text-muted-foreground">Style</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {STYLES.map((s) => (
            <button key={s.id} type="button" aria-pressed={style === s.id} onClick={() => setStyle(s.id)} className={chip(style === s.id)}>
              {s.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-muted-foreground">How many</span>
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="How many concepts">
          {COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={count === n}
              onClick={() => setCount(n)}
              className={cn(chip(count === n, "border-tone-yellow bg-tone-yellow text-background"), "min-w-8 font-mono")}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <SectionFire hint={`~${Math.max(1, Math.round((10 + count * perImage) / 10) * 10)} s · earlier sets are kept`}>
        <Button type="submit" size="lg" disabled={props.busy || prompt.trim().length < 3}>
          {props.pending ? <LoadingDots /> : null}
          Generate
          <ArrowRight data-icon="inline-end" />
        </Button>
      </SectionFire>
      {props.error && <p className="text-sm text-destructive">{props.error}</p>}

      {sketching && (
        <SketchPad
          onClose={() => setSketching(false)}
          onDone={(png) => {
            setSketching(false);
            props.onReference(new File([png], "sketch.png", { type: "image/png" }));
          }}
        />
      )}
    </form>
  );
}
