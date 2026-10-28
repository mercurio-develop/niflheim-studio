"use client";

import { JobPoller } from "@/features/wizard/components/job-poller";
import { NextBar } from "@/features/wizard/components/next-bar";
import type { Job, SetData, StageData } from "@/lib/store";
import { DescribeSection } from "./describe-section";
import { StageSection } from "./stage-section";

// Step 03: one painting becomes a 3D stage, and the character stands in it. Describe (or upload)
// the place and pick a painting; its stage is built and filled; the character is cut out of the
// turnaround and placed on the floor. The camera move comes next (scene-camera).
export function SceneStep(props: {
  projectId: string;
  set: SetData | null;
  style: string; // the character's style, the set's default
  placement: StageData | null;
  front: string | null;
  moved: boolean;
  setJob?: Job;
  stageJob?: Job;
}) {
  const building = props.setJob?.status === "running";
  const cutting = props.stageJob?.status === "running";
  const at = props.placement?.at;
  const fresh = !!props.set?.stage && props.set.stage.image === props.set.image;
  return (
    <>
      <JobPoller running={building || cutting} />
      <div className="flex min-w-0 flex-col gap-10">
        <div className="nifl-enter flex flex-col gap-1">
          <span className="font-mono text-xs text-muted-foreground">03 · Scene</span>
          <h1 className="text-2xl font-semibold tracking-tight">Build the place, stand them in it</h1>
        </div>
        <DescribeSection projectId={props.projectId} set={props.set} style={props.style} job={props.setJob} locked={cutting} />
        <StageSection projectId={props.projectId} set={props.set} placement={props.placement} front={props.front} moved={props.moved} setJob={props.setJob} stageJob={props.stageJob} />
      </div>
      <NextBar
        back={{ href: `/p/${props.projectId}/turnaround`, label: "Turnaround" }}
        summary={building || cutting ? ((building ? props.setJob : props.stageJob)?.detail ?? "Working...") : at && !props.moved ? `Standing in the set, ${props.placement!.height.toFixed(2)} m tall.` : fresh ? "Stand the character on the stage to continue." : "Paint or upload a set to continue."}
        next={{ label: "Shot", disabled: true, hint: at ? "The shot step comes next" : undefined }}
      />
    </>
  );
}
