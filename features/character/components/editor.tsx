"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, Brush, Eraser, Palette, Redo2, ScanSearch, Search, SplitSquareHorizontal, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FadeImage } from "@/components/fade-image";
import { LoadingDots } from "@/components/loading-dots";
import { FogLoader } from "@/features/wizard/components/fog-loader";
import type { Box } from "@/lib/brush";
import type { Job, Version } from "@/lib/store";
import { STYLES } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { brushEdit, cancel, maskPart, redo, removeSelection, repaintSelection, restyleCurrent, savePart, undo } from "../actions/character";
import { SelectionCanvas, type SelectionHandle } from "./selection-canvas";
import { SectionTitle } from "./concept-section";
import { KIND_DOT, versionKind } from "@/lib/versions";

const FALLBACK = ["hair", "face", "coat", "pants", "boots"];
type Tool = "part" | "add" | "erase" | "style";
type Action = "change" | "add" | "remove";

// Edit the chosen character like Generative Fill: make a selection (a found part, refined with
// brush + and brush −), then one prompt bar acts on it. Style repaints the whole character.
export function Editor(props: {
  projectId: string;
  version: Version;
  parentImage: string | null;
  moves: { undo: number | null; redo: number | null };
  style: string;
  jobs: { mask?: Job; swap?: Job; tags?: Job; brush?: Job; restyle?: Job };
}) {
  const [tool, setTool] = useState<Tool>("part");
  const [part, setPart] = useState<string | null>(null);
  const [edited, setEdited] = useState(false); // the selection is no longer exactly the part's mask
  const [box, setBox] = useState<Box | null>(null);
  const [size, setSize] = useState(48);
  const [action, setAction] = useState<Action>("change");
  const [text, setText] = useState("");
  const [custom, setCustom] = useState("");
  const [partName, setPartName] = useState("");
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const selection = useRef<SelectionHandle>(null);

  const is = (j?: Job) => j?.status === "running";
  const running = (["mask", "swap", "brush", "restyle"] as const).find((k) => is(props.jobs[k]));
  const tagging = is(props.jobs.tags) && !props.version.tags;
  const busy = pending || !!running;
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const chips = props.version.tags?.length ? props.version.tags : tagging ? [] : FALLBACK;
  const baseMask = part && props.version.parts[part] ? file(props.version.parts[part]) : undefined;

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
    if (!props.version.parts[name]) act(() => maskPart(props.projectId, name));
  };

  // Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z walk the history, except while typing.
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      e.preventDefault();
      if (busy) return;
      if (e.shiftKey && props.moves.redo !== null) act(() => redo(props.projectId));
      else if (!e.shiftKey && props.moves.undo !== null) act(() => undo(props.projectId));
    },
    [busy, props.moves.redo, props.moves.undo, props.projectId],
  );
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  // Remove needs no words: the selection already says what goes.
  const ready = !!box && (action === "remove" || text.trim().length >= 2);

  const selectionForm = async () => {
    const blob = await selection.current?.exportMask();
    if (!blob || !box) throw new Error("Make a selection first.");
    const form = new FormData();
    form.set("mask", new File([blob], "mask.png", { type: "image/png" }));
    form.set("box", JSON.stringify(box));
    return form;
  };

  const submit = () => {
    if (!ready) return;
    if (action === "change") {
      act(async () => {
        const form = await selectionForm();
        form.set("change", text);
        form.set("what", part && !edited ? part : "selection");
        await repaintSelection(props.projectId, form);
        setText("");
      });
    } else if (action === "remove") {
      act(async () => {
        const form = await selectionForm();
        form.set("what", part && !edited ? part : "");
        await removeSelection(props.projectId, form);
      });
    } else {
      act(async () => {
        await brushEdit(props.projectId, { mode: action, thing: text, strokes: box });
        setText("");
      });
    }
  };

  const loader = running && props.jobs[running];
  const rail: [Tool, string, typeof Brush][] = [
    ["part", "Part", ScanSearch],
    ["add", "Brush +", Brush],
    ["erase", "Brush −", Eraser],
    ["style", "Restyle", Palette],
  ];

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle n="2" tone="bg-primary" title="Edit" line="Select a part or paint, then change, add or remove. Restyle repaints it all." />
      {/* Top bar: history and compare */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="ghost" size="sm" disabled={busy || props.moves.undo === null} onClick={() => act(() => undo(props.projectId))} title="Undo (Ctrl/⌘ Z)">
          <Undo2 data-icon="inline-start" />
          Undo
        </Button>
        <Button variant="ghost" size="sm" disabled={busy || props.moves.redo === null} onClick={() => act(() => redo(props.projectId))} title="Redo (Shift Ctrl/⌘ Z)">
          <Redo2 data-icon="inline-start" />
          Redo
        </Button>
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

      <div className="grid gap-4 md:grid-cols-[auto_minmax(0,1fr)_17rem]">
        {/* Tool rail */}
        <div role="toolbar" aria-label="Tools" aria-orientation="vertical" className="flex gap-1 md:flex-col">
          {rail.map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTool(id);
                if (id === "add" || id === "erase") setEdited(true);
              }}
              aria-pressed={tool === id}
              className={cn(
                "flex min-h-11 min-w-14 flex-col items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] transition-colors",
                tool === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-card hover:text-foreground",
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
            <FadeImage key={props.version.image} src={file(props.version.image)} alt={props.version.label} className="absolute inset-0 h-full w-full object-cover" />
            {tool !== "style" && !running && (
              <SelectionCanvas
                key={`${props.version.image}:${baseMask ?? ""}`}
                ref={selection}
                src={file(props.version.image)}
                baseMask={baseMask}
                tool={tool === "add" || tool === "erase" ? tool : null}
                size={size}
                onChange={setBox}
              />
            )}
            {comparing && props.parentImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={file(props.parentImage)} alt="The version before" className="absolute inset-0 h-full w-full object-cover" />
            )}
            {loader && (
              <FogLoader
                className="absolute inset-0"
                compact={running === "mask"}
                message={running === "mask" ? `Finding the ${part ?? "part"}` : (loader.detail ?? "Repainting")}
                startedAt={loader.startedAt}
                expected={running === "mask" ? 8 : running === "brush" ? 30 : 45}
                onCancel={() => cancel(props.projectId, running!)}
              />
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {(["swap", "brush", "restyle", "mask"] as const).map(
            (k) => props.jobs[k]?.status === "error" && <p key={k} className="text-sm text-destructive">{props.jobs[k]!.error}</p>,
          )}
        </div>

        {/* Context panel for the active tool */}
        <div className="flex flex-col gap-3">
          {tool === "style" ? (
            <>
              <div>
                <h2 className="text-base font-semibold">Restyle</h2>
                <p className="text-sm text-muted-foreground">Same design and pose, new look. Undo brings it back.</p>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {STYLES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={busy}
                    onClick={() => act(() => restyleCurrent(props.projectId, s.id))}
                    className={cn(
                      "rounded-lg border px-2.5 py-2 text-left text-sm transition-colors hover:border-ring/60 disabled:opacity-50",
                      props.style === s.id && "border-primary/60",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div>
                <h2 className="text-base font-semibold">{tool === "part" ? "Parts" : tool === "add" ? "Brush +" : "Brush −"}</h2>
                <p className="text-sm text-muted-foreground">
                  {tagging ? (
                    <span className="flex items-center gap-2 text-foreground">
                      Naming the parts <LoadingDots className="text-primary" />
                    </span>
                  ) : tool === "part" ? (
                    "Pick a part, or paint with Brush +."
                  ) : tool === "add" ? (
                    "Paint to select more. Name it below to keep it as a part."
                  ) : (
                    "Paint to select less."
                  )}
                </p>
              </div>
              {tool !== "part" && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Size
                  <input type="range" min={8} max={200} value={size} onChange={(e) => setSize(Number(e.target.value))} className="flex-1 accent-primary" />
                  <span className="w-8 font-mono">{size}</span>
                </label>
              )}
              <div className="flex flex-wrap gap-1.5">
                {chips.map((name) => (
                  <button
                    key={name}
                    type="button"
                    disabled={busy}
                    onClick={() => choosePart(name)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors disabled:opacity-50",
                      part === name ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:border-ring/60 hover:text-foreground",
                    )}
                  >
                    {name}
                    {running === "mask" && part === name && <LoadingDots />}
                  </button>
                ))}
              </div>
              <form
                className="flex gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (custom.trim()) choosePart(custom.trim().toLowerCase());
                  setCustom("");
                }}
              >
                <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Another part, e.g. scarf" />
                <Button type="submit" variant="outline" size="icon" disabled={busy || !custom.trim()} aria-label="Find part">
                  <Search />
                </Button>
              </form>
              {/* Action: acts on the selection (one column with the tools) */}
              <form
                  className="flex flex-col gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                  }}
                >
                  <div className="flex flex-col gap-2 rounded-xl border bg-card/70 p-2 focus-within:border-ring/60">
                    <div className="grid grid-cols-3 gap-0.5 rounded-lg bg-background/60 p-0.5">
                      {(["change", "add", "remove"] as const).map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setAction(a)}
                          className={cn(
                            "rounded-md px-2.5 py-1 text-sm transition-colors",
                            action === a ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {a === "change" ? "Change" : a === "add" ? "Add here" : "Remove"}
                        </button>
                      ))}
                    </div>
                    {action === "remove" ? (
                      <span className="px-1 py-1 text-sm text-foreground">
                        {box ? `Paint out ${part && !edited ? `the ${part}` : "the tinted area"} and fill in what is behind it` : "Select what to remove first"}
                      </span>
                    ) : (
                      <input
                        aria-label={action === "change" ? "What it should become" : "What to add"}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={
                          action === "change"
                            ? "e.g. a red leather coat"
                            : "e.g. a black raven on the shoulder"
                        }
                        className="min-w-0 bg-transparent px-1 py-1 text-base outline-none placeholder:text-muted-foreground"
                      />
                    )}
                    <Button type="submit" size="lg" className="w-full" disabled={busy || !ready}>
                      {pending && !running ? <LoadingDots /> : action === "remove" ? "Remove" : "Generate"}
                      <ArrowRight data-icon="inline-end" />
                    </Button>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">
                    {!box
                      ? "select something first"
                      : action === "change"
                        ? "only the tinted area changes"
                        : action === "add"
                          ? "painted around the selection"
                          : "the tinted area is painted out"}
                  </p>
                </form>
              {/* Brush as a tag: always visible while brushing, usable once something is painted. */}
              {(tool !== "part" || (box && (edited || !part))) && (
                <form
                  className={cn("flex flex-col gap-1.5 rounded-lg border border-dashed p-2", !box && "opacity-60")}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = partName.trim().toLowerCase();
                    if (name.length < 2) return;
                    act(async () => {
                      const form = await selectionForm();
                      form.set("name", name);
                      await savePart(props.projectId, form);
                      setPart(name);
                      setEdited(false);
                      setPartName("");
                      setTool("part");
                    });
                  }}
                >
                  <label htmlFor="part-name" className="text-xs text-muted-foreground">
                    {box ? "Save this selection as a part" : "Paint first, then save it as a part"}
                  </label>
                  <div className="flex gap-1.5">
                    <Input id="part-name" value={partName} disabled={!box} onChange={(e) => setPartName(e.target.value)} placeholder="e.g. scarf" />
                    <Button type="submit" variant="outline" disabled={busy || !box || partName.trim().length < 2}>
                      Save
                    </Button>
                  </div>
                </form>
              )}
              {box && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onClick={() => {
                    selection.current?.clear();
                    setPart(null);
                  }}
                >
                  <X data-icon="inline-start" />
                  Clear selection
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
