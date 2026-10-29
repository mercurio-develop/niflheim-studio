import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { ShotCamera } from "@/features/shot/components/shot-camera";
import { ShotKeyframes } from "@/features/shot/components/shot-keyframes";
import { ShotStep } from "@/features/shot/components/shot-step";
import { keysProblem, suggestedKind } from "@/features/shot/state";
import { StepRail } from "@/features/wizard/components/step-rail";
import { stepStates } from "@/lib/progress";
import { allShots, getProject } from "@/lib/store";

async function Shot({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  if (!project.character.doneAt) redirect(`/p/${id}/character`);
  const k = project.keyframes;
  const seconds = project.camera?.seconds ?? 4;
  const ready = !keysProblem(project);
  // The shot before this one, which this one can continue from once it has a take.
  const shots = allShots(project);
  const prev = shots[shots.findIndex((s) => s.active) - 1];
  const continuity = prev ? { from: prev.name, hasTake: !!prev.shot?.takes.length, seeded: project.seededFrom ?? null } : null;
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <StepRail projectId={id} active="shot" states={stepStates(project)} />
      <ShotStep
        key={project.activeShot}
        shots={allShots(project).map((s) => ({ id: s.id, name: s.name, active: s.active, picked: s.shot?.picked !== undefined }))}
        projectId={id} keyframes={k ?? null} ready={ready} seconds={seconds} shot={project.shot ?? null} job={project.jobs.shot}
        suggested={suggestedKind(project)}
        sheet={project.sheet?.drawn ?? null}
        keysRunning={["keyframes", "stage", "layout"].some((j) => project.jobs[j]?.status === "running")}
        cameraPanel={<ShotCamera projectId={id} set={project.set ?? null} placement={project.stage ?? null} camera={project.camera ?? null} cameraRender={project.cameraRender ?? null} blocks={project.blocks ?? []} assets={project.sceneAssets ?? []} poses={project.poses ?? []} stageJob={project.jobs.stage} />}
        keyPanel={<ShotKeyframes projectId={id} set={project.set ?? null} placement={project.stage ?? null} camera={project.camera ?? null} keyframes={k ?? null} blocks={project.blocks ?? []} assets={project.sceneAssets ?? []} poses={project.poses ?? []} job={project.jobs.keyframes} continuity={continuity} layout={project.layout ?? null} />}
      />
    </main>
  );
}

export default function Page(props: PageProps<"/p/[id]/shot">) {
  return (
    <Suspense>
      <Shot params={props.params} />
    </Suspense>
  );
}
