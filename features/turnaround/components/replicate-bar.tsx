"use client";

import { useState, useTransition } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/loading-dots";
import { JobStatus } from "@/features/wizard/components/job-status";
import type { Edit, Job, ViewId } from "@/lib/store";
import { cancelTurnaround, replicateEdit } from "../actions/turnaround";

const say = (e: Edit) => (e.kind === "add" ? `+ ${e.change}` : e.kind === "remove" ? `− ${e.what || "selection"}` : `${e.what || "selection"} → ${e.change}`);

// After a fix on one view: repeat the same change on the other views you tick (all by default).
export function ReplicateBar(props: { projectId: string; from: ViewId; edit: Edit; others: { id: ViewId; label: string }[]; job?: Job; locked: boolean }) {
  const [on, setOn] = useState<ViewId[]>(props.others.map((v) => v.id));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const running = props.job?.status === "running";
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex items-center gap-1.5 text-sm">
          <Copy className="size-3.5 text-primary" />
          Replicate <span className="font-mono text-xs text-muted-foreground">{say(props.edit)}</span> on
        </span>
        {props.others.map((v) => (
          <label key={v.id} className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={on.includes(v.id)} onChange={(e) => setOn((o) => (e.target.checked ? [...o, v.id] : o.filter((x) => x !== v.id)))} className="accent-primary" />
            {v.label}
          </label>
        ))}
        <Button
          size="sm"
          className="ml-auto"
          disabled={!on.length || running || pending || props.locked}
          onClick={() => {
            setError(null);
            start(() => replicateEdit(props.projectId, props.from, on).catch((e: Error) => setError(e.message)));
          }}
        >
          {pending && !running ? <LoadingDots /> : `Apply to ${on.length} view${on.length === 1 ? "" : "s"}`}
        </Button>
      </div>
      {running && props.job && <JobStatus message={props.job.detail ?? "Repeating the change"} startedAt={props.job.startedAt} expected={on.length * 35} onCancel={() => cancelTurnaround(props.projectId, "replicate")} />}
      {props.job?.status === "error" && <p className="text-xs text-destructive">{props.job.error}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
