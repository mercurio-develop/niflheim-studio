import type { Project } from "@/lib/store";
import { historyMoves } from "@/lib/history";
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
  const anyRunning = Object.values(jobs).some((j) => j.status === "running");

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
        <JobPoller running={anyRunning} />
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
                projectId={project.id}
                version={version}
                parentImage={moves.parent === null ? null : c.versions[moves.parent].image}
                moves={moves}
                style={c.style ?? "painterly"}
                jobs={{ mask: jobs.mask, swap: jobs.swap, tags: jobs.tags, brush: jobs.brush, restyle: jobs.restyle }}
              />
            </div>
          )}
        </div>

        <VersionsSidebar projectId={project.id} versions={c.versions} current={c.current} busy={anyRunning} />
      </div>
      <NextBar
        summary={version ? <><span className="font-mono text-xs">v{c.current! + 1}</span> · {version.label}</> : "Pick a concept to continue"}
        next={{ label: "Character done", hint: "next: turnaround", disabled: !version || anyRunning, onNext: finishCharacter.bind(null, project.id) }}
      />
    </>
  );
}
