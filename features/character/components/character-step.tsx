import type { Project } from "@/lib/store";
import { JobPoller } from "@/features/wizard/components/job-poller";
import { ConceptGrid } from "./concept-grid";
import { JobLine } from "./job-line";
import { PartEditor } from "./part-editor";
import { Versions } from "./versions";

export function CharacterStep({ project }: { project: Project }) {
  const { character: c, jobs } = project;
  const running = (k: string) => jobs[k]?.status === "running";
  const version = c.current === null ? null : c.versions[c.current];
  const anyRunning = Object.values(jobs).some((j) => j.status === "running");

  return (
    <div className="flex flex-col gap-10">
      <JobPoller running={anyRunning} />
      <div className="flex flex-col gap-2">
        <span className="font-mono text-xs text-muted-foreground">01 · Character</span>
        <h1 className="max-w-3xl text-2xl font-semibold tracking-tight text-balance">{c.prompt}</h1>
        <JobLine job={jobs.concepts} running="painting 4 concepts... about a minute" />
      </div>

      <ConceptGrid
        projectId={project.id}
        concepts={c.concepts}
        picked={version && c.concepts.includes(version.image) ? version.image : null}
        running={running("concepts")}
      />

      {version ? (
        <>
          <PartEditor
            key={c.current}
            projectId={project.id}
            version={version}
            masking={running("mask")}
            swapping={running("swap")}
          />
          <JobLine job={jobs.mask} running="finding the part..." />
          <JobLine job={jobs.swap} running="swapping the part... about 45 s" />
          <Versions projectId={project.id} versions={c.versions} current={c.current!} busy={anyRunning} />
        </>
      ) : (
        c.concepts.length > 0 && <p className="text-sm text-muted-foreground">Pick the concept you want to keep working on.</p>
      )}
    </div>
  );
}
