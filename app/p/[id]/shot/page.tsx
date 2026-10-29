import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { ShotCamera } from "@/features/shot/components/shot-camera";
import { ShotKeyframes } from "@/features/shot/components/shot-keyframes";
import { ShotStep } from "@/features/shot/components/shot-step";
import { StepRail } from "@/features/wizard/components/step-rail";
import { frameCount } from "@/lib/camera";
import { stepStates } from "@/lib/progress";
import { allShots, getProject } from "@/lib/store";

async function Shot({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  if (!project.character.doneAt) redirect(`/p/${id}/character`);
  const k = project.keyframes;
  const seconds = project.camera?.seconds ?? 4;
  // The keys must be painted and cover today's move: their last frame is the move's last.
  const ready = !!k && k.keys.length > 0 && k.keys.every(Boolean) && k.frames.at(-1) === frameCount(seconds) - 1;
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <StepRail projectId={id} active="shot" states={stepStates(project)} />
      <ShotStep
        key={project.activeShot}
        shots={allShots(project).map((s) => ({ id: s.id, name: s.name, active: s.active, picked: s.shot?.picked !== undefined }))}
        projectId={id} keyframes={k ?? null} ready={ready} seconds={seconds} shot={project.shot ?? null} job={project.jobs.shot}
        keysRunning={project.jobs.keyframes?.status === "running" || project.jobs.stage?.status === "running"}
        cameraPanel={<ShotCamera projectId={id} set={project.set ?? null} placement={project.stage ?? null} camera={project.camera ?? null} cameraRender={project.cameraRender ?? null} stageJob={project.jobs.stage} />}
        keyPanel={<ShotKeyframes projectId={id} set={project.set ?? null} placement={project.stage ?? null} camera={project.camera ?? null} keyframes={k ?? null} job={project.jobs.keyframes} />}
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
