"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowRight, Box as BoxIcon, Brush, CirclePlus, Eraser, Replace, ScanSearch, Search, Trash2, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FadeImage } from "@/components/fade-image";
import { LoadingDots } from "@/components/loading-dots";
import { SelectionCanvas, type SelectionHandle } from "@/features/character/components/selection-canvas";
import type { Box } from "@/lib/brush";
import type { Job, SceneAsset } from "@/lib/store";
import { cn } from "@/lib/utils";
import { editAsset, maskAssetPart, meshAsset, undoAssetEdit } from "../actions/assets";
import { chip } from "./chip";

type Tool = "part" | "paint";
type Action = "change" | "add" | "remove";
const ACTIONS: { id: Action; label: string; verb: string; icon: typeof Replace }[] = [
  { id: "change", label: "Change", verb: "Change", icon: Replace },
  { id: "add", label: "Add", verb: "Add", icon: CirclePlus },
  { id: "remove", label: "Remove", verb: "Remove", icon: Trash2 },
];

// The object's picture, edited with the character editor's tools before it becomes 3D: select a
// part by name or paint the spot with the brush, then change it, add something there, or remove it.
// "Make 3D" sends the picture on. job: the edit job running on this object, if any.
export function AssetEditor(props: { projectId: string; asset: SceneAsset; job?: Job; onClose: () => void }) {
  const { asset } = props;
  const [tool, setTool] = useState<Tool>("paint");
  const [part, setPart] = useState<string | null>(null);
  const [edited, setEdited] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [size, setSize] = useState(48);
  const [mode, setMode] = useState<"add" | "erase">("add");
  const [action, setAction] = useState<Action>("change");
  const [text, setText] = useState("");
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const selection = useRef<SelectionHandle>(null);

  const running = props.job?.status === "running";
  const busy = pending || running;
  const image = asset.image!;
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const named = part && !edited ? part : null;
  const baseMask = part && asset.parts?.[part] ? file(asset.parts[part]) : undefined;
  const current = ACTIONS.find((a) => a.id === action)!;
  const chips = Object.keys(asset.parts ?? {});
  const blocked = !box ? `Select something to ${current.verb.toLowerCase()}` : action !== "remove" && text.trim().length < 2 ? (action === "change" ? "Say what it becomes" : "Say what to add") : null;

  const act = (fn: () => Promise<unknown>) => {
    setError(null);
    start(async () => {
      try {
        await fn();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  };

  const findPart = (name: string) => {
    setPart(name);
    setEdited(false);
    setTool("part");
    if (!asset.parts?.[name]) act(() => maskAssetPart(props.projectId, asset.id, name));
  };

  const submit = () => {
    if (blocked) return;
    act(async () => {
      const blob = await selection.current?.exportMask();
      if (!blob || !box) throw new Error("Make a selection first.");
      const form = new FormData();
      form.set("mask", new File([blob], "mask.png", { type: "image/png" }));
      form.set("box", JSON.stringify(box));
      form.set("kind", action);
      form.set("text", action === "remove" ? "" : text);
      form.set("what", named ?? "");
      await editAsset(props.projectId, asset.id, form);
      setText("");
      setPart(null);
      setEdited(false);
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card/70 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="text-sm font-medium">Edit the {asset.name}</p>
        <Button variant="ghost" size="sm" disabled={busy || !asset.before?.length} onClick={() => act(() => undoAssetEdit(props.projectId, asset.id))}>
          <Undo2 data-icon="inline-start" />
          Undo
        </Button>
        <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Close the editor" onClick={props.onClose}>
          <X />
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="relative mx-auto aspect-square w-full max-w-[min(100%,60svh)] overflow-hidden rounded-xl border bg-card">
          <FadeImage key={image} src={file(image)} alt={asset.name} className="absolute inset-0 size-full object-contain" />
          {!running && (
            <div className="absolute inset-0">
              <SelectionCanvas key={`${image}:${baseMask ?? ""}`} ref={selection} src={file(image)} baseMask={baseMask} tool={tool === "paint" ? mode : null} size={size} onChange={setBox} onPaint={() => setEdited(true)} />
            </div>
          )}
          {running && (
            <div className="absolute inset-0 grid place-items-center bg-background/60 text-sm">
              <span className="inline-flex items-center gap-2">
                <LoadingDots />
                {props.job?.detail ?? "Working"}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex gap-1.5">
            <button type="button" aria-pressed={tool === "part"} className={chip(tool === "part")} onClick={() => setTool("part")}>
              <ScanSearch className="mr-1 inline size-3.5" />
              Part
            </button>
            <button type="button" aria-pressed={tool === "paint"} className={chip(tool === "paint")} onClick={() => setTool("paint")}>
              <Brush className="mr-1 inline size-3.5" />
              Brush
            </button>
            <Button variant="ghost" size="sm" className="ml-auto" disabled={!box || busy} onClick={() => (selection.current?.clear(), setPart(null), setEdited(false))}>
              Clear
            </Button>
          </div>

          {tool === "part" ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-1.5">
                {chips.map((n) => (
                  <button key={n} type="button" disabled={busy} className={chip(part === n)} onClick={() => findPart(n)}>
                    {n}
                  </button>
                ))}
              </div>
              <form
                className="flex items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (custom.trim()) findPart(custom.trim().toLowerCase());
                  setCustom("");
                }}
              >
                <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Find a part, e.g. wheel" aria-label="Find a part" className="h-8 flex-1" />
                <Button type="submit" variant="outline" size="icon-sm" disabled={busy || !custom.trim()} aria-label="Find part">
                  <Search />
                </Button>
              </form>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex gap-0.5 self-start rounded-lg bg-background/60 p-0.5" role="radiogroup" aria-label="Brush mode">
                {(["add", "erase"] as const).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors", mode === m ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>
                    {m === "add" ? <Brush className="size-3.5" /> : <Eraser className="size-3.5" />}
                    {m === "add" ? "Paint" : "Erase"}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Size
                <input type="range" min={8} max={200} value={size} onChange={(e) => setSize(Number(e.target.value))} className="flex-1 accent-primary" />
                <span className="w-8 font-mono">{size}</span>
              </label>
            </div>
          )}

          <p className="text-xs text-muted-foreground">{box ? (named ? `Selected: the ${named}` : "Selected: a painted area") : "Nothing selected yet"}</p>

          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div role="tablist" aria-label="What to do" className="grid grid-cols-3 gap-1 rounded-lg bg-background/50 p-1">
              {ACTIONS.map((a) => (
                <button key={a.id} type="button" role="tab" aria-selected={action === a.id} onClick={() => setAction(a.id)} className={cn("flex flex-col items-center gap-1 rounded-md px-1 py-1.5 text-xs font-medium transition-colors", action === a.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  <a.icon className="size-4" />
                  {a.label}
                </button>
              ))}
            </div>
            {action !== "remove" && (
              <Textarea aria-label={action === "change" ? "What it becomes" : "What to add"} rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={action === "change" ? "a new spoked wheel" : "a lantern hanging from the side"} className="min-h-0 resize-none text-sm" />
            )}
            <Button type="submit" disabled={busy || !!blocked}>
              {pending && !running ? <LoadingDots /> : blocked ? blocked : <>{current.verb}<ArrowRight data-icon="inline-end" /></>}
            </Button>
          </form>

          <div aria-hidden className="h-px bg-border" />
          <Button variant="default" disabled={busy} onClick={() => act(async () => (await meshAsset(props.projectId, asset.id), props.onClose()))}>
            <BoxIcon data-icon="inline-start" />
            Make 3D
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {props.job?.status === "error" && <p className="text-sm text-destructive">{props.job.error}</p>}
        </div>
      </div>
    </div>
  );
}
