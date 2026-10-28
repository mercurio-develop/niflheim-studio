import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { reelClips, reelOrder } from "@/features/reel/clips";
import { AutopilotPanel } from "@/features/reel/components/autopilot";
import { ReelStep } from "@/features/reel/components/reel-step";
import { StepRail } from "@/features/wizard/components/step-rail";
import { currentFill, stepStates } from "@/lib/progress";
import { allShots, getProject } from "@/lib/store";

async function Export({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  if (!project.character.doneAt) redirect(`/p/${id}/character`);
  const shots = allShots(project);
  const rows = reelOrder(project).map((sid) => {
    const s = shots.find((x) => x.id === sid)!;
    return { shot: s.id, name: s.name, video: s.shot?.picked !== undefined ? (s.shot.takes[s.shot.picked]?.video ?? null) : null };
  });
  const clips = reelClips(project);
  const joins = project.reel?.joins ?? [];
  const key = JSON.stringify({ clips: clips.map((c) => c.video), joins: clips.slice(1).map((_, i) => joins[i] ?? "cut") });
  const exp = project.reel?.export;
  // What autopilot needs to capture keyframes in the browser: the filled stage and where the
  // character stands (the same for every shot).
  const fill = currentFill(project);
  const st = project.stage;
  const scene =
    fill?.camera?.floor && st?.at && Object.keys(st.cutouts).length
      ? {
          mesh: `/api/files/${id}/${fill.mesh}`,
          camera: fill.camera,
          cutouts: Object.fromEntries(Object.entries(st.cutouts).map(([v, f]) => [v, `/api/files/${id}/${f}`])),
          at: st.at,
          height: st.height,
          turn: st.turn,
        }
      : null;
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <StepRail projectId={id} active="export" states={stepStates(project)} />
      <ReelStep
        autopilot={<AutopilotPanel projectId={id} shots={shots.map((s) => ({ id: s.id, name: s.name, move: s.camera ?? null }))} pilot={project.autopilot ?? null} scene={scene} />}
        projectId={id} rows={rows} joins={joins} export={exp ? { video: exp.video, seconds: exp.seconds, current: exp.key === key } : null} job={project.jobs.reel} />
    </main>
  );
}

export default function Page(props: PageProps<"/p/[id]/export">) {
  return (
    <Suspense>
      <Export params={props.params} />
    </Suspense>
  );
}
