"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Play, Square, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/section";
import { FOCUS, FPS, FRAMINGS, MOVES, crossWalk, frameCount, type CameraMove, type Subject, type Vec } from "@/lib/camera";
import { saveCamera } from "../actions/camera";
import { chip } from "./chip";

// Step 3 of the scene: the camera move, aimed at the character. Pick where it starts (a framing,
// or Free: dragged in Overview, its height set here), a move, how far and how long; the path shows in the stage above (from above), Play flies it, and frames that leave the
// space the stage holds are counted. Saved a moment after the last change. (The depth-video Render
// is gone: no take used it; the clay clip in Keyframes is the move's guide now.)
// Without More, only the presets that cannot fail show; one already picked stays.
const EXPERT_FRAMINGS = ["free", "pov"];
const EXPERT_MOVES = ["crane", "track"];

export function CameraSection(props: {
  projectId: string;
  move: CameraMove;
  onMove: (m: CameraMove) => void;
  start: Vec | null; // where the move starts today, which the Height slider raises or lowers
  subject: Subject | null; // where the character stands, how tall and which way they face, to start a walk
  subjects?: { id: string; label: string }[]; // what the camera can work around: main, placed assets, none
  poses?: { id: string; label: string }[]; // the character's finished poses (Character → Turnaround)
  outside: number; // frames outside the stage's space
  close?: number; // the first frame the camera is too close to the character, or -1
  playing: boolean;
  onPlay: (on: boolean) => void;
  ready: boolean; // a character stands on the stage
  n?: string; // its number on the page
  top?: React.ReactNode; // above the controls: the stage viewer the path is shown in
  presets?: { id: string; label: string; line: string; actor: string }[]; // one click: framing, move and the actor's walk
  onPreset?: (id: string, side: 1 | -1) => void;
  more: boolean; // every control shown: framing, move, walk, distance, height, poses, Around, Focus, Ease
  onMore: (on: boolean) => void;
}) {
  const m = props.move;
  const spec = MOVES.find((x) => x.id === m.move)!;
  const framing = FRAMINGS.find((x) => x.id === (m.framing ?? "painting"))!;
  const frames = frameCount(m.seconds);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  // A change by hand leaves the preset (its chip unlights); length, ease and focus keep it.
  const set = (patch: Partial<CameraMove>) => props.onMove({ ...m, ...patch, ...(Object.keys(patch).every((k) => ["seconds", "ease", "focus"].includes(k)) ? {} : { preset: undefined }) });
  const preset = props.presets?.find((x) => x.id === m.preset);
  const more = props.more;

  const first = useRef(true);
  useEffect(() => {
    if (first.current) return void (first.current = false);
    const t = setTimeout(() => start(() => saveCamera(props.projectId, m).then(() => setError(null), (e: Error) => setError(e.message))), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.preset, m.side, m.move, m.amount, m.seconds, m.ease, m.framing, m.from?.join(), m.to?.join(), m.walk?.to.join(), m.walk?.from.join(), m.focus, m.pose, m.poseThen, m.subject]);

  return (
    <Section
      id="camera"
      n={props.n ?? "1"}
      tone="bg-tone-pink"
      title="Camera"
      line={props.ready ? "This shot's framing, move and walk. From above shows the path with a handle on each end; Play flies it." : "Stand the character on the stage in Scene first: every move is aimed at them."}
      summary={`${framing.label} · ${spec.label}${m.move === "static" ? "" : ` ${m.amount}${spec.unit}`} · ${m.seconds} s${m.ease ? " · eased" : ""}`}
      open={props.ready}
      actions={
        props.ready && (
          <>
            <Button size="sm" onClick={() => props.onPlay(!props.playing)}>
              {props.playing ? <Square data-icon="inline-start" /> : <Play data-icon="inline-start" />}
              {props.playing ? "Stop" : "Play"}
            </Button>
          </>
        )
      }
      className="nifl-enter"
      style={{ "--i": 1 } as React.CSSProperties}
    >
      {props.top}
      {props.ready && (
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3 sm:max-w-xl">
          {!!props.presets?.length && (
            <>
              <span className="text-xs text-muted-foreground">Shot</span>
              <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Shot preset">
                {props.presets.map((x) => (
                  <button key={x.id} type="button" role="radio" aria-checked={m.preset === x.id} className={chip(m.preset === x.id)} onClick={() => props.onPreset?.(x.id, m.side ?? 1)}>
                    {x.label}
                  </button>
                ))}
                {preset?.actor === "across" && (
                  <button type="button" aria-label="Walk the other way" className={chip(false)} onClick={() => props.onPreset?.(preset.id, m.side === -1 ? 1 : -1)}>
                    {m.side === -1 ? "← walks left" : "walks right →"}
                  </button>
                )}
              </div>
              <span />
              <p className="-mt-1 text-xs text-muted-foreground">{preset ? preset.line : m.preset === undefined && props.presets.length ? "Set by hand (More controls). Pick a shot to start again from a preset." : ""}</p>
            </>
          )}
          {more && !!props.subjects && props.subjects.length > 2 && (
            <>
              <span className="text-xs text-muted-foreground">Around</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {props.subjects.map((x) => (
                  <button key={x.id} type="button" aria-pressed={(m.subject ?? "main") === x.id} className={chip((m.subject ?? "main") === x.id)} onClick={() => set({ subject: x.id === "main" ? undefined : x.id })}>
                    {x.label}
                  </button>
                ))}
              </div>
            </>
          )}
          {more && (
            <>
              <span className="text-xs text-muted-foreground">Framing</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {FRAMINGS.filter((x) => more || !EXPERT_FRAMINGS.includes(x.id) || x.id === framing.id).map((x) => (
                  <button key={x.id} type="button" aria-pressed={framing.id === x.id} className={chip(framing.id === x.id)} onClick={() => set({ framing: x.id, from: x.id === "free" ? (m.from ?? props.start ?? undefined) : m.from })}>
                    {x.label}
                  </button>
                ))}
              </div>
              <span />
              <p className="-mt-1 text-xs text-muted-foreground">{framing.line}</p>

              {more && props.start && (
                <>
                  <label htmlFor="cam-height" className="text-xs text-muted-foreground">
                    Height
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      id="cam-height"
                      type="range"
                      min={0.2}
                      max={4}
                      step={0.05}
                      value={Math.min(4, Math.max(0.2, props.start[1]))}
                      onChange={(e) => set({ framing: "free", from: [props.start![0], Number(e.target.value), props.start![2]] })}
                      className="w-full accent-primary"
                    />
                    <span className="w-14 text-right font-mono text-xs text-muted-foreground">{props.start[1].toFixed(2)} m</span>
                  </div>
                </>
              )}

              <span className="text-xs text-muted-foreground">Move</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {MOVES.filter((x) => more || !EXPERT_MOVES.includes(x.id) || x.id === m.move).map((x) => (
                  <button key={x.id} type="button" aria-pressed={m.move === x.id} className={chip(m.move === x.id)} onClick={() => set({ move: x.id, amount: x.value, to: undefined })}>
                    {x.label}
                  </button>
                ))}
              </div>
              <span />
              <p className="-mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                {spec.line}
                {m.to ? (
                  <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => set({ to: undefined })}>
                    End moved from above · back to the preset
                  </button>
                ) : (
                  <span>Drag either end of the path from above to change it.</span>
                )}
              </p>

              {more && !!props.poses?.length && (
                <>
                  <span className="text-xs text-muted-foreground">Pose</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[{ id: "", label: "As designed" }, ...props.poses].map((x) => (
                      <button key={x.id || "designed"} type="button" aria-pressed={(m.pose ?? "") === x.id} className={chip((m.pose ?? "") === x.id)} onClick={() => set({ pose: x.id || undefined })}>
                        {x.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">Then, halfway</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[{ id: "", label: "Same pose" }, { id: "designed", label: "As designed" }, ...props.poses].filter((x) => x.id !== (m.pose ?? "designed")).map((x) => (
                      <button key={x.id || "same"} type="button" aria-pressed={(m.poseThen ?? "") === x.id} className={chip((m.poseThen ?? "") === x.id)} onClick={() => set({ poseThen: x.id || undefined })}>
                        {x.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <span className="text-xs text-muted-foreground">Character</span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" aria-pressed={!m.walk} className={chip(!m.walk)} onClick={() => set({ walk: undefined })}>
                  Stands still
                </button>
                <button
                  type="button"
                  aria-pressed={!!m.walk}
                  className={chip(!!m.walk)}
                  disabled={!props.subject || !props.start}
                  onClick={() => {
                    if (m.walk || !props.subject || !props.start) return;
                    set({ walk: crossWalk(props.subject, props.start) });
                  }}
                >
                  Walks
                </button>
                {m.walk && <span className="ml-2 font-mono text-[11px] text-muted-foreground">{Math.hypot(m.walk.to[0] - m.walk.from[0], m.walk.to[2] - m.walk.from[2]).toFixed(1)} m · drag the yellow ring from above</span>}
              </div>

              {spec.max !== spec.min && (
                <>
                  <label htmlFor="cam-amount" className="text-xs text-muted-foreground">
                    {spec.unit === "°" ? "Angle" : "Distance"}
                  </label>
                  <div className="flex items-center gap-3">
                    <input id="cam-amount" type="range" min={spec.min} max={spec.max} step={spec.step} value={m.amount} onChange={(e) => set({ amount: Number(e.target.value), to: undefined })} className="w-full accent-primary" />
                    <span className="w-14 text-right font-mono text-xs text-muted-foreground">
                      {m.amount}
                      {spec.unit === "°" ? "°" : ` ${spec.unit}`}
                    </span>
                  </div>
                </>
              )}
            </>
          )}

          <label htmlFor="cam-seconds" className="text-xs text-muted-foreground">
            Length
          </label>
          <div className="flex items-center gap-3">
            <input id="cam-seconds" type="range" min={2} max={5} step={0.5} value={Math.min(5, m.seconds)} onChange={(e) => set({ seconds: Number(e.target.value) })} className="w-full accent-primary" />
            <span className="w-14 text-right font-mono text-xs text-muted-foreground">{m.seconds} s</span>
          </div>
          <span />
          <p className="-mt-1 text-xs text-muted-foreground">Up to 5 s: longer takes drift. A longer moment is two shots.</p>

          {more && (
            <>
            <span className="text-xs text-muted-foreground">Focus</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {FOCUS.map((x) => (
                <button key={x.id} type="button" aria-pressed={(m.focus ?? "deep") === x.id} className={chip((m.focus ?? "deep") === x.id)} onClick={() => set({ focus: x.id })}>
                  {x.label}
                </button>
              ))}
              {(m.focus ?? "deep") !== "deep" && <span className="ml-2 text-[11px] text-muted-foreground">The keyframes and the take paint the blur; the 3D view stays sharp.</span>}
            </div>

            <span className="text-xs text-muted-foreground">Ease</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" aria-pressed={m.ease} className={chip(m.ease)} onClick={() => set({ ease: !m.ease })}>
                Ease in and out
              </button>
              <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                {frames} frames at {FPS} fps
              </span>
            </div>
            </>
          )}
          <span />
          <div>
            <button type="button" aria-pressed={more} className={chip(more)} onClick={() => props.onMore(!more)}>
              {more ? "Fewer controls" : "More controls"}
            </button>
          </div>
        </div>
      )}

      {props.ready && (props.close ?? -1) >= 0 && (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          From frame {props.close} the camera is inside or right against them: the keys would show a flat card edge on. Drag the path&apos;s end (from above) away from them, or shorten the move.
        </p>
      )}
      {props.ready && props.outside > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <TriangleAlert className="mt-px size-3.5 shrink-0 text-tone-yellow" />
          {props.outside} of {frames} frames leave the space the stage holds (red from above): those will show holes or stretched shapes. A smaller move, or a start nearer the painting&apos;s camera, stays clean.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </Section>
  );
}
