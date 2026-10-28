import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { SetStep } from "@/features/set/components/set-step";
import { StageStep } from "@/features/stage/components/stage-step";
import { StepRail } from "@/features/wizard/components/step-rail";
import { placementStale, stepStates } from "@/lib/progress";
import { getProject } from "@/lib/store";

// The scene: build the place from one painting, then stand the character in it. Until scene-ui
// makes it one step, the Set and Stage steps sit one above the other; once the stage has its
// floor, the set's own footer is hidden so the page has one way forward.
async function Scene({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  if (!project.character.doneAt) redirect(`/p/${id}/character`);
  const s = project.set;
  const fill = s?.stage && s.stage.image === s.image ? s.stage.fill : undefined;
  const front = project.turnaround?.views.front;
  const image = front?.versions[front.current]?.image;
  const place = !!fill?.camera?.floor && !!image;
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <StepRail projectId={id} active="scene" states={stepStates(project)} />
      <div className={place ? "[&_.sticky]:hidden" : undefined}>
        <SetStep projectId={id} set={project.set ?? null} style={project.character.style} job={project.jobs.set} />
      </div>
      {place && <StageStep projectId={id} fill={{ ...fill, camera: fill.camera! }} stage={project.stage ?? null} front={image} moved={placementStale(project) === "set"} job={project.jobs.stage} />}
    </main>
  );
}

export default function Page(props: PageProps<"/p/[id]/scene">) {
  return (
    <Suspense>
      <Scene params={props.params} />
    </Suspense>
  );
}
