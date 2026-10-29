import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { SceneStep } from "@/features/scene/components/scene-step";
import { StepRail } from "@/features/wizard/components/step-rail";
import { characterImage, placementStale, stepStates, viewImage, viewsFor } from "@/lib/progress";
import { getProject } from "@/lib/store";

async function Scene({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  if (!project.character.doneAt) redirect(`/p/${id}/character`);
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <StepRail projectId={id} active="scene" states={stepStates(project)} />
      <SceneStep
        projectId={id}
        set={project.set ?? null}
        style={project.character.style}
        placement={project.stage ?? null}
        blocks={project.blocks ?? []}
        assets={project.sceneAssets ?? []}
        assetJobs={Object.fromEntries(Object.entries(project.jobs).filter(([k]) => k.startsWith("scene-asset:")))}
        characterAssets={(project.assets ?? []).map((a) => a.name)}
        cast={(project.cast ?? []).map((m) => {
          // Ready once every side of its turnaround is painted from the version in use.
          const t = m.turnaround;
          const ready = !!t && t.source === characterImage(project, m.id) && viewsFor(t.options).every((v) => t.views[v.id]?.versions.length);
          return { cid: m.id, name: m.name, image: viewImage(project, "front", m.id), ready, onStage: project.sceneAssets?.find((a) => a.cid === m.id)?.id ?? null };
        })}
        front={viewImage(project, "front")}
        moved={placementStale(project) === "set"}
        setJob={project.jobs.set}
        stageJob={project.jobs.stage}
      />
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
