import type { Project } from "@/lib/store";
import { JobPoller } from "@/features/wizard/components/job-poller";
import { ConceptSection } from "./concept-section";
import { PartEditor } from "./part-editor";
import { VersionsSidebar } from "./versions-sidebar";
import { NextBar } from "@/features/wizard/components/next-bar";
import { finishCharacter } from "../actions/character";

export function CharacterStep({ project }: { project: Project }) {
  const { character: c, jobs } = project;
  const version = c.current === null ? null : c.versions[c.current];
  const picked = version ? c.concepts.indexOf(version.image) : -1;
  const anyRunning = Object.values(jobs).some((j) => j.status === "running");

  return (
    <>
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
      <JobPoller running={anyRunning} />
      <div className="flex min-w-0 flex-col gap-8">
        <div className="nifl-enter flex flex-col gap-2">
          <span className="font-mono text-xs text-muted-foreground">01 · Character</span>
          <h1 className="max-w-3xl text-2xl font-semibold tracking-tight text-balance">{c.prompt}</h1>
        </div>

        <div className="nifl-enter" style={{ "--i": 1 } as React.CSSProperties}>
        <ConceptSection
          key={version ? "has" : "none"}
          projectId={project.id}
          concepts={c.concepts}
          style={c.style ?? "painterly"}
          picked={picked >= 0 ? picked : null}
          hasVersion={!!version}
          job={jobs.concepts}
        />
        </div>

        {version && <div className="nifl-enter" style={{ "--i": 2 } as React.CSSProperties}><PartEditor key={c.current} projectId={project.id} version={version} jobs={{ mask: jobs.mask, swap: jobs.swap, tags: jobs.tags }} /></div>}
      </div>

      <VersionsSidebar projectId={project.id} versions={c.versions} current={c.current} busy={anyRunning} />
    </div>
    <NextBar
      summary={version ? <><span className="font-mono text-xs">v{c.current! + 1}</span> · {version.label}</> : "Pick a concept to continue"}
      next={{
        label: "Character done",
        hint: "next: turnaround",
        disabled: !version || anyRunning,
        onNext: finishCharacter.bind(null, project.id),
      }}
    />
    </>
  );
}
