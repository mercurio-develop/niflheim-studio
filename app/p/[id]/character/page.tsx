import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CharacterStep } from "@/features/character/components/character-step";
import { StepRail } from "@/features/wizard/components/step-rail";
import { getProject } from "@/lib/store";

async function Character({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <StepRail projectId={id} active="character" />
      <CharacterStep project={project} />
    </main>
  );
}

export default function Page(props: PageProps<"/p/[id]/character">) {
  return (
    <Suspense>
      <Character params={props.params} />
    </Suspense>
  );
}
