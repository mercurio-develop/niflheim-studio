"use client";

import { useRef, useState, useTransition } from "react";
import { MapPin, Plus, RefreshCw, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeImage } from "@/components/fade-image";
import { LoadingDots } from "@/components/loading-dots";
import { Textarea } from "@/components/ui/textarea";
import type { Job, SceneAsset } from "@/lib/store";
import { cancelAsset, deleteAsset, makeAsset, remakeAsset } from "../actions/assets";
import { chip } from "./chip";
import { assetReady } from "./scene-assets";
import { CastPicker, type CastOption } from "./cast-picker";

type From = SceneAsset["from"];
const FROM: { id: From; label: string }[] = [
  { id: "prompt", label: "Describe" },
  { id: "upload", label: "Upload" },
  { id: "character", label: "From the character" },
];

// Objects made for the scene in 3D with the character's own graphs: described (a concept is painted
// first), an uploaded picture, or one of the assets taken off the character. Each is made right away
// (about 3 min), then placed by a click on the floor and moved with its gizmo; the picked one's
// height and facing are set here.
export function AssetsPanel(props: {
  projectId: string;
  assets: SceneAsset[];
  jobs: Record<string, Job>;
  characterAssets: string[]; // names of the character's assets
  cast: CastOption[]; // the other characters made in the Character step
  picked: string | null;
  onPick: (id: string | null) => void;
  placing: string | null;
  onPlace: (id: string | null) => void;
  onChange: (id: string, patch: Pick<SceneAsset, "height" | "turn">) => void;
}) {
  const [kind, setKind] = useState<"object" | "character">("object");
  const [from, setFrom] = useState<From>("prompt");
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [shelf, setShelf] = useState(props.characterAssets[0] ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const run = (fn: () => Promise<unknown>) => start(() => fn().then(() => setError(null), (e: Error) => setError(e.message)));
  const picked = props.assets.find((a) => a.id === props.picked);

  const make = () =>
    run(async () => {
      const form = new FormData();
      form.set("from", from);
      form.set("kind", kind);
      form.set("name", from === "character" ? shelf : name);
      if (from === "prompt") form.set("prompt", prompt);
      if (from === "upload") {
        const f = fileRef.current?.files?.[0];
        if (!f) throw new Error("Choose a picture first.");
        form.set("image", f);
      }
      await makeAsset(props.projectId, form);
      setName("");
      setPrompt("");
      if (fileRef.current) fileRef.current.value = "";
    });

  return (
    <div className="flex flex-col gap-3">
      <CastPicker projectId={props.projectId} cast={props.cast} jobs={props.jobs} />
      <p className="text-xs text-muted-foreground">Someone else for the scene (a friend, a unicorn) or an object in 3D, standing on the stage. They show in every shot, and the keyframes paint them in the scene&apos;s style. Say what they do in the shot&apos;s beats.</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {(["character", "object"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} className={chip(kind === k)} onClick={() => setKind(k)}>
            {k === "character" ? "A character" : "An object"}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {FROM.map((x) => (
          <button key={x.id} type="button" aria-pressed={from === x.id} className={chip(from === x.id)} disabled={x.id === "character" && !props.characterAssets.length} title={x.id === "character" && !props.characterAssets.length ? "Nothing yet: in Character, hide an object from the turnaround and keep it, and it shows up here" : undefined} onClick={() => setFrom(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:max-w-xl">
        {from === "character" ? (
          <select aria-label="The character's asset" value={shelf} onChange={(e) => setShelf(e.target.value)} className="h-9 rounded-md border bg-transparent px-2 text-sm">
            {props.characterAssets.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        ) : (
          <input aria-label="Its name" value={name} maxLength={40} placeholder={kind === "character" ? "their name: Mia" : "its name: wooden cart"} onChange={(e) => setName(e.target.value)} className="h-9 rounded-md border bg-transparent px-2 text-sm" />
        )}
        {from === "prompt" && <Textarea aria-label="Describe it" value={prompt} maxLength={300} rows={2} placeholder={kind === "character" ? "a young woman with curly red hair, denim jacket and white sneakers" : "a weathered wooden hand cart with one broken wheel"} onChange={(e) => setPrompt(e.target.value)} />}
        {from === "upload" && <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Its picture" className="text-sm" />}
        <Button size="sm" className="self-start" disabled={pending || (from === "prompt" ? name.trim().length < 2 || prompt.trim().length < 3 : from === "upload" ? name.trim().length < 2 : !shelf)} onClick={make}>
          {pending ? <LoadingDots /> : <Plus data-icon="inline-start" />}
          {kind === "character" ? "Make them" : "Make it in 3D"}
        </Button>
      </div>

      {props.assets.length > 0 && (
        <ul className="flex flex-col gap-2">
          {props.assets.map((a) => {
            const job = props.jobs[`scene-asset:${a.id}`];
            const running = job?.status === "running";
            const thumb = a.views?.front ?? a.image;
            return (
              <li key={a.id} className="flex items-center gap-2 text-sm">
                {thumb ? <FadeImage src={file(thumb)} alt="" className="size-10 shrink-0 rounded border object-cover" /> : <span className="size-10 shrink-0 rounded border bg-card/40" />}
                <button type="button" aria-pressed={props.picked === a.id} disabled={!a.at} className={chip(props.picked === a.id)} onClick={() => props.onPick(props.picked === a.id ? null : a.id)}>
                  {a.name}
                </button>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {running ? (
                    <span className="inline-flex items-center gap-1.5">
                      <LoadingDots />
                      {job.detail}
                    </span>
                  ) : job?.status === "error" ? (
                    <span className="text-destructive">Failed: {job.error}</span>
                  ) : !assetReady(a) ? (
                    "Stopped before it was finished"
                  ) : a.at ? (
                    `${a.height.toFixed(2)} m tall`
                  ) : (
                    "Ready: put it on the stage"
                  )}
                </span>
                {running && (
                  <Button variant="ghost" size="icon" aria-label={`Stop making the ${a.name}`} onClick={() => run(() => cancelAsset(props.projectId, a.id))}>
                    <Square />
                  </Button>
                )}
                {!running && !assetReady(a) && (
                  <Button variant="ghost" size="icon" aria-label={`Make the ${a.name} again`} onClick={() => run(() => remakeAsset(props.projectId, a.id))}>
                    <RefreshCw />
                  </Button>
                )}
                {assetReady(a) && (
                  <Button variant={props.placing === a.id ? "default" : "ghost"} size="sm" onClick={() => props.onPlace(props.placing === a.id ? null : a.id)}>
                    <MapPin data-icon="inline-start" />
                    {a.at ? "Move" : "Place"}
                  </Button>
                )}
                <Button variant="ghost" size="icon" aria-label={`Remove the ${a.name}`} disabled={running} onClick={() => run(() => deleteAsset(props.projectId, a.id))}>
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {picked && (
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:max-w-xl">
          <label htmlFor="asset-height" className="text-xs text-muted-foreground">
            Height
          </label>
          <div className="flex items-center gap-3">
            <input id="asset-height" type="range" min={0.1} max={6} step={0.05} value={picked.height} onChange={(e) => props.onChange(picked.id, { height: Number(e.target.value), turn: picked.turn })} className="w-full accent-primary" />
            <span className="w-14 text-right font-mono text-xs text-muted-foreground">{picked.height.toFixed(2)} m</span>
          </div>
          <label htmlFor="asset-turn" className="text-xs text-muted-foreground">
            Facing
          </label>
          <div className="flex items-center gap-3">
            <input id="asset-turn" type="range" min={-180} max={180} step={5} value={picked.turn} onChange={(e) => props.onChange(picked.id, { height: picked.height, turn: Number(e.target.value) })} className="w-full accent-primary" />
            <span className="w-14 text-right font-mono text-xs text-muted-foreground">{picked.turn}°</span>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
