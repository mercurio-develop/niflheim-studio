import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { TurnaroundStep } from "@/features/turnaround/components/turnaround-step";
import { StepRail } from "@/features/wizard/components/step-rail";
import { characterImage, stepStates } from "@/lib/progress";
import { getProject } from "@/lib/store";

async function Turnaround({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const character = characterImage(project);
  if (!character || !project.character.doneAt) redirect(`/p/${id}/character`);
  const version = project.character.versions[project.character.current!];
  const t = project.turnaround;
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <StepRail projectId={id} active="turnaround" states={stepStates(project)} />
      <TurnaroundStep
        projectId={id}
        character={character}
        characterLabel={version.label}
        tags={version.tags ?? []}
        options={t?.options ?? null}
        views={t?.views ?? {}}
        fresh={t?.source === character}
        assets={project.assets ?? []}
        jobs={project.jobs}
      />
    </main>
  );
}

export default function Page(props: PageProps<"/p/[id]/turnaround">) {
  return (
    <Suspense>
      <Turnaround params={props.params} />
    </Suspense>
  );
}
