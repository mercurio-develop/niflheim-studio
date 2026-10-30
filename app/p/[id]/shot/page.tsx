import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { ShotCamera } from "@/features/shot/components/shot-camera";
import { ShotKeyframes } from "@/features/shot/components/shot-keyframes";
import { ShotStep } from "@/features/shot/components/shot-step";
import { asShot, beatsStale, keysProblem, subjectOf, suggestedKind } from "@/features/shot/state";
import { namedCaptions, whoOf } from "@/features/shot/ingredients";
import { StepRail } from "@/features/wizard/components/step-rail";
import { mainInShot, shotAssets, stepStates } from "@/lib/progress";
import { allShots, getProject } from "@/lib/store";

async function Shot({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  if (!project.character.doneAt) redirect(`/p/${id}/character`);
  if (stepStates(project).scene !== "done") redirect(`/p/${id}/scene`);
  // Captions shown with the character named as the take will say them.
  const k = project.keyframes && { ...project.keyframes, captions: namedCaptions(asShot(project)) };
  const seconds = project.keyframes?.full !== undefined ? (project.keyframes.frames.at(-1)! + 1) / 24 : (project.camera?.seconds ?? 4);
  const ready = !keysProblem(project);
  // The shot before this one, which this one can continue from once it has a take.
  const shots = allShots(project);
  const prev = shots[shots.findIndex((s) => s.active) - 1];
  const view = asShot(project);
  const off = project.shot?.off ?? [];
  const inShot = [{ id: "main", name: whoOf(project.character.prompt ?? "").name.replace(/^the /, "") || "The character" }, ...(project.sceneAssets ?? []).filter((a) => a.at).map((a) => ({ id: a.id, name: a.name }))].map((x) => ({ ...x, on: !off.includes(x.id) }));
  const continuity = prev ? { from: prev.name, hasTake: !!prev.shot?.takes.length, seeded: project.seededFrom ?? null } : null;
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <StepRail projectId={id} active="shot" states={stepStates(project)} />
      <ShotStep
        key={project.activeShot}
        shots={allShots(project).map((s) => ({ id: s.id, name: s.name, active: s.active, picked: s.shot?.picked !== undefined }))}
        projectId={id} keyframes={k ?? null} ready={ready} seconds={seconds} shot={project.shot ?? null} job={project.jobs.shot}
        suggested={suggestedKind(project)}
        move={project.camera?.move ?? "static"}
        inShot={inShot}
        subject={subjectOf(project)?.id ?? null}
        expressions={project.expressions ?? []}
        sheet={view.sheet?.drawn ?? null}
        faceRef={view.sheet?.cells.find((c) => c.id === "face-front")?.image ?? null}
        choices={{
          expressions: (project.sheet?.cells ?? []).filter((c) => c.kind === "expression" && c.image).map((c) => ({ id: c.id, label: c.label })),
          poses: (project.poses ?? []).filter((x) => x.views.front).map((x) => ({ id: x.id, label: x.label })),
          props: view.sceneAssets!.filter((a) => a.at && (a.kind === "character" ? a.cutouts?.front : a.views?.front)).map((a) => ({ id: a.id, label: a.name })),
        }}
        keysRunning={["keyframes", "stage", "layout", "shotsheet"].some((j) => project.jobs[j]?.status === "running")}
        cameraPanel={<ShotCamera projectId={id} set={project.set ?? null} placement={project.stage ?? null} camera={project.camera ?? null} blocks={project.blocks ?? []} assets={shotAssets(project)} poses={project.poses ?? []} noMain={!mainInShot(project)} />}
        keyPanel={<ShotKeyframes projectId={id} set={project.set ?? null} placement={project.stage ?? null} camera={project.camera ?? null} keyframes={k ?? null} blocks={project.blocks ?? []} assets={shotAssets(project)} poses={project.poses ?? []} job={project.jobs.keyframes} continuity={continuity} layout={project.layout ?? null} layoutJob={project.jobs.layout} beatsChanged={beatsStale(project)} noMain={!mainInShot(project)} canCut={(project.shot?.kind ?? suggestedKind(project)) === "camera"} />}
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
