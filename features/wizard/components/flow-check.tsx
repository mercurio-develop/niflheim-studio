import { FadeImage } from "@/components/fade-image";
import { StatusDot } from "@/components/ui/status-dot";
import { getProject } from "@/lib/store";
import { flowBoxes } from "@/lib/job-sheet";

// The support view: one box per expect() step with its state and its picture. A blocked box names
// the missing path; a done box shows the output image. It only reads the project.
export async function FlowCheck(props: { projectId: string; cid?: string }) {
  const p = await getProject(props.projectId);
  if (!p) return null;
  const boxes = await flowBoxes(p, props.cid);
  return (
    <ol className="flex flex-col gap-3" aria-label="Flow check">
      {boxes.map((b) => (
        <li key={b.step} className="flex items-start gap-3 rounded border p-3 text-xs text-muted-foreground">
          {b.output && <FadeImage src={`/api/files/${p.id}/${b.output}`} alt={`${b.step} output`} className="aspect-[768/448] w-32 shrink-0 rounded border bg-muted object-contain" />}
          <div className="flex min-w-0 flex-col gap-1">
            <StatusDot on={!b.blocked} label={b.blocked ? "Blocked" : "Done"} />
            <span className="text-foreground">{b.description}</span>
            {b.blocked && <span className="break-all font-mono text-[11px]">Missing: {b.missing.join(", ")}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}
