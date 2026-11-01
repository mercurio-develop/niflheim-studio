"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Play, Square, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FOCUS, FPS, FRAMINGS, MOVES, crossWalk, frameCount, type CameraMove, type Subject, type Vec } from "@/lib/camera";
import { saveCamera } from "../actions/camera";
import { chip } from "./chip";

// The camera move on the shot's picture. The bar holds the preset, the length, Play and More (and
// what the page hands it, Shoot); More opens framing, move, walk, distance, height, Around, Focus
// and Ease. It renders absolute pieces, so it goes inside the stage's frame. The path shows in the
// stage (from above), Play flies it, and frames that leave the space the stage holds are counted.
// Saved a moment after the last change.

export function CameraSection(props: {
  projectId: string;
  move: CameraMove;
  onMove: (m: CameraMove) => void;
  start: Vec | null; // where the move starts today, which the Height slider raises or lowers
  subject: Subject | null; // where the character stands, how tall and which way they face, to start a walk
  subjects?: { id: string; label: string }[]; // what the camera can work around: main, placed assets, none
  outside: number; // frames outside the stage's space
  close?: number; // the first frame the camera is too close to the character, or -1
  playing: boolean;
  onPlay: (on: boolean) => void;
  ready: boolean; // a character stands on the stage
  extra?: React.ReactNode; // the last thing on the bar: Shoot
  presets?: { id: string; label: string; line: string; actor: string }[]; // one click: framing, move and the actor's walk
  onPreset?: (id: string, side: 1 | -1) => void;
  more: boolean; // the expert panel open
  onMore: (on: boolean) => void;
}) {
  const m = props.move;
  const spec = MOVES.find((x) => x.id === m.move)!;
  const framing = FRAMINGS.find((x) => x.id === (m.framing ?? "painting"))!;
  const frames = frameCount(m.seconds);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  // A change by hand leaves the preset; length, ease and focus keep it.
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

  const near = (props.close ?? -1) >= 0;
  return (
    <>
      {props.ready && (
        <div className="absolute top-3 right-3 left-44 z-20 flex flex-wrap items-center justify-end gap-2">
          {!!props.presets?.length && (
            <>
              <select
                aria-label="Shot preset"
                value={m.preset ?? ""}
                onChange={(e) => e.target.value && props.onPreset?.(e.target.value, m.side ?? 1)}
                title={preset ? preset.line : "Set by hand (More). Pick a shot to start again from a preset."}
                className="h-8 rounded-md border bg-background/80 px-2 text-xs backdrop-blur"
              >
                {m.preset === undefined && <option value="">By hand</option>}
                {props.presets.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
              {preset?.actor === "across" && (
                <button type="button" aria-label="Walk the other way" className={chip(false)} onClick={() => props.onPreset?.(preset.id, m.side === -1 ? 1 : -1)}>
                  {m.side === -1 ? "← walks left" : "walks right →"}
                </button>
              )}
            </>
          )}
          <label className="flex h-8 items-center gap-1.5 rounded-md border bg-background/80 px-2 text-xs backdrop-blur" title="Up to 5 s: longer takes drift. A longer moment is two shots.">
            Length
            <input aria-label="Length" type="range" min={2} max={5} step={0.5} value={Math.min(5, m.seconds)} onChange={(e) => set({ seconds: Number(e.target.value) })} className="w-20 accent-primary" />
            <span className="w-8 text-right font-mono text-muted-foreground">{m.seconds} s</span>
          </label>
          <Button size="sm" variant="outline" onClick={() => props.onPlay(!props.playing)}>
            {props.playing ? <Square data-icon="inline-start" /> : <Play data-icon="inline-start" />}
            {props.playing ? "Stop" : "Play"}
          </Button>
          <button type="button" aria-pressed={more} aria-expanded={more} className={chip(more)} onClick={() => props.onMore(!more)}>
            More
          </button>
          {props.extra}
        </div>
      )}
      {props.ready && more && (
        <div className="absolute top-14 right-3 z-20 max-h-[60%] w-[min(28rem,calc(100%-1.5rem))] overflow-y-auto rounded-md border bg-background/90 p-3 backdrop-blur">
          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3">
            {!!props.subjects && props.subjects.length > 2 && (
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
            <span className="text-xs text-muted-foreground">Framing</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {FRAMINGS.map((x) => (
                <button key={x.id} type="button" aria-pressed={framing.id === x.id} className={chip(framing.id === x.id)} onClick={() => set({ framing: x.id, from: x.id === "free" ? (m.from ?? props.start ?? undefined) : m.from })}>
                  {x.label}
                </button>
              ))}
            </div>
            <span />
            <p className="-mt-1 text-xs text-muted-foreground">{framing.line}</p>

            {props.start && (
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
              {MOVES.map((x) => (
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
          </div>
        </div>
      )}
      {props.ready && (near || props.outside > 0) && (
        <p className="absolute right-3 bottom-20 z-20 flex max-w-[50%] items-start gap-1.5 rounded bg-background/80 px-2 py-1 text-xs backdrop-blur">
          <TriangleAlert className={near ? "mt-px size-3.5 shrink-0 text-destructive" : "mt-px size-3.5 shrink-0 text-tone-yellow"} />
          <span className={near ? "text-destructive" : "text-muted-foreground"}>
            {near ? `From frame ${props.close} the camera is right against them: drag the path's end (from above) away, or shorten the move.` : `${props.outside} of ${frames} frames leave the stage's space (red from above): holes or stretched shapes.`}
          </span>
        </p>
      )}
      {error && <p className="absolute top-14 left-3 z-20 rounded bg-background/80 px-2 py-1 text-xs text-destructive">{error}</p>}
    </>
  );
}
