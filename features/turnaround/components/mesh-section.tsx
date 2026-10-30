"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Box, Download, Palette, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { FadeImage } from "@/components/fade-image";
import { LoadingDots } from "@/components/loading-dots";
import { Section, SectionFire } from "@/components/section";
import { FogLoader } from "@/features/wizard/components/fog-loader";
import { JobPoller } from "@/features/wizard/components/job-poller";
import { JobStatus } from "@/features/wizard/components/job-status";
import type { Job, Mesh, MeshColourView } from "@/lib/store";
import { cancelMesh, colourMesh, generateMesh } from "../actions/mesh";
import { MeshViewer } from "./mesh-viewer";

const EXPECTED = 50; // seconds, Hunyuan3D-2 MV turbo on the 4080
const ORDER: { id: MeshColourView; label: string; need?: boolean }[] = [
  { id: "front", label: "Front", need: true },
  { id: "side", label: "Side", need: true },
  { id: "back", label: "Back", need: true },
  { id: "threequarter", label: "Three-quarter" },
];

// Optional last section: the character in 3D from the front, side and back. Next does not wait.
// views: the current image of each view, to tell when the colour is older than a fixed view.
export function MeshSection(props: { projectId: string; mesh: Mesh | null; views: Partial<Record<MeshColourView, string>>; ready: boolean; locked: boolean; busy?: boolean; job?: Job; cid?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [starting, start] = useTransition();
  const running = props.job?.status === "running";
  const stale = !!props.mesh && props.mesh.front !== props.views.front;
  const colours = props.mesh?.colours;
  const recolour = !!props.mesh && !stale && (!props.mesh.coloured || (Object.keys(props.views) as MeshColourView[]).some((v) => colours?.[v] !== props.views[v]));
  const busy = props.locked || running || starting || !!props.busy;
  const blocked = props.locked ? "Looks good in Edit first" : !props.ready ? "Generate the turnaround first" : null;
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const act = (fn: (id: string, cid?: unknown) => Promise<void>) => {
    setError(null);
    start(() => fn(props.projectId, props.cid).catch((e: Error) => setError(e.message)));
  };

  return (
    <Section
      id="model"
      n="6"
      tone="bg-tone-cyan"
      title="3D model"
      line="Optional. A mesh from the front, side and back. Skip it: Next does not wait."
      summary={props.mesh ? (stale ? "Out of date: the front view changed" : "Made · open to turn it") : props.ready ? "No 3D model yet · skip if you don't need it" : "Paint the front, side and back views first"}
      open={running || stale || (props.ready && !props.mesh)}
      className="nifl-enter"
      style={{ "--i": 6 } as React.CSSProperties}
    >
      <JobPoller running={running} />
      <p className="text-xs text-muted-foreground">About a minute. Hunyuan3D builds the shape; colour is projected from the views. The wizard works without this.</p>
      <ul className="grid grid-cols-4 gap-2">
        {ORDER.map((v) => {
          const img = props.views[v.id];
          return (
            <li key={v.id} className="flex min-w-0 flex-col gap-1">
              {img ? (
                <FadeImage src={file(img)} alt={`${v.label} view`} className="aspect-square w-full rounded-xl border bg-card object-contain" />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded-xl border bg-card/40 text-xs text-muted-foreground">{v.need ? "Needed" : "If painted"}</div>
              )}
              <span className="truncate text-xs text-muted-foreground">{v.label}</span>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {props.job?.status === "error" && <p className="text-sm text-destructive">The 3D model failed: {props.job.error}</p>}
      {stale && !running && <p className="rounded-md border border-dashed px-3 py-1.5 text-xs text-muted-foreground">The front view changed. Generate again so the mesh matches it.</p>}
      {recolour && !running && (
        <p className="rounded-md border border-dashed px-3 py-1.5 text-xs text-muted-foreground">
          {props.mesh?.coloured ? "A view changed since it was coloured. Colour again to match it." : "Made before models had colour. Colour it from the views in a few seconds."}
        </p>
      )}
      <SectionFire hint={blocked ?? (props.mesh ? (stale ? "Views changed" : "Rebuilds the shape · ~50 s") : "Front, side and back · ~50 s")}>
        {recolour && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(colourMesh)}>
            <Palette data-icon="inline-start" />
            {props.mesh?.coloured ? "Colour again" : "Colour it"}
          </Button>
        )}
        {props.mesh && (
          <a href={file(props.mesh.coloured ?? props.mesh.glb)} download={`character${props.mesh.coloured ? "-coloured" : ""}.glb`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <Download data-icon="inline-start" />
            Download GLB
          </a>
        )}
        <Button size="lg" disabled={busy || !!blocked} onClick={() => act(generateMesh)}>
          {starting && !running ? <LoadingDots /> : props.mesh ? <RefreshCw data-icon="inline-start" /> : <Box data-icon="inline-start" />}
          {props.mesh ? "Generate again" : "Generate 3D"}
          <ArrowRight data-icon="inline-end" />
        </Button>
      </SectionFire>
      {running && props.job && <JobStatus message={props.job.detail ?? "Building the 3D model"} startedAt={props.job.startedAt} expected={EXPECTED} onCancel={() => cancelMesh(props.projectId, props.cid)} />}
      <div className="relative mx-auto aspect-[7/9] w-full max-w-[32rem] overflow-hidden rounded-xl border bg-card">
        {props.mesh ? (
          <MeshViewer key={props.mesh.coloured ?? props.mesh.glb} url={file(props.mesh.coloured ?? props.mesh.glb)} className="absolute inset-0" />
        ) : (
          <div className={`flex size-full items-center justify-center px-6 text-center text-sm text-muted-foreground ${starting && !running ? "nifl-loading" : ""}`}>
            {starting || running ? "" : props.ready ? "The model lands here. Skip this step if you don't need it." : "Paint the front, side and back views first."}
          </div>
        )}
        {running && props.job && (
          <FogLoader className="absolute inset-0" message={props.job.detail ?? "Building the 3D model"} startedAt={props.job.startedAt} expected={EXPECTED} onCancel={() => cancelMesh(props.projectId, props.cid)} />
        )}
      </div>
    </Section>
  );
}
