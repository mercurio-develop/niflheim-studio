import type { Project } from "@/lib/store";
import { historyMoves } from "@/lib/history";
import { characterImage, viewsFor } from "@/lib/progress";
import { TurnaroundSections } from "@/features/turnaround/components/turnaround-step";
import { SectionNav } from "@/components/section-nav";
import { JobPoller } from "@/features/wizard/components/job-poller";
import { NextBar } from "@/features/wizard/components/next-bar";
import { finishCharacter } from "../actions/character";
import { ConceptSection } from "./concept-section";
import { Editor } from "./editor";
import { VersionsSidebar } from "./versions-sidebar";

export function CharacterStep({ project }: { project: Project }) {
  const { character: c, jobs } = project;
  const version = c.current === null ? null : c.versions[c.current];
  const moves = historyMoves(project);
  // Part tags load in the background: only the part chips wait for them, the rest keeps working.
  const polling = Object.values(jobs).some((j) => j.status === "running");
  // Next waits only for this step's own jobs (part tags aside): a Scene or Shots job leaves it free.
  const own = (k: string) => ["concepts", "mask", "brush", "swap", "restyle", "turnaround", "mesh", "hide-masks", "assets", "replicate"].includes(k) || /^(view|asset|pose):/.test(k);
  const ownJob = Object.entries(jobs).find(([k, j]) => own(k) && !k.endsWith(":tags") && j.status === "running")?.[1];
  // The history only waits for the jobs that add a character version (each makes its result the
  // current one); a turnaround, a 3D model or a Scene job leaves it free to browse.
  const editing = ["concepts", "mask", "brush", "swap", "restyle"].some((k) => jobs[k]?.status === "running");
  // The turnaround is part of this step: Next waits for every view, painted from this version.
  const image = characterImage(project);
  const t = project.turnaround;
  const views = t?.views ?? {};
  const fresh = !!image && t?.source === image;
  const complete = fresh && !!t && viewsFor(t.options).every((v) => t.views[v.id]?.versions.length);
  // Why Next is off, in words: the turnaround belongs to another version (picked in History), a
  // view is missing, or a job of this step is still running.
  const from = t ? c.versions.findIndex((v) => v.image === t.source) : -1;
  const hint = !version
    ? undefined
    : ownJob
      ? `Wait: ${ownJob.detail ?? "a job is running"}`
      : t && !fresh
        ? from >= 0
          ? `The turnaround is from v${from + 1}: pick it in History, or paint the turnaround again`
          : "The turnaround is from another version: paint it again"
        : !complete
          ? "Paint every view of the turnaround first"
          : undefined;

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
        <JobPoller running={polling} />
        <SectionNav
          items={[
            { id: "concept", n: "1", title: "Concept", tone: "bg-tone-yellow" },
            ...(version
              ? [
                  { id: "edit", n: "2", title: "Edit", tone: "bg-primary" },
                  { id: "turnaround", n: "3", title: "Turnaround", tone: "bg-tone-lilac" },
                  { id: "model", n: "4", title: "3D model", tone: "bg-tone-cyan" },
                ]
              : []),
          ]}
        />
        <div className="flex min-w-0 flex-col gap-10">
          <div className="nifl-enter flex flex-col gap-1">
            <span className="font-mono text-xs text-muted-foreground">01 · Character</span>
            <h1 className="text-2xl font-semibold tracking-tight">Make your character</h1>
          </div>

          <div className="nifl-enter" style={{ "--i": 1 } as React.CSSProperties}>
            <ConceptSection
              key={version ? "has" : "none"}
              projectId={project.id}
              prompt={c.prompt}
              style={c.style ?? "painterly"}
              seed={c.seed}
              count={c.count ?? 4}
              reference={c.reference ?? null}
              concepts={c.concepts}
              sets={c.sets ?? []}
              pickedImage={version?.image ?? null}
              hasVersion={!!version}
              job={jobs.concepts}
            />
          </div>

          {version && (
            <div className="nifl-enter" style={{ "--i": 2 } as React.CSSProperties}>
              <Editor
                key={c.current}
                id="edit"
                open={!Object.keys(views).length}
                projectId={project.id}
                version={version}
                parentImage={moves.parent === null ? null : c.versions[moves.parent].image}
                moves={moves}
                style={c.style ?? "painterly"}
                jobs={{ mask: jobs.mask, swap: jobs.swap, tags: jobs.tags, brush: jobs.brush, restyle: jobs.restyle }}
              />
            </div>
          )}

          {version && image && (
            <TurnaroundSections
              projectId={project.id}
              character={image}
              characterLabel={version.label}
              tags={version.tags ?? []}
              parts={version.parts}
              options={t?.options ?? null}
              views={views}
              fresh={fresh}
              assets={project.assets ?? []}
              poses={project.poses ?? []}
              mesh={project.mesh ?? null}
              jobs={jobs}
            />
          )}
        </div>

        <VersionsSidebar projectId={project.id} versions={c.versions} current={c.current} busy={editing} />
      </div>
      <NextBar
        summary={!version ? "Pick a concept to continue" : complete ? <><span className="font-mono text-xs">v{c.current! + 1}</span> · {version.label} · every side painted</> : t && !fresh ? "This version has no turnaround yet" : "Generate the turnaround to continue"}
        next={{ label: "Scene", disabled: !complete || !!ownJob, hint, onNext: finishCharacter.bind(null, project.id) }}
      />
    </>
  );
}
