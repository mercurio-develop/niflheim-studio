import { allCharacters, charOf, type Job, type Project } from "@/lib/store";
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
import { CharacterRoster, type RosterCard } from "./character-roster";

// One character's jobs under their plain keys: c1's are the unprefixed ones, another's are
// "<cid>:<key>" (lib/store.ts charKey).
function jobsOf(all: Record<string, Job>, cid: string): Record<string, Job> {
  if (cid === "c1") return Object.fromEntries(Object.entries(all).filter(([k]) => !/^c\d+:/.test(k)));
  return Object.fromEntries(Object.entries(all).flatMap(([k, j]) => (k.startsWith(`${cid}:`) ? [[k.slice(cid.length + 1), j]] : [])));
}
// Next waits only for this step's own jobs (part tags aside): a Scene or Shots job leaves it free.
const own = (k: string) => ["concepts", "mask", "brush", "swap", "restyle", "turnaround", "mesh", "hide-masks", "assets", "replicate"].includes(k) || /^(view|asset|pose):/.test(k);
const ownJobOf = (jobs: Record<string, Job>) => Object.entries(jobs).find(([k, j]) => own(k) && !k.endsWith(":tags") && j.status === "running")?.[1];
// Every side of the turnaround painted from the version in use.
function completeOf(p: Project, cid: string) {
  const image = characterImage(p, cid);
  const t = charOf(p, cid).turnaround;
  const fresh = !!image && t?.source === image;
  return { image, t, fresh, complete: fresh && !!t && viewsFor(t.options).every((v) => t.views[v.id]?.versions.length) };
}

// The cast, each character a card; the selected one (cid, from ?c=) is open below with every
// section, made through the same actions with its id. Next (to the Scene) waits on c1 only: the
// others are optional extras for the stage.
export function CharacterStep({ project, cid = "c1" }: { project: Project; cid?: string }) {
  const { character: c } = charOf(project, cid);
  const jobs = jobsOf(project.jobs, cid);
  const version = c.current === null ? null : c.versions[c.current];
  const moves = historyMoves(project, cid);
  // Part tags load in the background: only the part chips wait for them, the rest keeps working.
  const polling = Object.values(project.jobs).some((j) => j.status === "running");
  // A card per character: its picture and how far it got.
  const cards: RosterCard[] = allCharacters(project).map((ch) => {
    const d = ch.data;
    const { image: pic, t: tc, complete: done } = completeOf(project, ch.id);
    const at = d.character.current;
    const views = tc ? Object.values(tc.views).filter((s) => s?.versions.length).length : 0;
    const summary = at === null ? "No concept picked yet" : [`v${at + 1}`, views ? `${views} views${done ? "" : " (not all)"}` : "no turnaround", d.poses?.length ? `${d.poses.length} poses` : "", d.mesh ? "3D" : ""].filter(Boolean).join(" · ");
    const running = Object.entries(jobsOf(project.jobs, ch.id)).some(([k, j]) => own(k) && j.status === "running");
    return { id: ch.id, name: ch.name, image: pic ?? null, summary, done, running };
  });
  // The history only waits for the jobs that add a character version (each makes its result the
  // current one); a turnaround, a 3D model or a Scene job leaves it free to browse.
  const editing = ["concepts", "mask", "brush", "swap", "restyle"].some((k) => jobs[k]?.status === "running");
  // The turnaround is part of this step: Next waits for every view, painted from this version.
  const { image, t, fresh } = completeOf(project, cid);
  const views = t?.views ?? {};
  const data = charOf(project, cid);
  // Next is c1's: its version, its turnaround, its jobs, whichever character is open.
  const c1 = project.character;
  const v1 = c1.current === null ? null : c1.versions[c1.current];
  const { t: t1, fresh: fresh1, complete } = completeOf(project, "c1");
  const ownJob = ownJobOf(jobsOf(project.jobs, "c1"));
  // Why Next is off, in words: the turnaround belongs to another version (picked in History), a
  // view is missing, or a job of this step is still running.
  const from = t1 ? c1.versions.findIndex((v) => v.image === t1.source) : -1;
  const hint = !v1
    ? undefined
    : ownJob
      ? `Wait: ${ownJob.detail ?? "a job is running"}`
      : t1 && !fresh1
        ? from >= 0
          ? `The turnaround is from v${from + 1}: pick it in History, or paint the turnaround again`
          : "The turnaround is from another version: paint it again"
        : !complete
          ? "Paint every view of the turnaround first"
          : undefined;

  return (
    <>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
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
            <h1 className="text-2xl font-semibold tracking-tight">Make your characters</h1>
          </div>

          <CharacterRoster projectId={project.id} selected={cid} cards={cards} />

          <div className="nifl-enter" style={{ "--i": 1 } as React.CSSProperties}>
            <ConceptSection
              key={`${cid}-${version ? "has" : "none"}`}
              projectId={project.id}
              cid={cid}
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
                key={`${cid}-${c.current}`}
                id="edit"
                cid={cid}
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
              key={cid}
              projectId={project.id}
              cid={cid}
              character={image}
              characterLabel={version.label}
              tags={version.tags ?? []}
              parts={version.parts}
              options={t?.options ?? null}
              views={views}
              fresh={fresh}
              assets={data.assets ?? []}
              poses={data.poses ?? []}
              mesh={data.mesh ?? null}
              sheet={data.sheet ?? null}
              jobs={jobs}
            />
          )}
        </div>

        <VersionsSidebar key={cid} projectId={project.id} cid={cid} versions={c.versions} current={c.current} busy={editing} />
      </div>
      <NextBar
        summary={!v1 ? `Pick a concept for ${cards[0].name} to continue` : complete ? <><span className="font-mono text-xs">v{c1.current! + 1}</span> · {v1.label} · every side painted</> : t1 && !fresh1 ? "This version has no turnaround yet" : "Generate the turnaround to continue"}
        next={{ label: "Scene", disabled: !complete || !!ownJob, hint, onNext: finishCharacter.bind(null, project.id) }}
      />
    </>
  );
}
