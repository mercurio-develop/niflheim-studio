"use client";

import { useState, useTransition } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeImage } from "@/components/fade-image";
import { Section } from "@/components/section";
import { FogLoader } from "@/features/wizard/components/fog-loader";
import type { Asset, AssetView, Job } from "@/lib/store";
import { cancelTurnaround, deleteAsset, makeAllAssetViews, makeAssetViews } from "../actions/turnaround";

const VIEWS: { id: AssetView; label: string }[] = [
  { id: "front", label: "Front" },
  { id: "threequarter", label: "3/4" },
  { id: "side", label: "Side" },
  { id: "back", label: "Back" },
];
const PER_VIEW = 25;
const key = (name: string) => `asset:${name.replace(/ /g, "-")}`;

// Hidden objects kept as their own parts: the object as found, then its four views, made on demand
// one asset at a time or all together. Delete takes it off the list (it stays hidden in the views).
export function AssetsShelf(props: { projectId: string; assets: Asset[]; jobs: Record<string, Job>; locked: boolean; onView: (src: string, label: string) => void }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const all = props.jobs.assets?.status === "running" ? props.jobs.assets : null;
  const busy = (name: string) => props.jobs[key(name)]?.status === "running";
  const act = (fn: () => Promise<unknown>) => {
    setError(null);
    start(() => fn().then(() => setConfirm(null)).catch((e: Error) => setError(e.message)));
  };
  if (!props.assets.length) return null;
  return (
    <Section
      n="5"
      tone="bg-tone-pink"
      title="Assets"
      line="Objects you hid, kept as their own parts. Paint their views when you need them."
      summary={`${props.assets.length} hidden object${props.assets.length === 1 ? "" : "s"}: ${props.assets.map((a) => a.name).join(", ")}`}
      open={!!all || props.assets.some((a) => busy(a.name))}
      actions={
        <Button variant="outline" size="sm" disabled={props.locked || pending || !!all || props.assets.some((a) => busy(a.name))} onClick={() => act(() => makeAllAssetViews(props.projectId))}>
          <RefreshCw data-icon="inline-start" />
          Make all views
        </Button>
      }
    >
      {all && <p className="text-xs text-muted-foreground">{all.detail} · <button type="button" className="underline" onClick={() => cancelTurnaround(props.projectId, "assets")}>Cancel</button></p>}
      <ul className="flex flex-col gap-3">
        {props.assets.map((a) => {
          const j = props.jobs[key(a.name)];
          const running = j?.status === "running";
          return (
            <li key={a.name} className="flex flex-col gap-2 rounded-xl border bg-card/40 p-2">
              <div className="relative grid grid-cols-5 gap-1.5">
                <figure className="flex flex-col gap-1">
                  {/* The object as cut out of the character; never the whole character when it was not found. */}
                  {a.cutout ? (
                    <button type="button" onClick={() => props.onView(file(a.image), `${a.name} · as found`)} className="overflow-hidden rounded-md border bg-card">
                      <FadeImage src={file(a.image)} alt={`${a.name} as found`} className="aspect-square w-full object-contain" />
                    </button>
                  ) : (
                    <div className="flex aspect-square items-center justify-center rounded-md border border-dashed bg-card/30 p-2 text-center text-[11px] text-muted-foreground">Not found. Refine its mask under Hide, then Generate again.</div>
                  )}
                  <figcaption className="text-center font-mono text-[10px] text-muted-foreground">{a.cutout ? "found" : "not found"}</figcaption>
                </figure>
                {VIEWS.map((v) => {
                  const src = a.views?.[v.id];
                  return (
                    <figure key={v.id} className="flex flex-col gap-1">
                      {src ? (
                        <button type="button" onClick={() => props.onView(file(src), `${a.name} · ${v.label}`)} className="overflow-hidden rounded-md border bg-card">
                          <FadeImage src={file(src)} alt={`${a.name}, ${v.label}`} className="aspect-square w-full object-contain" />
                        </button>
                      ) : (
                        <div className="aspect-square rounded-md border border-dashed bg-card/30" />
                      )}
                      <figcaption className="text-center font-mono text-[10px] text-muted-foreground">{v.label}</figcaption>
                    </figure>
                  );
                })}
                {running && j && (
                  <FogLoader className="absolute inset-0 rounded-md" compact message={j.detail ?? `Painting the ${a.name}`} startedAt={j.startedAt} expected={VIEWS.length * PER_VIEW} onCancel={() => cancelTurnaround(props.projectId, key(a.name))} />
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="truncate text-sm">{a.name}</span>
                <Button variant="ghost" size="sm" className="ml-auto" disabled={running || !!all || props.locked || pending} onClick={() => act(() => makeAssetViews(props.projectId, a.name))}>
                  <RefreshCw data-icon="inline-start" />
                  {a.views ? "Again" : "Make views"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={confirm === a.name ? "text-destructive" : "text-muted-foreground"}
                  disabled={running || !!all || pending}
                  onClick={() => (confirm === a.name ? act(() => deleteAsset(props.projectId, a.name)) : setConfirm(a.name))}
                  onBlur={() => setConfirm(null)}
                >
                  <Trash2 data-icon="inline-start" />
                  {confirm === a.name ? "Delete?" : "Delete"}
                </Button>
              </div>
              {j?.status === "error" && <p className="text-xs text-destructive">{j.error}</p>}
            </li>
          );
        })}
      </ul>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </Section>
  );
}
