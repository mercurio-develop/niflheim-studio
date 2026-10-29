"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, Brush, CirclePlus, Eraser, Layers, Maximize2, Palette, Redo2, RefreshCw, Replace, ScanSearch, Search, SplitSquareHorizontal, Trash2, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FadeImage } from "@/components/fade-image";
import { ImageViewer } from "@/components/image-viewer";
import { LoadingDots } from "@/components/loading-dots";
import { FogLoader } from "@/features/wizard/components/fog-loader";
import type { Box } from "@/lib/brush";
import type { Job, Version } from "@/lib/store";
import { STYLES, styleById } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { KIND_DOT, versionKind } from "@/lib/versions";
import { addSelection, cancel, maskPart, redo, removeSelection, repaintSelection, rebuildStyle, restyleCurrent, retryEdit, savePart, undo } from "../actions/character";
import { Section } from "@/components/section";
import { SelectionCanvas, type SelectionHandle } from "./selection-canvas";

const FALLBACK = ["hair", "face", "coat", "pants", "boots"];
type Tool = "part" | "paint" | "restyle"; // the rail: two ways to select, and Restyle (whole image)
type Action = "change" | "add" | "remove"; // what happens to the selection

const ACTIONS: { id: Action; label: string; verb: string; icon: typeof Replace; tone: string }[] = [
  { id: "change", label: "Change", verb: "Change", icon: Replace, tone: "text-primary" },
  { id: "add", label: "Add object", verb: "Add", icon: CirclePlus, tone: "text-tone-green" },
  { id: "remove", label: "Remove", verb: "Remove", icon: Trash2, tone: "text-tone-pink" },
];

// Edit the chosen character like Generative Fill. Left rail: the tool (Part or Paint make the
// selection; Restyle repaints the whole character). Above the image: that tool's options.
// Right: what happens (Change / Add object / Remove the selection, or Restyle).
// target: what is edited, the character or one turnaround view ("view:side"; no Restyle there).
export function Editor(props: {
  projectId: string;
  target?: string;
  title?: { n: string; title: string; line: string };
  id?: string; // anchor for the step's section nav
  open?: boolean; // where work is due; the Character step folds Edit once the turnaround exists
  version: Version;
  parentImage: string | null;
  moves: { undo: number | null; redo: number | null };
  style: string;
  jobs: { mask?: Job; swap?: Job; tags?: Job; brush?: Job; restyle?: Job };
  cid?: string; // which character (default c1)
}) {
  const [tool, setTool] = useState<Tool>("part");
  const [part, setPart] = useState<string | null>(null);
  const [edited, setEdited] = useState(false); // the selection is no longer exactly the part's mask
  const [box, setBox] = useState<Box | null>(null);
  const [size, setSize] = useState(48);
  const [paintMode, setPaintMode] = useState<"add" | "erase">("add");
  const [action, setAction] = useState<Action>("change");
  const [text, setText] = useState("");
  const [style, setStyle] = useState<string | null>(null); // Restyle: a style other than the current one
  const [custom, setCustom] = useState("");
  const [partName, setPartName] = useState("");
  const [saving, setSaving] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const selection = useRef<SelectionHandle>(null);
  const target = props.target ?? "character";

  const is = (j?: Job) => j?.status === "running";
  const running = (["mask", "swap", "brush", "restyle"] as const).find((k) => is(props.jobs[k]));
  const tagging = is(props.jobs.tags) && !props.version.tags;
  const busy = pending || !!running;
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const chips = props.version.tags?.length ? props.version.tags : tagging ? [] : FALLBACK;
  const baseMask = part && props.version.parts[part] ? file(props.version.parts[part]) : undefined;
  const named = part && !edited ? part : null; // the selection is exactly a known part
  const current = ACTIONS.find((a) => a.id === action)!;

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

  const choosePart = (name: string) => {
    setPart(name);
    setEdited(false);
    setTool("part");
    if (!props.version.parts[name]) act(() => maskPart(props.projectId, name, target, props.cid));
  };

  // Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z walk the history, except while typing.
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      // Not while typing, and not behind a dialog that has its own keys (sketch pad, viewer, compare).
      if (e.defaultPrevented || (e.target as HTMLElement).closest("input, textarea") || document.querySelector('[role="dialog"][aria-modal]')) return;
      if (!e.metaKey && !e.ctrlKey && e.key.toLowerCase() === "x") {
        setPaintMode((m) => (m === "add" ? "erase" : "add"));
        return;
      }
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (busy) return;
      if (e.shiftKey && props.moves.redo !== null) act(() => redo(props.projectId, target, props.cid));
      else if (!e.shiftKey && props.moves.undo !== null) act(() => undo(props.projectId, target, props.cid));
    },
    [busy, props.moves.redo, props.moves.undo, props.projectId, props.cid, target],
  );
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  // Why the Do button is off, said once; null = ready.
  const blocked =
    tool === "restyle"
      ? !style
        ? "Pick a style other than the current one"
        : null
      : !box
        ? `Select something to ${current.verb.toLowerCase()}`
        : action !== "remove" && text.trim().length < 2
          ? action === "change"
            ? "Say what it becomes"
            : "Say what to add"
          : null;

  const selectionForm = async () => {
    const blob = await selection.current?.exportMask();
    if (!blob || !box) throw new Error("Make a selection first.");
    const form = new FormData();
    form.set("mask", new File([blob], "mask.png", { type: "image/png" }));
    form.set("box", JSON.stringify(box));
    return form;
  };

  const submit = () => {
    if (blocked) return;
    act(async () => {
      if (tool === "restyle") return restyleCurrent(props.projectId, style!, props.cid);
      const form = await selectionForm();
      if (action === "add") {
        form.set("thing", text);
        return addSelection(props.projectId, form, target, props.cid).then(() => setText(""));
      }
      if (action === "remove") {
        form.set("what", named ?? "");
        return removeSelection(props.projectId, form, target, props.cid);
      }
      form.set("change", text);
      form.set("what", named ?? "selection");
      await repaintSelection(props.projectId, form, target, props.cid);
      setText("");
    });
  };

  const saveAsPart = () => {
    const name = partName.trim().toLowerCase();
    if (name.length < 2) return;
    act(async () => {
      const form = await selectionForm();
      form.set("name", name);
      await savePart(props.projectId, form, target, props.cid);
      setPart(name);
      setEdited(false);
      setPartName("");
      setSaving(false);
      setTool("part");
    });
  };

  // The picture on screen changes only once the new one has downloaded, and the loader stays until
  // then, so a finished edit appears once instead of the old picture flashing back first.
  const [shown, setShown] = useState(props.version.image);
  const [held, setHeld] = useState<Job | null>(null);
  useEffect(() => {
    if (shown === props.version.image) return;
    let live = true;
    const img = new Image();
    img.onload = img.onerror = () => live && setShown(props.version.image);
    img.src = `/api/files/${props.projectId}/${props.version.image}`;
    return () => void (live = false);
  }, [props.version.image, props.projectId, shown]);
  const job = running ? props.jobs[running] : null;
  if (job && job !== held) setHeld(job);
  const loading = shown !== props.version.image;
  const loader = job || (loading ? held : null);
  const rail: [Tool, string, typeof Brush, string][] = [
    ["part", "Part", ScanSearch, "Select a part by name"],
    ["paint", "Paint", Brush, "Paint the selection (X switches add / erase)"],
    ["restyle", "Restyle", Palette, "Repaint the whole character in another style"],
  ];
  if (target !== "character") rail.pop(); // a view keeps the character's style

  return (
    <Section
      id={props.id}
      n={props.title?.n ?? "2"}
      tone="bg-primary"
      title={props.title?.title ?? "Edit"}
      line={props.title?.line ?? "Pick a tool on the left, then set it and act in the card on the right."}
      summary={`${props.version.label} · open to change a part`}
      open={props.open}
    >
      {/* Top bar: history and compare */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="ghost" size="sm" disabled={busy || props.moves.undo === null} onClick={() => act(() => undo(props.projectId, target, props.cid))} title="Undo (Ctrl/⌘ Z)">
          <Undo2 data-icon="inline-start" />
          Undo
        </Button>
        <Button variant="ghost" size="sm" disabled={busy || props.moves.redo === null} onClick={() => act(() => redo(props.projectId, target, props.cid))} title="Redo (Shift Ctrl/⌘ Z)">
          <Redo2 data-icon="inline-start" />
          Redo
        </Button>
        {target === "character" && props.version.edit && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => act(() => rebuildStyle(props.projectId, props.cid))} title="Repaint the whole character in one style, so edited parts match the rest">
            <Layers data-icon="inline-start" />
            Rebuild in one style
          </Button>
        )}
        {props.version.edit && props.version.parent !== undefined && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(() => retryEdit(props.projectId, target, props.cid))} title="Run this change again from the version before, with a new seed">
            <RefreshCw data-icon="inline-start" />
            Try again
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={!props.parentImage}
          onPointerDown={() => setComparing(true)}
          onPointerUp={() => setComparing(false)}
          onPointerLeave={() => setComparing(false)}
          title="Hold to see the version before"
        >
          <SplitSquareHorizontal data-icon="inline-start" />
          {comparing ? "Showing before" : "Before / after"}
        </Button>
        <span className="ml-auto flex max-w-[50%] items-center gap-1.5 truncate font-mono text-xs text-muted-foreground">
          <span className={cn("size-2 shrink-0 rounded-full", KIND_DOT[versionKind(props.version)])} />
          <span className="truncate">{props.version.label}</span>
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-[auto_minmax(0,1fr)_20rem]">
        {/* Rail: selection tools only */}
        <div role="toolbar" aria-label="Tools" aria-orientation="vertical" className="flex gap-1 md:flex-col">
          {rail.map(([id, label, Icon, hint]) => (
            <button
              key={id}
              type="button"
              title={hint}
              onClick={() => setTool(id)}
              aria-pressed={tool === id}
              className={cn(
                "flex min-h-11 min-w-14 flex-col items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] transition-colors",
                tool === id ? (id === "restyle" ? "bg-tone-lilac text-background" : "bg-primary text-primary-foreground") : "text-muted-foreground hover:bg-card hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Canvas */}
        <div className="flex flex-col gap-3">
          <div className="relative mx-auto aspect-[7/9] w-full max-w-[min(100%,calc(70svh*7/9))] overflow-hidden rounded-xl border bg-card">
            <FadeImage key={shown} src={file(shown)} alt={props.version.label} className="absolute inset-0 h-full w-full object-cover" />
            {!running && !loading && (
              // Hidden, not unmounted, while Restyle is chosen, so the selection survives the switch.
              <div className={cn("absolute inset-0", tool === "restyle" && "invisible")}>
                <SelectionCanvas
                  key={`${props.version.image}:${baseMask ?? ""}`}
                  ref={selection}
                  src={file(props.version.image)}
                  baseMask={baseMask}
                  tool={tool === "paint" ? paintMode : null}
                  size={size}
                  onChange={setBox}
                  onPaint={() => setEdited(true)}
                />
              </div>
            )}
            {!loader && (
              <button
                type="button"
                onClick={() => setViewing(true)}
                aria-label="Open full screen to see details"
                title="See details (full screen)"
                className="absolute top-2 right-2 z-10 flex size-8 items-center justify-center rounded-md border bg-background/75 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
              >
                <Maximize2 className="size-4" />
              </button>
            )}
            {comparing && props.parentImage && <FadeImage src={file(props.parentImage)} alt="The version before" className="absolute inset-0 h-full w-full object-cover" />}
            {loader && (
              <FogLoader
                className="absolute inset-0"
                compact={running === "mask"}
                message={running === "mask" ? `Finding the ${part ?? "part"}` : (loader.detail ?? "Repainting")}
                startedAt={loader.startedAt}
                expected={running === "mask" ? 8 : running === "brush" ? 30 : 45}
                onCancel={running ? () => cancel(props.projectId, running, target, props.cid) : undefined}
              />
            )}
          </div>
          {viewing && (
            <ImageViewer
              src={file(props.version.image)}
              label={props.version.label}
              dot={KIND_DOT[versionKind(props.version)]}
              onClose={() => setViewing(false)}
            />
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {(["swap", "brush", "restyle", "mask"] as const).map(
            (k) => props.jobs[k]?.status === "error" && <p key={k} className="text-sm text-destructive">{props.jobs[k]!.error}</p>,
          )}
        </div>

        {/* Right: one card, top to bottom: the selection and tool options, then what happens */}
        <div className="flex flex-col gap-4 self-start rounded-xl border bg-card/70 p-4">
              {/* Top of the card: the selection and the active tool's options */}
              {tool === "restyle" ? (
                <div className="flex flex-col gap-2.5">
                  <p className="text-xs font-medium text-muted-foreground">Style</p>
                  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Style">
                    {STYLES.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        role="radio"
                        aria-checked={style === s.id}
                        disabled={s.id === props.style}
                        title={s.id === props.style ? "The character's style now" : undefined}
                        onClick={() => setStyle(s.id)}
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-sm transition-colors disabled:cursor-default",
                          style === s.id
                            ? "border-tone-lilac bg-tone-lilac text-background"
                            : s.id === props.style
                              ? "border-dashed text-foreground"
                              : "text-muted-foreground hover:border-ring/60 hover:text-foreground",
                        )}
                      >
                        {s.label}
                        {s.id === props.style && <span className="ml-1 font-mono text-[10px] text-muted-foreground">now</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                      <span className={cn("size-2 shrink-0 rounded-full", box ? "bg-primary" : "border border-muted-foreground")} />
                      {running === "mask" ? (
                        <span className="flex items-center gap-2">
                          Finding the {part} <LoadingDots className="text-primary" />
                        </span>
                      ) : box ? (
                        <span className="truncate">{named ? `Selected: the ${named}` : part ? `Selected: the ${part}, edited by paint` : "Selected: a painted area"}</span>
                      ) : (
                        <span className="text-muted-foreground">{tool === "part" ? "Pick a part to select it" : "Paint over what you want to select"}</span>
                      )}
                    </p>
                    {box && !named && (
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => setSaving(!saving)}>
                        Save as part
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!box || busy}
                      title="Clear the selection"
                      onClick={() => {
                        selection.current?.clear();
                        setPart(null);
                        setEdited(false);
                        setSaving(false);
                      }}
                    >
                      <X data-icon="inline-start" />
                      Clear
                    </Button>
                  </div>
                  {saving && box && (
                    <form
                      className="flex gap-1.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        saveAsPart();
                      }}
                    >
                      <Input autoFocus aria-label="Part name" value={partName} onChange={(e) => setPartName(e.target.value)} placeholder="Name it, e.g. scarf" />
                      <Button type="submit" variant="outline" disabled={busy || partName.trim().length < 2}>
                        Save
                      </Button>
                    </form>
                  )}
                  {tool === "part" ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {tagging ? (
                        <span className="flex items-center gap-2 text-sm text-muted-foreground">
                          Naming the parts <LoadingDots className="text-primary" />
                        </span>
                      ) : (
                        chips.map((name) => (
                          <button
                            key={name}
                            type="button"
                            disabled={busy}
                            onClick={() => choosePart(name)}
                            className={cn(
                              "flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm transition-colors disabled:opacity-50",
                              part === name ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:border-ring/60 hover:text-foreground",
                            )}
                          >
                            {name}
                            {running === "mask" && part === name && <LoadingDots />}
                          </button>
                        ))
                      )}
                      <form
                        className="flex w-full items-center gap-1.5 pt-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (custom.trim()) choosePart(custom.trim().toLowerCase());
                          setCustom("");
                        }}
                      >
                        <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Find another part, e.g. scarf" aria-label="Find another part" className="h-8 flex-1" />
                        <Button type="submit" variant="outline" size="icon-sm" disabled={busy || !custom.trim()} aria-label="Find part">
                          <Search />
                        </Button>
                      </form>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className="flex gap-0.5 rounded-lg bg-background/60 p-0.5" role="radiogroup" aria-label="Paint mode">
                        {(["add", "erase"] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            role="radio"
                            aria-checked={paintMode === m}
                            onClick={() => setPaintMode(m)}
                            className={cn(
                              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors",
                              paintMode === m ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {m === "add" ? <Brush className="size-3.5" /> : <Eraser className="size-3.5" />}
                            {m === "add" ? "Add" : "Erase"}
                          </button>
                        ))}
                      </div>
                      <label className="flex w-full items-center gap-2 text-xs text-muted-foreground">
                        Size
                        <input type="range" min={8} max={200} value={size} onChange={(e) => setSize(Number(e.target.value))} className="flex-1 accent-primary" />
                        <span className="w-8 font-mono">{size}</span>
                      </label>
                      <span className="ml-auto font-mono text-[11px] text-muted-foreground">X switches</span>
                    </div>
                  )}
                </div>
              )}
          <div aria-hidden className="h-px bg-border" />
          {tool === "restyle" ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-tone-lilac/15 text-tone-lilac">
                  <Palette className="size-4.5" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">Restyle</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {style ? (
                      <>
                        Repaints the whole character as <span className="text-foreground">{styleById(style).label}</span>. Undo brings this version back.
                      </>
                    ) : (
                      <>Now {styleById(props.style).label}. Pick another style above to repaint the whole character in it.</>
                    )}
                  </p>
                </div>
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={busy || !style}>
                {pending && !running ? <LoadingDots /> : style ? <>Restyle as {styleById(style).label}<ArrowRight data-icon="inline-end" /></> : "Pick a style"}
              </Button>
            </form>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <div role="tablist" aria-label="What to do" className="grid grid-cols-3 gap-1 rounded-lg bg-background/50 p-1">
                {ACTIONS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    role="tab"
                    aria-selected={action === a.id}
                    onClick={() => setAction(a.id)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-md px-1 py-2 text-xs font-medium transition-colors",
                      action === a.id ? "bg-secondary text-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                    )}
                  >
                    <a.icon className={cn("size-4", action === a.id && a.tone)} />
                    {a.label}
                  </button>
                ))}
              </div>

              {action === "remove" ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {box ? (
                    <>
                      Paints out <span className="text-foreground">{named ? `the ${named}` : "the selected area"}</span> and fills in what is behind it.
                    </>
                  ) : (
                    "Paints out whatever you select."
                  )}
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="do-text" className="text-xs font-medium text-muted-foreground">
                    {action === "change" ? `${named ? `The ${named}` : "The selection"} becomes` : "Add to the selected spot"}
                  </label>
                  <Textarea
                    id="do-text"
                    rows={2}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        e.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder={action === "change" ? "a red leather coat with brass buttons" : "a black raven perched on the shoulder"}
                    className="min-h-0 resize-none text-sm leading-relaxed placeholder:text-muted-foreground/70"
                  />
                </div>
              )}

              <Button type="submit" size="lg" className="w-full" disabled={busy || !!blocked}>
                {pending && !running ? (
                  <LoadingDots />
                ) : blocked ? (
                  blocked
                ) : (
                  <>
                    {current.verb}
                    <ArrowRight data-icon="inline-end" />
                  </>
                )}
              </Button>
            </form>
          )}
        </div>
      </div>
    </Section>
  );
}
