"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, Brush, Eraser, Redo2, ScanSearch, Search, SplitSquareHorizontal, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FadeImage } from "@/components/fade-image";
import { LoadingDots } from "@/components/loading-dots";
import { FogLoader } from "@/features/wizard/components/fog-loader";
import type { Box } from "@/lib/brush";
import type { Job, Version } from "@/lib/store";
import { STYLES, styleById } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { KIND_DOT, versionKind } from "@/lib/versions";
import { brushEdit, cancel, maskPart, redo, removeSelection, repaintSelection, restyleCurrent, savePart, undo } from "../actions/character";
import { SectionTitle } from "./concept-section";
import { SelectionCanvas, type SelectionHandle } from "./selection-canvas";

const FALLBACK = ["hair", "face", "coat", "pants", "boots"];
type Tool = "part" | "paint"; // the rail: the two ways to make the selection
type Action = "change" | "add" | "remove" | "restyle"; // the Do block: what happens to it

const ACTIONS: { id: Action; label: string; verb: string; dot: string }[] = [
  { id: "change", label: "Change", verb: "Change", dot: "bg-primary" },
  { id: "add", label: "Add object", verb: "Add", dot: "bg-tone-green" },
  { id: "remove", label: "Remove", verb: "Remove", dot: "bg-tone-pink" },
  { id: "restyle", label: "Restyle", verb: "Restyle", dot: "bg-tone-lilac" },
];

// Edit the chosen character like Generative Fill. Left rail: make the selection (a found part,
// paint more, paint less). Right: what is selected, then what to do with it. Restyle needs no
// selection: it repaints the whole character.
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
  const [paintMode, setPaintMode] = useState<"add" | "erase">("add");
  const [action, setAction] = useState<Action>("change");
  const [text, setText] = useState("");
  const [style, setStyle] = useState(props.style);
  const [custom, setCustom] = useState("");
  const [partName, setPartName] = useState("");
  const [saving, setSaving] = useState(false);
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
    if (!props.version.parts[name]) act(() => maskPart(props.projectId, name));
  };

  // Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z walk the history, except while typing.
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest("input, textarea");
      if (!typing && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === "x") {
        setPaintMode((m) => (m === "add" ? "erase" : "add"));
        return;
      }
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

  // Why the Do button is off, said once; null = ready.
  const blocked =
    action === "restyle"
      ? null
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
      if (action === "restyle") return restyleCurrent(props.projectId, style);
      if (action === "add") return brushEdit(props.projectId, { mode: "add", thing: text, strokes: box! }).then(() => setText(""));
      const form = await selectionForm();
      if (action === "remove") {
        form.set("what", named ?? "");
        return removeSelection(props.projectId, form);
      }
      form.set("change", text);
      form.set("what", named ?? "selection");
      await repaintSelection(props.projectId, form);
      setText("");
    });
  };

  const saveAsPart = () => {
    const name = partName.trim().toLowerCase();
    if (name.length < 2) return;
    act(async () => {
      const form = await selectionForm();
      form.set("name", name);
      await savePart(props.projectId, form);
      setPart(name);
      setEdited(false);
      setPartName("");
      setSaving(false);
      setTool("part");
    });
  };

  const loader = running && props.jobs[running];
  const rail: [Tool, string, typeof Brush, string][] = [
    ["part", "Part", ScanSearch, "Select a part by name"],
    ["paint", "Paint", Brush, "Paint the selection (X switches add / erase)"],
  ];

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle n="2" tone="bg-primary" title="Edit" line="Pick a tool on the left, set it above the image, choose what happens on the right." />
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

      <div className="grid gap-4 md:grid-cols-[auto_minmax(0,1fr)_18rem]">
        {/* Rail: selection tools only */}
        <div role="toolbar" aria-label="Selection tools" aria-orientation="vertical" className="flex gap-1 md:flex-col">
          {rail.map(([id, label, Icon, hint]) => (
            <button
              key={id}
              type="button"
              title={hint}
              onClick={() => {
                setTool(id);
                if (action === "restyle") setAction("change");
              }}
              aria-pressed={tool === id && action !== "restyle"}
              className={cn(
                "flex min-h-11 min-w-14 flex-col items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] transition-colors",
                tool === id && action !== "restyle" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-card hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Canvas */}
        <div className="flex flex-col gap-3">
          {/* Tool options for the active tool, plus the selection's status (Photoshop's options bar) */}
          {action !== "restyle" && (
            <div className="flex flex-col gap-2 rounded-xl bg-card/50 p-2.5">
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
                {box && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Clear selection"
                    title="Clear selection"
                    onClick={() => {
                      selection.current?.clear();
                      setPart(null);
                      setSaving(false);
                    }}
                  >
                    <X />
                  </Button>
                )}
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
                    className="flex items-center gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (custom.trim()) choosePart(custom.trim().toLowerCase());
                      setCustom("");
                    }}
                  >
                    <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="other part…" aria-label="Find another part" className="h-7 w-32" />
                    <Button type="submit" variant="ghost" size="icon-sm" disabled={busy || !custom.trim()} aria-label="Find part">
                      <Search />
                    </Button>
                  </form>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
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
                  <label className="flex min-w-40 flex-1 items-center gap-2 text-xs text-muted-foreground">
                    Size
                    <input type="range" min={8} max={200} value={size} onChange={(e) => setSize(Number(e.target.value))} className="flex-1 accent-primary" />
                    <span className="w-8 font-mono">{size}</span>
                  </label>
                  <span className="font-mono text-[11px] text-muted-foreground">X switches</span>
                </div>
              )}
            </div>
          )}
          <div className="relative mx-auto aspect-[7/9] w-full max-w-[min(100%,calc(70svh*7/9))] overflow-hidden rounded-xl border bg-card">
            <FadeImage key={props.version.image} src={file(props.version.image)} alt={props.version.label} className="absolute inset-0 h-full w-full object-cover" />
            {!running && (
              // Hidden, not unmounted, while Restyle is chosen, so the selection survives the switch.
              <div className={cn("absolute inset-0", action === "restyle" && "invisible")}>
                <SelectionCanvas
                  key={`${props.version.image}:${baseMask ?? ""}`}
                  ref={selection}
                  src={file(props.version.image)}
                  baseMask={baseMask}
                  tool={action === "restyle" || tool !== "paint" ? null : paintMode}
                  size={size}
                  onChange={setBox}
                  onPaint={() => setEdited(true)}
                />
              </div>
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

        {/* Right: only what to do with the selection */}
        <div className="flex flex-col gap-5">
          {/* Do: one action, one input, one button named by the verb */}
          <form
            className="flex flex-col gap-2.5 rounded-xl border bg-card/70 p-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div role="tablist" aria-label="What to do" className="grid grid-cols-2 gap-0.5 rounded-lg bg-background/60 p-0.5">
              {ACTIONS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="tab"
                  aria-selected={action === a.id}
                  onClick={() => setAction(a.id)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                    action === a.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", a.dot)} />
                  {a.label}
                </button>
              ))}
            </div>

            {action === "restyle" ? (
              <>
                <p className="px-1 text-sm text-muted-foreground">The whole character, same design and pose.</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {STYLES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={style === s.id}
                      onClick={() => setStyle(s.id)}
                      className={cn(
                        "rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors",
                        style === s.id ? "border-tone-lilac bg-tone-lilac/15 text-foreground" : "text-muted-foreground hover:border-ring/60 hover:text-foreground",
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            ) : action === "remove" ? (
              <p className="px-1 text-sm">{box ? `Paints out ${named ? `the ${named}` : "the selected area"} and fills in what is behind it.` : "Paints out what you select."}</p>
            ) : (
              <input
                aria-label={action === "change" ? "What it becomes" : "What to add"}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={action === "change" ? `${named ? `The ${named}` : "It"} becomes, e.g. a red leather coat` : "e.g. a black raven on the shoulder"}
                className="min-w-0 rounded-md bg-background/40 px-2 py-2 text-base outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring/60"
              />
            )}

            <Button type="submit" size="lg" className="w-full" disabled={busy || !!blocked}>
              {pending && !running ? (
                <LoadingDots />
              ) : blocked ? (
                blocked
              ) : (
                <>
                  {action === "restyle" ? `Restyle as ${styleById(style).label}` : current.verb}
                  <ArrowRight data-icon="inline-end" />
                </>
              )}
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}
