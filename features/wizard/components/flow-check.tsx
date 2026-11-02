import { readFile } from "node:fs/promises";
import path from "node:path";
import { redirect } from "next/navigation";
import { FadeImage } from "@/components/fade-image";
import { StatusDot } from "@/components/ui/status-dot";
import { onCloud } from "@/lib/comfy";
import { getProject } from "@/lib/store";
import { effectsOf } from "@/features/reel/effects";
import { flowBoxes, flowChain, flowLines } from "@/lib/job-sheet";

// Both effect workflows run on the LTX-2.5 distilled unet.
const EFFECT_MODEL = "ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors";
const EFFECT_FLOW = { night: "04_effect_night.api.json", refine: "04_effect_refine.api.json" } as const;

// The Comfy workflows behind a chain box, by its id. The sheet boxes run a script or an action, not Comfy.
function comfyFlows(id: string, clay: boolean): string[] {
  if (id.startsWith("view:") || id === "expression") return ["01_edit.api.json"];
  if (id.startsWith("pose:")) return ["01_edit.api.json", "02_cutout.api.json"];
  if (id === "stage") return ["02_cutout.api.json"];
  if (id === "take") return [clay ? "03_shot_layout.api.json" : "03_shot.api.json"];
  return [];
}

// Puts the workflow file in the running Comfy UI's own workflow list (its userdata, not the
// project) and goes to the UI. Only names that are files in workflows/ are accepted.
async function openInComfy(data: FormData) {
  "use server";
  const name = String(data.get("workflow") ?? "");
  if (!/^\w+\.api\.json$/.test(name)) return;
  const base = (process.env.COMFYUI_URL ?? "http://127.0.0.1:8188").replace(/\/+$/, "");
  const body = await readFile(path.join(/* turbopackIgnore: true */ process.cwd(), "workflows", name), "utf8");
  await fetch(`${base}/api/userdata/${encodeURIComponent(`workflows/${name}`)}?overwrite=true`, { method: "POST", body, headers: { "Content-Type": "application/json" } }).catch(() => null);
  redirect(base);
}

function OpenButtons(props: { flows: string[] }) {
  if (!props.flows.length || onCloud()) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {props.flows.map((w) => (
        <form key={w} action={openInComfy}>
          <input type="hidden" name="workflow" value={w} />
          <button type="submit" className="rounded border px-2 py-1 text-foreground hover:bg-muted">Open {w} in Comfy</button>
        </form>
      ))}
    </div>
  );
}

// The support view: one box per expect() step with its state and its picture. A blocked box names
// the missing path; a done box shows the output image. It only reads the project.
export async function FlowCheck(props: { projectId: string; cid?: string }) {
  const p = await getProject(props.projectId);
  if (!p) return null;
  const boxes = await flowBoxes(p, props.cid);
  const lines = await flowLines(p);
  const chain = await flowChain(p, props.cid);
  const takeFile = chain.find((c) => c.id === "take")?.file;
  const use = takeFile ? effectsOf(p.id, takeFile).use : null;
  const clay = chain.some((c) => c.id === "clay" && c.file);
  return (
    <ol className="flex flex-col gap-3" aria-label="Flow check">
      {boxes.map((b) => (
        <li key={b.step} className="flex items-start gap-3 rounded border p-3 text-xs text-muted-foreground">
          {b.output && <FadeImage src={`/api/files/${p.id}/${b.output}`} alt={`${b.step} output`} className="aspect-[768/448] w-32 shrink-0 rounded border bg-muted object-contain" />}
          <div className="flex min-w-0 flex-col gap-1">
            <StatusDot on={!b.blocked} label={b.blocked ? "Blocked" : "Done"} />
            <span className="text-foreground">{b.description}</span>
            <span className="break-all font-mono text-[11px]">{b.workflow}{b.step === "stage" && " · 02_cutout.api.json"}</span>
            {b.blocked && <span className="break-all font-mono text-[11px]">Missing: {b.missing.join(", ")}</span>}
            <OpenButtons flows={b.step === "stage" ? [b.workflow, "02_cutout.api.json"] : []} />
          </div>
        </li>
      ))}
      {chain.map((c) => (
        <li key={c.id} className="flex items-start gap-3 rounded border p-3 text-xs text-muted-foreground">
          {c.image && <FadeImage src={`/api/files/${p.id}/${c.image}`} alt={c.label} className="aspect-[768/448] w-32 shrink-0 rounded border bg-muted object-contain" />}
          <div className="flex min-w-0 flex-col gap-1">
            <StatusDot on={!c.missing} label={c.missing ? "Blocked" : "Done"} />
            <span className="text-foreground">{c.label}{c.feeds && ` feeds ${c.feeds}`}</span>
            {(c.workflow ? [c.workflow] : comfyFlows(c.id, clay)).map((w) => <span key={w} className="break-all font-mono text-[11px]">{w}</span>)}
            <OpenButtons flows={c.workflow ? [] : comfyFlows(c.id, clay)} />
            {c.file && !c.image && <span className="break-all font-mono text-[11px]">{c.file}</span>}
            {c.missing && <span className="break-all font-mono text-[11px]">Missing: {c.missing}</span>}
          </div>
        </li>
      ))}
      {use && (
        <li key="effect" className="flex items-start gap-3 rounded border p-3 text-xs text-muted-foreground">
          <div className="flex min-w-0 flex-col gap-1">
            <StatusDot on label="Done" />
            <span className="text-foreground">Effect {use} on the LTX take</span>
            <span className="break-all font-mono text-[11px]">{EFFECT_FLOW[use]}</span>
            <span className="break-all font-mono text-[11px]">{EFFECT_MODEL}</span>
            <OpenButtons flows={[EFFECT_FLOW[use]]} />
          </div>
        </li>
      )}
      {lines.map((l) => (
        <li key={l.shot} className="flex items-start gap-3 rounded border p-3 text-xs text-muted-foreground">
          {l.frame && <FadeImage src={`/api/files/${p.id}/${l.frame}`} alt={`Last frame of ${l.from}`} className="aspect-[768/448] w-32 shrink-0 rounded border bg-muted object-contain" />}
          <div className="flex min-w-0 flex-col gap-1">
            <StatusDot on={!l.missing} label={l.missing ? "Blocked" : "Done"} />
            <span className="text-foreground">{l.shot} takes {l.from}&apos;s last frame as its first key</span>
            {l.missing && <span className="break-all font-mono text-[11px]">Missing: {l.missing}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}
