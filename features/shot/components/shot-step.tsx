"use client";

import { SectionNav } from "@/components/section-nav";
import { Fragment, useState, useTransition } from "react";
import { Check, Clapperboard, Download, Repeat } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FadeImage } from "@/components/fade-image";
import { LoadingDots } from "@/components/loading-dots";
import { Section } from "@/components/section";
import { FogLoader } from "@/features/wizard/components/fog-loader";
import { JobPoller } from "@/features/wizard/components/job-poller";
import { NextBar } from "@/features/wizard/components/next-bar";
import type { Job, Keyframes, Shot, ShotKind } from "@/lib/store";
import { cn } from "@/lib/utils";
import { cancelShot, pickTake, renderTake, setShotKind } from "../actions/shot";
import { drawShotSheet } from "../actions/sheet";
import { chip } from "@/features/scene/components/chip";
import { ShotTabs, type ShotTab } from "./shot-tabs";

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
  { id: "camera", label: "Camera move", line: "The takes follow the move: with the clay clip drawn (Keyframes), every frame of it, from the first keyframe; without it, the keyframes. For push-ins, arcs and walks through the set." },
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
export function ShotStep(props: { projectId: string; keyframes: Keyframes | null; ready: boolean; seconds: number; shot: Shot | null; job?: Job; keysRunning: boolean; cameraPanel: React.ReactNode; keyPanel: React.ReactNode; shots: ShotTab[]; suggested: ShotKind; sheet: string | null; choices: SheetChoices; faceRef: string | null }) {
  const [beats, setBeats] = useState<{ start: string; then: string; end: string }>({ start: props.shot?.beats?.start ?? props.shot?.action ?? "", then: props.shot?.beats?.then ?? "", end: props.shot?.beats?.end ?? "" });
  const action = [beats.start, beats.then, beats.end].map((x) => x.trim()).filter(Boolean).join(", then ");
  const kind = props.shot?.kind ?? props.suggested;
  const [expression, setExpression] = useState(props.shot?.expression ?? "");
  const [fromKey, setFromKey] = useState(false);
  const own = props.shot?.sheet;
  const [pick, setPick] = useState<{ expression?: string; pose?: string; props: string[] }>({ expression: own?.expression, pose: own?.pose, props: own?.props ?? [] });
  const toggleProp = (id: string) => setPick((x) => ({ ...x, props: x.props.includes(id) ? x.props.filter((p) => p !== id) : x.props.length < 2 ? [...x.props, id] : x.props }));
  const character = kind === "character";
  const shoot = (tries: number) => run(() => renderTake(props.projectId, { beats, tries, expression: character ? expression : undefined, fromKey: character && fromKey }));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const running = props.job?.status === "running";
  const busy = pending || running;
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const takes = props.shot?.takes ?? [];
  const run = (fn: () => Promise<unknown>) => start(() => fn().then(() => setError(null), (e: Error) => setError(e.message)));
  const seconds = character ? 5 : props.seconds;
  const expected = Math.round(25 + seconds * 18);
  // A character take from the sheet alone needs no keyframes; every other take needs today's.
  const canShoot = !busy && beats.start.trim().length >= 3 && (character ? !!props.sheet && (!fromKey || props.ready) : props.ready);

  return (
    <>
      <JobPoller running={running || props.keysRunning} />
      <div className="grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)]">
        <SectionNav items={[{ id: "camera", n: "1", title: "Camera", tone: "bg-tone-pink" }, { id: "keyframes", n: "2", title: "Keyframes", tone: "bg-tone-lilac" }, { id: "action", n: "3", title: "What happens", tone: "bg-tone-yellow" }, { id: "takes", n: "4", title: "Takes", tone: "bg-tone-cyan" }]} />
        <div className="flex min-w-0 flex-col gap-10">
        <div className="nifl-enter flex flex-col gap-1">
          <span className="font-mono text-xs text-muted-foreground">03 · Shots</span>
          <h1 className="text-2xl font-semibold tracking-tight">Say what happens</h1>
        </div>
        <ShotTabs projectId={props.projectId} shots={props.shots} locked={running} />
        {props.cameraPanel}

        <Section id="keyframes" n="2" tone="bg-tone-lilac" title="Keyframes" line="This shot's camera move, painted at its key frames. LTX follows them, so the set, the character and the camera stay put. Say what should be in the frame (a held prop) in the note."
          summary={
            props.ready ? (
              <>
                {props.keyframes!.keys.map((k) => (
                  <FadeImage key={k} src={file(k!)} alt="" className="h-8 w-14 rounded-sm border object-cover" />
                ))}
                <span className="text-xs">{props.keyframes!.keys.length} keyframes from the scene&apos;s camera move</span>
              </>
            ) : (
              "Make the keyframes"
            )
          }
          open={!props.ready || !takes.length || props.keysRunning}
          className="nifl-enter"
          style={{ "--i": 1 } as React.CSSProperties}
        >
          {props.keyPanel}
        </Section>

        <Section id="action" n="3" tone="bg-tone-yellow" title="What happens" line="What they do, in three short beats with a verb each: first, as the camera moves, by the end. Only use what the keyframes show; anything they do not show (a lantern, a sword) appears out of nowhere."
          summary={props.shot?.action || "Say what the character does"}
          open={!takes.length || running}
          className="nifl-enter"
          style={{ "--i": 2 } as React.CSSProperties}
        >
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              shoot(1);
            }}
          >
            <div className="flex flex-col gap-2 border-b pb-3">
              <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="What guides the takes">
                <span className="mr-1 text-xs text-muted-foreground">Kind</span>
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
                      <span className="text-xs text-muted-foreground">Their expression (the sheet holds the face, so say it)</span>
                      <div className="flex flex-wrap gap-1.5">
                        {EXPRESSIONS.map((e) => (
                          <button key={e} type="button" aria-pressed={expression === e} onClick={() => setExpression(expression === e ? "" : e)} className={chip(expression === e)}>
                            {e}
                          </button>
                        ))}
                      </div>
                      <Input aria-label="Expression in your own words" value={EXPRESSIONS.includes(expression) ? "" : expression} maxLength={60} placeholder="or in your own words: a nervous half-smile" onChange={(e) => setExpression(e.target.value)} className="sm:max-w-sm" />
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input type="checkbox" checked={fromKey} onChange={(e) => setFromKey(e.target.checked)} className="accent-primary" />
                        Start from the first keyframe (only when it shows this same character; otherwise its face wins)
                      </label>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-destructive">Make the character&apos;s sheet first: Character, Turnaround, Sheet.</p>
                ))}
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
            <div className="flex items-center gap-3 border-t pt-3">
              <span className="font-mono text-[11px] text-muted-foreground">
                ~{Math.round(expected / 10) * 10} s a take · {seconds} s of video with sound · every take is kept
              </span>
              <Button type="submit" variant="outline" className="ml-auto" disabled={!canShoot}>
                <Clapperboard data-icon="inline-start" />
                Shoot a take
              </Button>
              <Button type="button" size="lg" disabled={!canShoot} onClick={() => shoot(3)} title="Shoots until a take is steady with nothing popping in, at most 3, and picks the best">
                {pending && !running ? <LoadingDots /> : <Repeat data-icon="inline-start" />}
                Shoot until good
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        </Section>

        <Section id="takes" n="4" tone="bg-tone-cyan" title="Takes" line={takes.length ? "Pick the take the sequence uses. Every take stays here." : "Your takes appear here."}
          summary={takes.length ? `${takes.length} take${takes.length === 1 ? "" : "s"}${props.shot?.picked != null ? " · one picked" : ""}` : "No takes yet"}
          actions={
            takes.length > 0 && (
              <Button size="sm" variant="outline" disabled={!canShoot} onClick={() => shoot(1)} title={`Another take of: ${action}`}>
                {pending && !running ? <LoadingDots /> : <Clapperboard data-icon="inline-start" />}
                Another take
              </Button>
            )
          }
          className="nifl-enter"
          style={{ "--i": 3 } as React.CSSProperties}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {running && props.job && (
              <div className="relative aspect-[768/448] overflow-hidden rounded-lg border">
                <FogLoader className="absolute inset-0" message={props.job.detail ?? "Shooting the take"} startedAt={props.job.startedAt} expected={expected} onCancel={() => cancelShot(props.projectId)} />
              </div>
            )}
            {[...takes.entries()].reverse().map(([i, t]) => (
              <figure key={t.video} className={cn("flex flex-col gap-2 rounded-lg border p-2", props.shot?.picked === i && "border-primary")}>
                <video src={file(t.video)} controls loop playsInline preload="metadata" className="aspect-[768/448] w-full rounded-md bg-black" />
                {t.strip && (
                  <div className="flex items-center gap-1.5" title="Frames 0, 30, 60, 90 and 120 beside the face to keep: does the character stay themselves?">
                    {props.faceRef && <FadeImage src={file(props.faceRef)} alt="The face to keep" className="h-10 w-10 shrink-0 rounded border object-cover" />}
                    <FadeImage src={file(t.strip)} alt={`Take ${i + 1}, five frames`} className="h-10 min-w-0 flex-1 rounded border object-cover object-left" />
                  </div>
                )}
                <figcaption className="flex flex-col gap-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="font-mono text-foreground">Take {i + 1}</span>
                      {t.layout ? " · follows the clay clip" : t.kind === "character" ? " · held to the sheet" : ""}
                      {t.score && (
                        <span title={`Camera travel ${t.score.travel.toFixed(0)} px of flow; frames where something pops in: ${t.score.popins} (scripts/score_take.py)`}>
                          {" "}· {t.score.popins === 0 ? "steady, nothing pops in" : `${t.score.popins} pop-in${t.score.popins === 1 ? "" : "s"}`}
                        </span>
                      )}
                    </span>
                    <a href={file(t.video)} download={`take-${i + 1}.mp4`} className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label={`Download take ${i + 1}`}>
                      <Download className="size-3.5" />
                    </a>
                    <Button size="sm" variant={props.shot?.picked === i ? "secondary" : "outline"} disabled={busy} onClick={() => run(() => pickTake(props.projectId, i))}>
                      {props.shot?.picked === i && <Check data-icon="inline-start" />}
                      {props.shot?.picked === i ? "Picked" : "Use this"}
                    </Button>
                  </span>
                  <span className="line-clamp-2" title={t.prompt ?? t.action}>
                    {t.action}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
          {props.job?.status === "error" && <p className="text-sm text-destructive">The take failed: {props.job.error}</p>}
          {props.job?.status === "cancelled" && <p className="text-sm text-muted-foreground">Take cancelled.</p>}
        </Section>
        </div>
      </div>
      <NextBar
        back={{ href: `/p/${props.projectId}/scene`, label: "Scene" }}
        summary={props.shot?.picked !== undefined ? `Take ${props.shot.picked + 1} picked.` : takes.length ? `${takes.length} take${takes.length > 1 ? "s" : ""}: pick one.` : "Shoot a take to continue."}
        next={{ label: "Reel", href: `/p/${props.projectId}/export`, disabled: props.shot?.picked === undefined, hint: props.shot?.picked === undefined ? "Pick a take first" : undefined }}
      />
    </>
  );
}
