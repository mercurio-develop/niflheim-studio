import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { SetStep } from "@/features/set/components/set-step";
import { StepRail } from "@/features/wizard/components/step-rail";
import { stepStates } from "@/lib/progress";
import { getProject } from "@/lib/store";

async function Set({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  if (!project.character.doneAt) redirect(`/p/${id}/character`);
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <StepRail projectId={id} active="set" states={stepStates(project)} />
      <SetStep projectId={id} set={project.set ?? null} style={project.character.style} job={project.jobs.set} />
    </main>
  );
}

export default function Page(props: PageProps<"/p/[id]/set">) {
  return (
    <Suspense>
      <Set params={props.params} />
    </Suspense>
  );
}
