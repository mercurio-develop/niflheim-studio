import { connection } from "next/server";
import { cn } from "@/lib/utils";

// Filled dot = the Comfy API proxy answers; hollow = it does not. Words, not colours.
export async function ComfyStatus() {
  await connection();
  const base = process.env.COMFY_BASE_URL ?? "http://127.0.0.1:8189";
  let up = false;
  try {
    const res = await fetch(`${base}/api/v2/health`, { signal: AbortSignal.timeout(1500), cache: "no-store" });
    up = res.ok;
  } catch {}
  return (
    <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
      <span className={cn("size-1.5 rounded-full border border-foreground", up && "bg-foreground")} />
      {up ? "comfy online" : "comfy offline"}
    </span>
  );
}
