"use client";

import { ParticleField } from "@/components/particle-field";
import { SectionNav } from "@/components/section-nav";
import { JobPoller } from "@/features/wizard/components/job-poller";
import { NextBar } from "@/features/wizard/components/next-bar";
import type { Block, Job, SceneAsset, SetData, StageData } from "@/lib/store";
import { DescribeSection } from "./describe-section";
import { StageSection } from "./stage-section";
import type { CastOption } from "./cast-picker";

// Step 02: one painting becomes a 3D stage, and the character stands in it. Describe (or upload)
// the place and pick a painting; its stage is built and filled; the character is cut out of the
// turnaround and placed on the floor. Each shot's camera and walk are set in Shots (decision 0011).
export function SceneStep(props: {
  projectId: string;
  set: SetData | null;
  style: string; // the character's style, the set's default
  placement: StageData | null;
  blocks: Block[];
  assets: SceneAsset[];
  assetJobs: Record<string, Job>;
  characterAssets: string[];
  cast: CastOption[];
  front: string | null;
  moved: boolean;
  setJob?: Job;
  stageJob?: Job;
}) {
  const building = props.setJob?.status === "running";
  const cutting = props.stageJob?.status === "running" && props.stageJob.detail !== "Rendering the camera move";
  const stageBusy = props.stageJob?.status === "running";
  const at = props.placement?.at;
  const fresh = !!props.set?.stage && props.set.stage.image === props.set.image;
  const cam = fresh ? props.set!.stage!.fill?.camera : undefined;
  const ready = !!cam?.floor && !!at;
  const making = Object.values(props.assetJobs).some((j) => j.status === "running");
  return (
    <>
      <JobPoller running={building || stageBusy || making} />
      {/* Like Character's: the field drifts while the set is painted, the stage built or an asset
          made, then gathers onto the new paintings and the stage ([data-land]) and bursts. */}
      <ParticleField active={building || cutting || making} />
      <div className="grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)]">
        <SectionNav items={[{ id: "describe", n: "1", title: "Describe", tone: "bg-tone-yellow" }, { id: "stage", n: "2", title: "Stage", tone: "bg-tone-cyan" }]} />
        <div className="flex min-w-0 flex-col gap-10">
        <div className="nifl-enter flex flex-col gap-1">
          <span className="font-mono text-xs text-muted-foreground">02 · Scene</span>
          <h1 className="text-2xl font-semibold tracking-tight">Build the place, stand them in it</h1>
        </div>
        <DescribeSection projectId={props.projectId} set={props.set} style={props.style} job={props.setJob} locked={stageBusy} />
        <StageSection
          projectId={props.projectId}
          set={props.set}
          placement={props.placement}
          blocks={props.blocks}
          assets={props.assets}
          assetJobs={props.assetJobs}
          characterAssets={props.characterAssets}
          cast={props.cast}
          front={props.front}
          moved={props.moved}
          setJob={props.setJob}
          stageJob={props.stageJob}
        />
        </div>
      </div>
      <NextBar
        back={{ href: `/p/${props.projectId}/character`, label: "Character" }}
        summary={building || cutting ? ((building ? props.setJob : props.stageJob)?.detail ?? "Working...") : at && !props.moved ? `Standing in the set, ${props.placement!.height.toFixed(2)} m tall.` : fresh ? "Stand the character on the stage to continue." : "Paint or upload a set to continue."}
        next={{ label: "Shots", href: `/p/${props.projectId}/shot`, disabled: !ready }}
      />
    </>
  );
}
