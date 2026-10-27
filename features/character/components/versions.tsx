"use client";

import { useTransition } from "react";
import { cn } from "@/lib/utils";
import type { Version } from "@/lib/store";
import { selectVersion } from "../actions/character";

export function Versions(props: { projectId: string; versions: Version[]; current: number; busy: boolean }) {
  const [pending, start] = useTransition();
  if (props.versions.length < 2) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">Versions</h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {props.versions.map((v, i) => (
          <button
            key={v.image + i}
            type="button"
            disabled={pending || props.busy}
            onClick={() => start(() => selectVersion(props.projectId, i))}
            className={cn(
              "flex w-28 shrink-0 flex-col gap-1.5 text-left",
              i === props.current ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/files/${props.projectId}/${v.image}`}
              alt={v.label}
              className={cn("aspect-[7/9] w-full rounded-md border object-cover", i === props.current && "border-foreground")}
            />
            <span className="truncate text-xs">{v.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
