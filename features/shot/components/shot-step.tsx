"use client";

import { SectionNav } from "@/components/section-nav";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { Clapperboard, Dices, Download, Plus, Trash2, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FadeImage } from "@/components/fade-image";
import { LoadingDots } from "@/components/loading-dots";
import { Section } from "@/components/section";
import { FogLoader } from "@/features/wizard/components/fog-loader";
import { JobPoller } from "@/features/wizard/components/job-poller";
import type { Job, Keyframes, Shot, ShotKind, TakeSetup } from "@/lib/store";
import { goodTake } from "@/lib/score";
import { cn } from "@/lib/utils";
import { addExpression, cancelShot, deleteTake, oneShoot as oneShootAction, removeExpression, saveBeats, setInShot, setShotKind } from "../actions/shot";
import { clayFrameMax } from "../state";
import { shootCapturer } from "./shot-keyframes";
import { drawShotSheet } from "../actions/sheet";
import { chip } from "@/features/scene/components/chip";
import { ShotTabs, type ShotTab } from "./shot-tabs";
import { changes } from "../setup";

// Actions that only use what is in the keyframes: a prop the keys do not show makes LTX conjure it
// mid-take (04_shot ACCEPT proof 6). Props go into the keyframes through the In the frame note.
// One beat each: what they do first, as the camera moves, and by the end (LTX's prompting guide:
// actions in order, each with a verb, emotion shown in the body).
const EXAMPLES: { start: string; then: string; end: string }[] = [
  { start: "stands still, breathing slowly", then: "turns their head toward the camera", end: "narrows their eyes, shoulders tense" },
  { start: "looks around warily", then: "takes a careful step forward", end: "stops and listens, the wind stirring their clothes" },
  { start: "lowers their head", then: "takes a slow, deep breath", end: "looks up with a faint smile" },
];
// What guides a shot's takes, one or the other (decision 0014): the camera's keyframes for a shot
// about the move, the character's sheet for a shot about them.
const KINDS: { id: ShotKind; label: string; line: string }[] = [
  { id: "camera", label: "Camera move", line: "The takes follow the move: with the motion guide drawn (Keyframes), every frame of it, from the first keyframe; without it, the keyframes. For push-ins, arcs and walks through the set." },
  { id: "character", label: "Character", line: "The takes hold the character's face, clothes and things to their sheet, 5 s, from the sheet alone unless you start from the first keyframe: for close-ups and acting." },
];
// What a shot can put in its own sheet: the character's painted expressions and poses, and the
// scene's assets that have pictures.
export type SheetChoices = { expressions: { id: string; label: string }[]; poses: { id: string; label: string }[]; props: { id: string; label: string }[] };
const EXPRESSIONS = ["calm", "smiling", "curious", "worried", "frightened", "angry", "sad", "determined"];
const BEATS = [
  { id: "start", label: "First", placeholder: "stands still, breathing slowly" },
  { id: "then", label: "As the camera moves", placeholder: "turns their head toward the camera" },
  { id: "end", label: "By the end", placeholder: "narrows their eyes, shoulders tense" },
] as const;

// Step 03: set the shot's camera and walk (decision 0011), make the keyframes, say what the character does; LTX-2.5 shoots the shot's camera move, guided by its
// keyframes. Each take is kept; pick the one the sequence uses, or download it.
export function ShotStep(props: { projectId: string; keyframes: Keyframes | null; ready: boolean; seconds: number; shot: Shot | null; job?: Job; keysRunning: boolean; cameraPanel: React.ReactNode; keyPanel: React.ReactNode; shots: ShotTab[]; suggested: ShotKind; sheet: string | null; choices: SheetChoices; faceRef: string | null; move: string; inShot: { id: string; name: string; on: boolean }[]; subject: string | null; expressions: string[] }) {
  const [beats, setBeats] = useState<{ start: string; then: string; end: string }>({ start: props.shot?.beats?.start ?? props.shot?.action ?? "", then: props.shot?.beats?.then ?? "", end: props.shot?.beats?.end ?? "" });
  const action = [beats.start, beats.then, beats.end].map((x) => x.trim()).filter(Boolean).join(", then ");
  // Saved a moment after typing: the keyframes paint the later beats, so they must be on the shot first.
  const typed = useRef(false);
  useEffect(() => {
    if (!typed.current) return void (typed.current = true);
    if (beats.start.trim().length < 3) return;
    const t = setTimeout(() => void saveBeats(props.projectId, beats).catch(() => {}), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beats.start, beats.then, beats.end]);
  const kind = props.shot?.kind ?? props.suggested;
  const [expression, setExpression] = useState(props.shot?.expression ?? "");
  const [fromKey, setFromKey] = useState(false);
  const own = props.shot?.sheet;
  const [pick, setPick] = useState<{ expression?: string; pose?: string; props: string[] }>({ expression: own?.expression, pose: own?.pose, props: own?.props ?? [] });
  const toggleProp = (id: string) => setPick((x) => ({ ...x, props: x.props.includes(id) ? x.props.filter((p) => p !== id) : x.props.length < 2 ? [...x.props, id] : x.props }));
  const character = kind === "character";
  // Who and what is in the shot, shown at once and saved behind (the keys follow it, so it waits while they paint).
  const savedOff = props.inShot.filter((x) => !x.on).map((x) => x.id).join(",");
  const [shown, setShown] = useState({ off: savedOff, subject: props.subject });
  const [synced, setSynced] = useState({ off: savedOff, subject: props.subject });
  if (synced.off !== savedOff || synced.subject !== props.subject) {
    setSynced({ off: savedOff, subject: props.subject });
    setShown({ off: savedOff, subject: props.subject });
  }
  const off = shown.off ? shown.off.split(",") : [];
  const inShot = props.inShot.map((x) => ({ ...x, on: !off.includes(x.id) }));
  const mainOn = !off.includes("main");
  const subject = mainOn ? null : (inShot.find((x) => x.on && x.id === shown.subject) ?? inShot.find((x) => x.on && x.id !== "main"))?.id ?? null;
  const setInShotAction = (id: string, on: boolean, star = false) => {
    const next = { off: (on ? off.filter((x) => x !== id) : [...off, id]).join(","), subject: star ? id : shown.subject };
    setShown(next);
    run(() => setInShot(props.projectId, { off: next.off ? next.off.split(",") : [], subject: next.subject ?? undefined }));
  };
  const [newExpression, setNewExpression] = useState("");
  const addNew = () => {
    const e = newExpression.trim();
    if (e.length < 2) return;
    setExpression(e);
    setNewExpression("");
    run(() => addExpression(props.projectId, e));
  };
  // Generate: whatever is stale is drawn in the browser (keys, then the clay clip for a Camera move),
  // then the server paints them and shoots `tries` takes, every one kept.
  const [phase, setPhase] = useState<string | null>(null);
  const [count, setCount] = useState(2);
  const [keysFirst, setKeysFirst] = useState(false);
  const generate = (tries: number, seed?: number) =>
    run(async () => {
      const c = shootCapturer();
      const form = new FormData();
      try {
        if ((!character || fromKey) && !props.ready && !c?.keysCurrent) {
          if (!c) throw new Error("Build the scene first: a stage, the character standing in it and a camera move.");
          setPhase("Drawing the keyframes");
          (await c.capture("keys")).forEach((b, i) => form.set(`key${i}`, new File([b], `key${i}.jpg`, { type: "image/jpeg" })));
        }
        if (!character && c && !c.clayCurrent) {
          setPhase("Drawing the motion guide");
          const frames = await c.capture("clay");
          const max = clayFrameMax(frames.length);
          if (frames.some((b) => b.size >= max)) throw new Error("A clay frame came out too big to send; shorten the move.");
          frames.forEach((b, i) => form.set(`f${i}`, new File([b], `${i}.jpg`, { type: "image/jpeg" })));
        }
        setPhase("Sending");
        await oneShootAction(props.projectId, form, { beats, tries, expression: expression || undefined, fromKey: character && fromKey, seed, keysOnly: keysFirst && needsKeys && !props.ready });
      } finally {
        setPhase(null);
      }
    });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const running = props.job?.status === "running";
  const busy = pending || running;
  // Settings hold while the keys paint (they are painted from them); while a take shoots they are free.
  const locked = pending || props.keysRunning;
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const takes = props.shot?.takes ?? [];
  const run = (fn: () => Promise<unknown>) => start(() => fn().then(() => setError(null), (e: Error) => setError(e.message)));
  const seconds = character ? 5 : props.seconds;
  const expected = Math.round(25 + seconds * 18);
  // Out-of-date keys are drawn and painted by Generate itself; a sheet take needs a sheet.
  const needsKeys = !character || fromKey;
  const canGenerate = !busy && !props.keysRunning && beats.start.trim().length >= 3 && (!character || !!props.sheet) && inShot.some((x) => x.on);
  const last = takes.at(-1);
  const now: TakeSetup = { in: inShot.filter((x) => x.on).map((x) => x.name), subject: inShot.find((x) => x.id === subject)?.name, expression: expression || undefined, beats: { start: beats.start, then: beats.then || undefined, end: beats.end || undefined }, kind, move: props.move, seconds: Math.round(props.seconds * 10) / 10 };
  const pendingChanges = last?.setup ? changes(last.setup, now) : [];
  const shotNo = props.shots.findIndex((s) => s.active) + 1;

  return (
    <>
      <JobPoller running={running || props.keysRunning} />
      <div className="grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)]">
        <SectionNav items={[{ id: "camera", n: "1", title: "Camera", tone: "bg-tone-pink" }, { id: "action", n: "2", title: "What happens", tone: "bg-tone-yellow" }, { id: "keyframes", n: "3", title: "Keyframes", tone: "bg-tone-lilac" }, { id: "takes", n: "4", title: "Takes", tone: "bg-tone-cyan" }]} />
        <div className="flex min-w-0 flex-col gap-10">
        <div className="nifl-enter flex flex-col gap-1">
          <span className="font-mono text-xs text-muted-foreground">03 · Shots</span>
          <h1 className="text-2xl font-semibold tracking-tight">Say what happens</h1>
        </div>
        <ShotTabs projectId={props.projectId} shots={props.shots} locked={running} />
        <fieldset disabled={locked} className="contents" title={locked ? "The keyframes are being painted from these settings" : undefined}>
          {props.cameraPanel}
        </fieldset>

        <Section id="action" n="2" tone="bg-tone-yellow" title="What happens" line="What they do, in three short beats with a verb each: first, as the camera moves, by the end. The keyframes after the first are painted with them (Generate paints them again after a change), so the take does what they show; a thing not in the scene (a lantern, a sword) appears out of nowhere."
          summary={props.shot?.action || "Say what the character does"}
          open={!takes.length}
          className="nifl-enter"
          style={{ "--i": 1 } as React.CSSProperties}
        >
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => e.preventDefault()}
          >
            <fieldset disabled={locked} className="contents">
            <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 border-b pb-3">
              <span className="pt-1 text-xs text-muted-foreground">In this shot</span>
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Who and what is in this shot">
                  {inShot.map((x) => (
                    <span key={x.id} className="inline-flex items-center gap-0.5">
                      <button type="button" aria-pressed={x.on} disabled={locked} onClick={() => setInShotAction(x.id, !x.on)} className={chip(x.on)}>
                        {x.name}
                      </button>
                      {x.on && x.id !== "main" && !mainOn && (
                        <button type="button" aria-pressed={subject === x.id} aria-label={`Make ${x.name} the subject`} title="The subject: who the shot is about" disabled={locked} onClick={() => setInShotAction(x.id, true, true)} className={cn("rounded-full px-1 text-sm", subject === x.id ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
                          {subject === x.id ? "★" : "☆"}
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {mainOn ? "Tap to leave someone or something out of this shot. The keyframes are drawn again without them." : subject ? "Without the character, ★ marks who or what the shot is about: its sheet guides Character takes." : "Switch something on: the shot needs someone or something to be about."}
                </p>
              </div>
              <span className="pt-1 text-xs text-muted-foreground">Expression</span>
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Expression">
                  {[...EXPRESSIONS, ...props.expressions.filter((e) => !EXPRESSIONS.includes(e))].map((e) => (
                    <span key={e} className="inline-flex items-center">
                      <button type="button" aria-pressed={expression === e} onClick={() => setExpression(expression === e ? "" : e)} className={chip(expression === e)}>
                        {e}
                      </button>
                      {props.expressions.includes(e) && !EXPRESSIONS.includes(e) && (
                        <button type="button" aria-label={`Remove ${e}`} onClick={() => run(() => removeExpression(props.projectId, e))} className="px-1 text-muted-foreground hover:text-foreground">
                          <X className="size-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input aria-label="A new expression in your own words" value={newExpression} maxLength={60} placeholder="a new one in your own words: a nervous half-smile" onChange={(e) => setNewExpression(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNew())} className="sm:max-w-sm" />
                  <Button type="button" size="sm" variant="outline" disabled={newExpression.trim().length < 2} onClick={addNew}>
                    <Plus data-icon="inline-start" />
                    Add
                  </Button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
              {BEATS.map((b) => (
                <Fragment key={b.id}>
                  <label htmlFor={`beat-${b.id}`} className="text-xs text-muted-foreground">
                    {b.label}
                  </label>
                  <Input id={`beat-${b.id}`} value={beats[b.id]} maxLength={300} onChange={(e) => setBeats({ ...beats, [b.id]: e.target.value })} placeholder={b.placeholder} />
                </Fragment>
              ))}
            </div>
            {!action && (
              <div className="-mt-1 flex flex-wrap gap-1.5">
                {EXAMPLES.map((x) => (
                  <button key={x.start} type="button" onClick={() => setBeats(x)} className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground">
                    {x.start} → {x.end}
                  </button>
                ))}
              </div>
            )}
            {locked && <p className="text-xs text-muted-foreground">Held while the keyframes are painted from these settings.</p>}
            </fieldset>
          </form>
        </Section>

        <Section id="keyframes" n="3" tone="bg-tone-lilac" title={character && !fromKey ? "Keyframes (optional)" : "Keyframes"}
          line={character && !fromKey ? "A Character shot is guided by the character's sheet, so it needs no keyframes. Tick “Start from the first keyframe” in Takes to use the first one." : "This shot's camera move, painted at its key frames. LTX follows them, so the set, the character and the camera stay put. The keys after the first show What happens: when it changes, Generate paints them again."}
          summary={
            props.ready ? (
              <>
                {props.keyframes!.keys.filter((k): k is string => !!k).map((k) => (
                  <FadeImage key={k} src={file(k)} alt="" className="h-8 w-14 rounded-sm border object-cover" />
                ))}
                <span className="text-xs">{props.keyframes!.keys.length} keyframes from the scene&apos;s camera move</span>
              </>
            ) : (
              character && !fromKey ? "Not needed: the sheet guides this shot" : "Make the keyframes"
            )
          }
          open={(character && !fromKey ? false : !props.ready || !takes.length) || props.keysRunning}
          className="nifl-enter"
          style={{ "--i": 2 } as React.CSSProperties}
        >
          {props.keyPanel}
        </Section>

        <Section id="takes" n="4" tone="bg-tone-cyan" title="Takes" line="Each take is a new video of this shot with a new seed, so takes differ; every one is kept, checked for things that pop in, and yours to download for your editor. Change something above and generate again: each take says what changed. Same seed shoots one again with what is set now."
          summary={takes.length ? `${takes.length} take${takes.length === 1 ? "" : "s"}` : "No takes yet"}
          actions={
            takes.length > 0 && (
              <a href={`/api/takes/${props.projectId}`} download className={buttonVariants({ variant: "outline", size: "sm" })} title="Every shot's takes in one zip, named shot-1_take-3_seed-123.mp4">
                <Download data-icon="inline-start" />
                Download all takes
              </a>
            )
          }
          className="nifl-enter"
          style={{ "--i": 3 } as React.CSSProperties}
        >
          <div className="flex flex-col gap-2 border-b pb-3">
            <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="What guides the takes">
              <span className="mr-1 text-xs text-muted-foreground">Guided by</span>
              {KINDS.map((x) => (
                <button key={x.id} type="button" role="radio" aria-checked={kind === x.id} disabled={busy} onClick={() => run(() => setShotKind(props.projectId, x.id))} className={chip(kind === x.id)}>
                  {x.label}
                  {props.suggested === x.id && !props.shot?.kind ? " · suggested" : ""}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{KINDS.find((x) => x.id === kind)!.line} One guide per take: the two are never mixed.</p>
            {character &&
              (props.sheet ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <FadeImage src={file(own?.drawn ?? props.sheet)} alt={own ? "This shot's sheet" : "The character's sheet"} className="aspect-[768/448] w-full max-w-64 shrink-0 rounded border bg-black object-contain" />
                  <div className="flex min-w-0 flex-col gap-1.5">
                    {(props.choices.expressions.length > 0 || props.choices.poses.length > 0 || props.choices.props.length > 0) && (
                      <div className="flex flex-col gap-1.5 border-b pb-2">
                        <span className="text-xs text-muted-foreground">This shot&apos;s sheet: {own ? "drawn" : "the character's, unless you draw one"}</span>
                        {[
                          { label: "Face", items: props.choices.expressions, on: (id: string) => pick.expression === id, set: (id: string) => (setPick((x) => ({ ...x, expression: x.expression === id ? undefined : id })), setExpression(props.choices.expressions.find((e) => e.id === id)?.label ?? expression)) },
                          { label: "Pose", items: props.choices.poses, on: (id: string) => pick.pose === id, set: (id: string) => setPick((x) => ({ ...x, pose: x.pose === id ? undefined : id })) },
                          { label: "Props", items: props.choices.props, on: (id: string) => pick.props.includes(id), set: toggleProp },
                        ]
                          .filter((g) => g.items.length)
                          .map((g) => (
                            <div key={g.label} className="flex flex-wrap items-center gap-1.5">
                              <span className="w-12 text-xs text-muted-foreground">{g.label}</span>
                              {g.items.map((x) => (
                                <button key={x.id} type="button" aria-pressed={g.on(x.id)} onClick={() => g.set(x.id)} className={chip(g.on(x.id))}>
                                  {x.label}
                                </button>
                              ))}
                            </div>
                          ))}
                        <Button type="button" size="sm" variant="outline" className="self-start" disabled={busy} onClick={() => run(() => drawShotSheet(props.projectId, pick))}>
                          Draw this shot&apos;s sheet
                        </Button>
                      </div>
                    )}
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" checked={fromKey} onChange={(e) => setFromKey(e.target.checked)} className="accent-primary" />
                      Start from the first keyframe (only when it shows this same character; otherwise its face wins)
                    </label>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-destructive">{mainOn ? "Make the character's sheet first: Character, Turnaround, Sheet." : "What this shot is about has no sheet: Camera move takes shoot it from the keyframes."}</p>
              ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 border-b pb-3">
            <div className="flex items-center gap-1.5" role="radiogroup" aria-label="How many takes">
              <span className="mr-1 text-xs text-muted-foreground">Takes</span>
              {[1, 2, 3, 4].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={count === n} disabled={busy} onClick={() => setCount(n)} className={chip(count === n)}>
                  {n}
                </button>
              ))}
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">
              ~{Math.round((expected * count) / 60)} min · {Math.round(seconds * 10) / 10} s each with sound
            </span>
            <Button type="button" size="lg" className="ml-auto" disabled={!canGenerate} onClick={() => generate(count)} title="Draws and paints what is out of date (keyframes, motion guide), then shoots the takes">
              {pending && !running ? <LoadingDots /> : <Clapperboard data-icon="inline-start" />}
              {phase ?? (running ? "Generating…" : keysFirst && needsKeys && !props.ready ? "Paint the keyframes" : `Generate ${count === 1 ? "a take" : `${count} takes`}`)}
            </Button>
            {needsKeys && (
              <label className="flex w-full items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={keysFirst} disabled={busy} onChange={(e) => setKeysFirst(e.target.checked)} className="accent-primary" />
                Stop after the keyframes so I can check them (fix one in Keyframes, then Generate shoots)
              </label>
            )}
            {last?.setup && (
              <p className="w-full text-xs text-muted-foreground">
                {pendingChanges.length ? <>Next take: <span className="text-foreground">{pendingChanges.join(" · ")}</span></> : "Same setup as the last take: a new seed only."}
              </p>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {running && props.job && (
              <div className="flex flex-col gap-2 rounded-lg border p-2">
                <div className="relative aspect-[768/448] overflow-hidden rounded-md border">
                  <FogLoader className="absolute inset-0" message={props.job.detail ?? "Shooting the take"} startedAt={props.job.startedAt} expected={expected * count} onCancel={() => cancelShot(props.projectId)} />
                </div>
                {!character && props.keyframes && (
                  <div className="flex gap-1" aria-label="The keyframes this take follows">
                    {props.keyframes.raw.map((r, i) => {
                      const k = props.keyframes!.keys[i];
                      return k ? <FadeImage key={r} src={file(k)} alt={`Key ${i + 1}`} className="aspect-[768/448] min-w-0 flex-1 rounded-sm border object-cover" /> : <div key={r} className="nifl-loading aspect-[768/448] min-w-0 flex-1 rounded-sm border" />;
                    })}
                  </div>
                )}
              </div>
            )}
            {[...takes.entries()].reverse().map(([i, t]) => {
              const before = takes.slice(0, i).reverse().find((x) => x.setup)?.setup;
              const changed = t.setup && before ? changes(before, t.setup) : [];
              return (
                <figure key={t.video} className="flex flex-col gap-2 rounded-lg border p-2">
                  <video src={file(t.video)} controls loop playsInline preload="metadata" className="aspect-[768/448] w-full rounded-md bg-black" />
                  {t.strip && (
                    <div className="flex items-center gap-1.5" title="Frames 0, 30, 60, 90 and 120 beside the face to keep: does the character stay themselves?">
                      {props.faceRef && <FadeImage src={file(props.faceRef)} alt="The face to keep" className="h-10 w-10 shrink-0 rounded border object-cover" />}
                      <FadeImage src={file(t.strip)} alt={`Take ${i + 1}, five frames`} className="h-10 min-w-0 flex-1 rounded border object-cover object-left" />
                    </div>
                  )}
                  <figcaption className="flex flex-col gap-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="min-w-0 flex-1">
                        <span className="font-mono text-foreground">Take {i + 1}</span>
                        {t.layout ? " · follows the motion guide" : t.kind === "character" ? " · held to the sheet" : ""}
                        {t.score && (
                          <span title={`Camera travel ${t.score.travel.toFixed(0)} px of flow; frames where something pops in: ${t.score.popins} of ${t.frames}, worst spike ${t.score.worst.toFixed(1)} (steady: at most 10% and under 15; scripts/score_take.py)`}>
                            {" "}· {goodTake(t.score, t.frames) ? (t.score.popins === 0 ? "steady, nothing pops in" : "steady") : `${t.score.popins} of ${t.frames} frames pop in`}
                          </span>
                        )}
                      </span>
                      <Button size="sm" variant="ghost" disabled={!canGenerate} onClick={() => generate(1, t.seed)} title={`Shoot again with seed ${t.seed} and what is set now`}>
                        <Dices data-icon="inline-start" />
                        Same seed
                      </Button>
                      <a href={file(t.video)} download={`shot-${shotNo}_take-${i + 1}_seed-${t.seed}.mp4`} className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label={`Download take ${i + 1}`}>
                        <Download className="size-3.5" />
                      </a>
                      <Button size="sm" variant="ghost" disabled={busy} aria-label={`Delete take ${i + 1}`} onClick={() => confirm(`Delete take ${i + 1}? Its video is removed.`) && run(() => deleteTake(props.projectId, i))}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </span>
                    {changed.length > 0 && <span className="text-foreground">{changed.join(" · ")}</span>}
                    <span className="line-clamp-2" title={t.prompt ?? t.action}>
                      {t.action}
                    </span>
                    <span className="font-mono text-[10px]">seed {t.seed}</span>
                  </figcaption>
                </figure>
              );
            })}
          </div>
          {props.job?.status === "error" && <p className="text-sm text-destructive">The take failed: {props.job.error}</p>}
          {props.job?.status === "cancelled" && <p className="text-sm text-muted-foreground">Take cancelled; the takes already made are kept.</p>}
        </Section>
        </div>
      </div>
    </>
  );
}
