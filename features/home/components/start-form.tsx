"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, ImageUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LoadingDots } from "@/components/loading-dots";
import { More } from "@/components/section";
import { chip } from "@/features/scene/components/chip";
import { CHARACTER_TEMPLATES } from "@/features/character/templates";
import { STYLES } from "@/lib/styles";
import { startCharacter } from "../actions/start-character";

const first = CHARACTER_TEMPLATES[0];
const COUNTS = [1, 2, 4, 6];

// Screen one, Person: a sentence or a photo and one Generate. Before a project exists the photo
// stays in the browser and goes up with the first Generate. Style and how many wait behind More.
export function StartForm() {
  const [prompt, setPrompt] = useState(first.prompt);
  const [style, setStyle] = useState(first.style);
  const [count, setCount] = useState(4);
  const [reference, setReference] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // The preview URL is made when the file is chosen and released when it is replaced or the page goes.
  const url = useRef<string | null>(null);
  const choose = (f: File | null) => {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = f ? URL.createObjectURL(f) : null;
    setReference(f);
    setPreview(url.current);
  };
  useEffect(() => () => void (url.current && URL.revokeObjectURL(url.current)), []);

  const ok = prompt.trim().length >= 3;
  return (
    <form
      className="flex w-full flex-col gap-3 text-left md:w-3/4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        setError(null);
        const form = new FormData();
        form.set("prompt", prompt.trim());
        form.set("style", style);
        form.set("count", String(count));
        if (reference) form.set("image", reference);
        start(async () => {
          const res = await startCharacter(form);
          if (res?.error) setError(res.error);
        });
      }}
    >
      <label htmlFor="prompt" className="sr-only">
        Describe your character
      </label>
      <Textarea
        id="prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        placeholder="Describe someone in one sentence..."
        className="resize-none px-4 py-3 text-lg md:text-lg"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        {preview && (
          <span className="flex items-center gap-2 rounded-lg border bg-card/60 py-1 pr-2 pl-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Your photo" className="h-10 w-[31px] rounded-md border bg-white object-cover" />
            <span className="text-xs">Follows this photo</span>
            <button type="button" aria-label="Remove the photo" disabled={pending} onClick={() => choose(null)} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </span>
        )}
        <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground">
          <ImageUp className="size-3.5" />
          {preview ? "Another photo" : "Or use a photo"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={pending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) choose(f);
            }}
          />
        </label>
      </div>

      <div className="flex items-center justify-end gap-3 border-t pt-3">
        <Button type="submit" size="lg" disabled={pending || !ok}>
          {pending ? <LoadingDots /> : null}
          Generate
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <More summary="style, how many pictures">
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3">
          <span className="text-xs text-muted-foreground">Style</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {STYLES.map((s) => (
              <button key={s.id} type="button" aria-pressed={style === s.id} onClick={() => setStyle(s.id)} className={chip(style === s.id)}>
                {s.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">How many</span>
          <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="How many pictures">
            {COUNTS.map((n) => (
              <button key={n} type="button" role="radio" aria-checked={count === n} onClick={() => setCount(n)} className={`${chip(count === n)} min-w-8 font-mono`}>
                {n}
              </button>
            ))}
          </div>
        </div>
      </More>
    </form>
  );
}
