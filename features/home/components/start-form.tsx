"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Composer } from "@/components/composer";
import { CHARACTER_TEMPLATES } from "@/features/character/templates";
import { startCharacter } from "../actions/start-character";

const first = CHARACTER_TEMPLATES[0];

// The same composer as step 01. Before a project exists the sketch stays in the browser and
// goes up with the first Generate.
export function StartForm() {
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

  return (
    <div className="w-full text-left md:w-3/4">
      <Composer
        id="prompt"
        large
        defaults={{ prompt: first.prompt, style: first.style, count: 1 }} // one concept: Generate then Edit opens
        reference={preview}
        onReference={(f) => choose(f)}
        onClearReference={() => choose(null)}
        onGenerate={(v) => {
          setError(null);
          const form = new FormData();
          form.set("prompt", v.prompt);
          form.set("style", v.style);
          form.set("count", String(v.count));
          if (reference) form.set("image", reference);
          start(async () => {
            const res = await startCharacter(form);
            if (res?.error) setError(res.error);
          });
        }}
        busy={pending}
        pending={pending}
        error={error}
        templates={CHARACTER_TEMPLATES}
      />
    </div>
  );
}
