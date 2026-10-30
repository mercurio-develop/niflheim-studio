"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FadeImage } from "@/components/fade-image";
import { LoadingDots } from "@/components/loading-dots";
import { cn } from "@/lib/utils";
import { addCharacter, deleteCharacter } from "../actions/character";

// summary: how far the character got (version, views, poses, 3D); done: every side painted.
export type RosterCard = { id: string; name: string; image: string | null; summary: string; done: boolean; running: boolean };

// The project's characters as cards. The selected one is open below; the others fold to their
// card (picture, name, what is made). + Add character starts the next one with its own prompt.
export function CharacterRoster(props: { projectId: string; selected: string; cards: RosterCard[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const href = (cid: string) => `/p/${props.projectId}/character${cid === "c1" ? "" : `?c=${cid}`}`;

  const add = () =>
    start(async () => {
      try {
        const cid = await addCharacter(props.projectId, name, prompt);
        setAdding(false);
        setName("");
        setPrompt("");
        setError(null);
        router.push(href(cid));
      } catch (e) {
        setError((e as Error).message);
      }
    });
  const remove = (cid: string) =>
    start(async () => {
      try {
        await deleteCharacter(props.projectId, cid);
        setConfirm(null);
        if (cid === props.selected) router.push(href("c1"));
      } catch (e) {
        setError((e as Error).message);
      }
    });

  return (
    <div className="flex flex-col gap-3">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {props.cards.map((c) => {
          const open = c.id === props.selected;
          return (
            <li key={c.id} className={cn("group relative overflow-hidden rounded-md border bg-card transition-colors", open ? "border-primary ring-1 ring-primary" : "hover:border-foreground/30")}>
              <Link href={href(c.id)} aria-current={open ? "true" : undefined} className="flex flex-col" scroll={false}>
                {c.image ? (
                  <FadeImage src={`/api/files/${props.projectId}/${c.image}`} alt="" className="aspect-[4/3] w-full bg-muted object-contain" />
                ) : (
                  <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted text-muted-foreground">
                    <UserRound className="size-8" />
                  </div>
                )}
                <span className="flex items-center gap-1.5 px-2 pt-1.5 text-sm font-medium">
                  <span className="truncate">{c.name}</span>
                  {c.done && <Check className="size-3.5 shrink-0 text-primary" aria-label="Every side painted" />}
                  {c.running && <LoadingDots />}
                </span>
                <span className="truncate px-2 pb-1.5 font-mono text-[11px] text-muted-foreground">{c.id === "c1" ? "Main · " : ""}{c.summary}</span>
              </Link>
              {c.id !== "c1" && (
                <button
                  type="button"
                  disabled={pending || c.running}
                  onClick={() => (confirm === c.id ? remove(c.id) : setConfirm(c.id))}
                  onBlur={() => setConfirm(null)}
                  aria-label={`Remove ${c.name}`}
                  className={cn("absolute top-1.5 right-1.5 flex items-center gap-1 rounded-md border bg-background/80 px-1.5 py-0.5 text-[11px] text-muted-foreground backdrop-blur transition-opacity hover:text-destructive focus-visible:opacity-100", confirm === c.id ? "text-destructive opacity-100" : "opacity-0 group-hover:opacity-100")}
                >
                  <Trash2 className="size-3" />
                  {confirm === c.id ? "Remove?" : null}
                </button>
              )}
            </li>
          );
        })}
        {!adding && (
          <li>
            <button type="button" onClick={() => setAdding(true)} className="flex size-full min-h-32 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
              <Plus className="size-5" />
              Add character
            </button>
          </li>
        )}
      </ol>
      {adding && (
        <form
          className="flex flex-col gap-2 rounded-md border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <span className="text-sm font-medium">New character</span>
          <Input aria-label="Name" autoComplete="off" data-1p-ignore data-lpignore="true" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name: the dragon" maxLength={40} disabled={pending} autoFocus />
          <Textarea aria-label="Describe the character" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="A small red dragon with stubby wings and a round belly" rows={2} maxLength={600} disabled={pending} />
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={pending || !name.trim() || !prompt.trim()}>
              {pending ? <LoadingDots /> : <Plus data-icon="inline-start" />}
              Add
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <span className="text-xs text-muted-foreground">It gets the same steps: concept, edit, turnaround, poses, 3D. Only the first character is needed to go on.</span>
          </div>
        </form>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
