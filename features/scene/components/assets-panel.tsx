"use client";

import { useRef, useState, useTransition } from "react";
import { Brush, MapPin, Plus, RefreshCw, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeImage } from "@/components/fade-image";
import { LoadingDots } from "@/components/loading-dots";
import { StatusDot } from "@/components/ui/status-dot";
import { Textarea } from "@/components/ui/textarea";
import type { Job, SceneAsset } from "@/lib/store";
import { STYLES, styleById } from "@/lib/styles";
import { cancelAsset, deleteAsset, makeAsset, remakeAsset } from "../actions/assets";
import { AssetEditor } from "./asset-editor";
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
  style: string; // the scene's style (the set's, else the character's): a new asset's default
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
  const [from, setFrom] = useState<From>("prompt");
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [shelf, setShelf] = useState(props.characterAssets[0] ?? "");
  const [editFirst, setEditFirst] = useState(false); // keep the picture for editing before the 3D
  const [look, setLook] = useState(""); // "" the scene's style, else a style id or "keep"
  const [styling, setStyling] = useState(false); // the other styles shown
  const [editing, setEditing] = useState<string | null>(null);
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
      form.set("name", from === "character" ? shelf : name);
      if (editFirst) form.set("edit", "1");
      if (look && !(look === "keep" && from !== "upload")) form.set("style", look);
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
      <p className="text-xs text-muted-foreground">An object for the scene in 3D, standing on the stage. It shows in every shot. It is painted in the scene&apos;s style unless you change it. Other characters are made in the Character step.</p>
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
          <input aria-label="Its name" value={name} maxLength={40} placeholder={"its name: wooden cart"} onChange={(e) => setName(e.target.value)} className="h-9 rounded-md border bg-transparent px-2 text-sm" />
        )}
        {from === "prompt" && <Textarea aria-label="Describe it" value={prompt} maxLength={300} rows={2} placeholder={"a weathered wooden hand cart with one broken wheel"} onChange={(e) => setPrompt(e.target.value)} />}
        {from === "upload" && <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Its picture" className="text-sm" />}
        {from !== "character" && (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Its style">
              <span className="text-xs text-muted-foreground">Style</span>
              <button type="button" role="radio" aria-checked={!look} className={chip(!look)} onClick={() => setLook("")}>
                Same as the scene · {styleById(props.style).label}
              </button>
              {from === "upload" && (
                <button type="button" role="radio" aria-checked={look === "keep"} className={chip(look === "keep")} onClick={() => setLook("keep")}>
                  As in the picture
                </button>
              )}
              {look && look !== "keep" && !styling && (
                <button type="button" role="radio" aria-checked className={chip(true)} onClick={() => setStyling(true)}>
                  {styleById(look).label}
                </button>
              )}
              <button type="button" aria-expanded={styling} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" onClick={() => setStyling(!styling)}>
                {styling ? "Fewer" : "Change style"}
              </button>
            </div>
            {styling && (
              <div className="flex flex-wrap items-center gap-1.5">
                {STYLES.filter((x) => x.id !== props.style).map((x) => (
                  <button key={x.id} type="button" role="radio" aria-checked={look === x.id} className={chip(look === x.id)} onClick={() => setLook(x.id)}>
                    {x.label}
                  </button>
                ))}
              </div>
            )}
            <span className="text-xs text-muted-foreground">{from === "upload" ? "The picture is repainted in this style so it sits in the scene." : "Painted in this style, like the character and the set."}</span>
          </div>
        )}
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={editFirst} onChange={(e) => setEditFirst(e.target.checked)} className="accent-primary" />
          Edit the picture first (brush, change, remove, parts), then make the 3D
        </label>
        <Button size="sm" className="self-start" disabled={pending || (from === "prompt" ? name.trim().length < 2 || prompt.trim().length < 3 : from === "upload" ? name.trim().length < 2 : !shelf)} onClick={make}>
          {pending ? <LoadingDots /> : <Plus data-icon="inline-start" />}
          {editFirst ? "Make the picture" : "Make it in 3D"}
        </Button>
      </div>

      {props.assets.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {props.assets.map((a) => {
            const job = props.jobs[`scene-asset:${a.id}`];
            const running = job?.status === "running";
            const failed = job?.status === "error";
            const ready = assetReady(a);
            const thumb = a.views?.front ?? a.image;
            const held = !!a.hold && !running;
            const status = running ? "Making the 3D" : held ? "Picture ready" : failed ? "Failed" : !ready ? "Stopped" : a.at ? "On the stage" : "3D ready";
            return (
              <li key={a.id} className={`flex flex-col gap-2 rounded-lg border bg-card/40 p-2 text-sm ${props.picked === a.id ? "ring-2 ring-primary" : ""}`}>
                <div className="aspect-square w-full overflow-hidden rounded-md border bg-card/40">
                  {thumb ? <FadeImage src={file(thumb)} alt={a.name} className="size-full object-contain" /> : <span className="grid size-full place-items-center text-xs text-muted-foreground">No picture yet</span>}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <button type="button" aria-pressed={props.picked === a.id} disabled={!a.at} className={`${chip(props.picked === a.id)} min-w-0 truncate`} onClick={() => props.onPick(props.picked === a.id ? null : a.id)}>
                    {a.name}
                  </button>
                  <StatusDot on={ready && !failed} pending={running} label={status} />
                </div>
                <p className="min-h-4 truncate text-xs text-muted-foreground">
                  {running ? (
                    <span className="inline-flex items-center gap-1.5">
                      <LoadingDots />
                      {job.detail}
                    </span>
                  ) : held && a.image ? (
                    "Edit the picture, then make the 3D"
                  ) : failed ? (
                    <span className="text-destructive">{job.error}</span>
                  ) : ready && a.at ? (
                    `${a.height.toFixed(2)} m tall`
                  ) : ready ? (
                    "Put it on the stage"
                  ) : (
                    "Stopped before it was finished"
                  )}
                </p>
                <div className="flex items-center gap-1">
                  {ready && (
                    <Button variant={props.placing === a.id ? "default" : "ghost"} size="sm" onClick={() => props.onPlace(props.placing === a.id ? null : a.id)}>
                      <MapPin data-icon="inline-start" />
                      {a.at ? "Move" : "Place"}
                    </Button>
                  )}
                  {running && (
                    <Button variant="ghost" size="icon" aria-label={`Stop making the ${a.name}`} onClick={() => run(() => cancelAsset(props.projectId, a.id))}>
                      <Square />
                    </Button>
                  )}
                  {!running && !ready && a.image && a.kind !== "character" && (
                    <Button variant={editing === a.id ? "default" : "ghost"} size="sm" aria-label={`Edit the picture of the ${a.name}`} onClick={() => setEditing(editing === a.id ? null : a.id)}>
                      <Brush data-icon="inline-start" />
                      Edit
                    </Button>
                  )}
                  {!running && !ready && !held && (
                    <Button variant="ghost" size="sm" aria-label={`Make the ${a.name} again`} onClick={() => run(() => remakeAsset(props.projectId, a.id))}>
                      <RefreshCw data-icon="inline-start" />
                      Retry
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="ml-auto" aria-label={`Remove the ${a.name}`} disabled={running} onClick={() => run(() => deleteAsset(props.projectId, a.id))}>
                    <Trash2 />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {props.assets.map((a) => (a.id === editing && a.image ? <AssetEditor key={a.id} projectId={props.projectId} asset={a} job={props.jobs[`scene-asset-edit:${a.id}`]} onClose={() => setEditing(null)} /> : null))}

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
          {picked.kind !== "character" && <p className="col-span-2 text-xs text-muted-foreground">Drag the gizmo&apos;s up arrow to lift it off the ground: a butterfly in the air, a lamp on a wall.</p>}
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
