import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CharacterStep } from "@/features/character/components/character-step";
import { StepRail } from "@/features/wizard/components/step-rail";
import { stepStates } from "@/lib/progress";
import { CID, getProject } from "@/lib/store";

async function Character({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const { c } = await searchParams;
  const project = await getProject(id);
  if (!project) notFound();
  // ?c= picks the character to work on; an unknown one falls back to the first.
  const cid = typeof c === "string" && CID.test(c) && project.cast?.some((m) => m.id === c) ? c : "c1";
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <StepRail projectId={id} active="character" states={stepStates(project)} />
      <CharacterStep key={cid} project={project} cid={cid} />
    </main>
  );
}

export default function Page(props: PageProps<"/p/[id]/character">) {
  return (
    <Suspense>
      <Character params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}
