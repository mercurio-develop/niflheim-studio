import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { StageStep } from "@/features/stage/components/stage-step";
import { StepRail } from "@/features/wizard/components/step-rail";
import { placementStale, stepStates } from "@/lib/progress";
import { getProject } from "@/lib/store";

async function Stage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const s = project.set;
  const fill = s?.stage && s.stage.image === s.image ? s.stage.fill : undefined;
  // The character stands on the levelled floor of a filled stage; without one, back to the set.
  if (!fill?.camera?.floor) redirect(`/p/${id}/set`);
  const front = project.turnaround?.views.front;
  if (!front?.versions[front.current]) redirect(`/p/${id}/turnaround`);
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <StepRail projectId={id} active="stage" states={stepStates(project)} />
      <StageStep projectId={id} fill={{ ...fill, camera: fill.camera }} stage={project.stage ?? null} front={front.versions[front.current].image} moved={placementStale(project) === "set"} job={project.jobs.stage} />
    </main>
  );
}

export default function Page(props: PageProps<"/p/[id]/stage">) {
  return (
    <Suspense>
      <Stage params={props.params} />
    </Suspense>
  );
}
