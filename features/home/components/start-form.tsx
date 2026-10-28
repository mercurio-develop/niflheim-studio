"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Composer } from "@/components/composer";
import { startCharacter } from "../actions/start-character";

const EXAMPLES = [
  // The demo shot's character ("The Discovery").
  "a hulking forest troll with mossy grey-green skin, tusked underbite, bark-like shoulders, tattered hide loincloth, twigs in a shaggy mane",
  "a young lantern keeper in a hooded wool coat, leather satchel, tall boots",
  "a desert courier with a patched glider strapped to her back",
  "a clockwork knight with moss growing through the armour",
];

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
        defaults={{ prompt: EXAMPLES[0], style: "painterly", count: 4 }} // starts on the demo's troll; clear it for the examples
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
        examples={EXAMPLES}
      />
    </div>
  );
}
