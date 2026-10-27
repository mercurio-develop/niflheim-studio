"use client";

import { useActionState, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LoadingDots } from "@/components/loading-dots";
import { startCharacter, type StartState } from "../actions/start-character";

const EXAMPLES = [
  "a young lantern keeper in a hooded wool coat, leather satchel, tall boots",
  "a desert courier with a patched glider strapped to her back",
  "a clockwork knight with moss growing through the armour",
];

export function StartForm() {
  const [state, action, pending] = useActionState<StartState, FormData>(startCharacter, {});
  const ref = useRef<HTMLTextAreaElement>(null);

  return (
    <form action={action} className="w-full max-w-2xl">
      <div className="rounded-xl border bg-card/60 p-2 shadow-[0_0_0_1px_oklch(1_0_0/3%)] backdrop-blur focus-within:border-ring/60">
        <label htmlFor="prompt" className="sr-only">Describe your character</label>
        <Textarea
          ref={ref}
          id="prompt"
          name="prompt"
          defaultValue={state.prompt}
          placeholder="Describe your character..."
          rows={3}
          className="resize-none border-0 bg-transparent text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
          }}
        />
        <div className="flex items-center justify-between gap-2 px-2 pb-1">
          <span className="truncate font-mono text-xs text-muted-foreground">
            <span className="hidden sm:inline">Z-Image Turbo · </span>4 concepts
          </span>
          <Button type="submit" disabled={pending}>
            {pending ? (
              <>
                Creating <LoadingDots />
              </>
            ) : (
              "Create character"
            )}
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </div>
      {state.error && <p className="mt-2 text-sm text-destructive">{state.error}</p>}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => {
              if (ref.current) ref.current.value = ex;
              ref.current?.focus();
            }}
            className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground"
          >
            {ex.length > 42 ? `${ex.slice(0, 42)}...` : ex}
          </button>
        ))}
      </div>
    </form>
  );
}
